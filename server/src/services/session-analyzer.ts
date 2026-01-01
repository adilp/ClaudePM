/**
 * Session Analyzer Service
 * Uses Claude Agent SDK to generate summaries, review reports, and activity analysis
 * Automatically uses CLI credentials from ~/.claude/.credentials.json
 */

import { query, type SDKMessage, type SDKResultMessage } from '@anthropic-ai/claude-agent-sdk';
import { TypedEventEmitter } from '../utils/typed-event-emitter.js';
import { exec } from 'child_process';
import { promisify } from 'util';
import { readFile } from 'fs/promises';
import { existsSync } from 'fs';
import { join } from 'path';
import { prisma } from '../config/db.js';
import { sessionSupervisor } from './session-supervisor.js';
import {
  type SessionSummary,
  type SessionAction,
  type FileChange,
  type ReviewReport,
  type ActivityEvent,
  type CommitMessageResult,
  type PrDescriptionResult,
  type SummaryRequest,
  type ReviewReportRequest,
  type CommitMessageRequest,
  type PrDescriptionRequest,
  type SessionAnalyzerConfig,
  type SessionAnalyzerEvents,
  DEFAULT_ANALYZER_CONFIG,
  SessionAnalyzerError,
  AnalysisTimeoutError,
  AnalysisParseError,
} from './session-analyzer-types.js';

const execAsync = promisify(exec);

// ============================================================================
// Session Analyzer Service
// ============================================================================

export class SessionAnalyzer extends TypedEventEmitter<SessionAnalyzerEvents> {
  private config: SessionAnalyzerConfig;
  private started = false;

  constructor(config: Partial<SessionAnalyzerConfig> = {}) {
    super();
    this.config = { ...DEFAULT_ANALYZER_CONFIG, ...config };
  }

  // ==========================================================================
  // Lifecycle
  // ==========================================================================

  start(): void {
    if (this.started) return;
    this.started = true;
  }

  stop(): void {
    if (!this.started) return;
    this.started = false;
    this.removeAllListeners();
  }

  // ==========================================================================
  // Session Summary
  // ==========================================================================

  /**
   * Get a summary for a session (from cache or generate new)
   * @param sessionId - The session ID
   * @param regenerate - If true, force regeneration even if cached
   */
  async generateSummary(sessionId: string, regenerate = false): Promise<SessionSummary> {
    // Check cache first (unless regenerating)
    if (!regenerate) {
      const cached = await this.getCachedSummary(sessionId);
      if (cached) {
        return cached;
      }
    }

    const session = await prisma.session.findUnique({
      where: { id: sessionId },
      include: { ticket: true, project: true },
    });

    if (!session) {
      throw new SessionAnalyzerError(`Session not found: ${sessionId}`, 'SESSION_NOT_FOUND');
    }

    // Gather session output
    const sessionOutput = this.getSessionOutput(sessionId);

    // Get git diff if we have a project
    let gitDiff = '';
    if (session.project) {
      gitDiff = await this.getGitDiff(session.project.repoPath);
    }

    // Get ticket content if associated
    let ticketContent = '';
    if (session.ticket && session.project) {
      ticketContent = await this.getTicketContent(
        session.project.repoPath,
        session.ticket.filePath
      );
    }

    const request: SummaryRequest = {
      sessionId,
      sessionOutput,
      gitDiff,
      ticketContent,
    };

    const summary = await this.executeSummaryAnalysis(request);

    // Cache the result
    await this.saveSummary(summary, session.ticketId);

    return summary;
  }

  /**
   * Get cached summary from database
   */
  private async getCachedSummary(sessionId: string): Promise<SessionSummary | null> {
    const cached = await prisma.sessionSummaryCache.findUnique({
      where: { sessionId },
    });

    if (!cached) {
      return null;
    }

    const result: SessionSummary = {
      sessionId: cached.sessionId,
      headline: cached.headline,
      description: cached.description,
      actions: cached.actions as unknown as SessionAction[],
      filesChanged: cached.filesChanged as unknown as FileChange[],
      status: cached.status as SessionSummary['status'],
      analyzedAt: cached.analyzedAt,
    };

    if (cached.ticketId) {
      result.ticketId = cached.ticketId;
    }

    return result;
  }

  /**
   * Save summary to database cache
   */
  private async saveSummary(summary: SessionSummary, ticketId?: string | null): Promise<void> {
    const actionsJson = JSON.parse(JSON.stringify(summary.actions));
    const filesChangedJson = JSON.parse(JSON.stringify(summary.filesChanged));

    await prisma.sessionSummaryCache.upsert({
      where: { sessionId: summary.sessionId },
      create: {
        sessionId: summary.sessionId,
        ticketId: ticketId ?? null,
        headline: summary.headline,
        description: summary.description,
        actions: actionsJson,
        filesChanged: filesChangedJson,
        status: summary.status as 'completed' | 'in_progress' | 'blocked' | 'failed',
        analyzedAt: summary.analyzedAt,
      },
      update: {
        ticketId: ticketId ?? null,
        headline: summary.headline,
        description: summary.description,
        actions: actionsJson,
        filesChanged: filesChangedJson,
        status: summary.status as 'completed' | 'in_progress' | 'blocked' | 'failed',
        analyzedAt: summary.analyzedAt,
      },
    });
  }

  private async executeSummaryAnalysis(request: SummaryRequest): Promise<SessionSummary> {
    const prompt = this.buildSummaryPrompt(request);

    const response = await this.callClaudeSDK(prompt);
    const parsed = this.parseSummaryResponse(request.sessionId, response);

    this.emit('analysis:summary', parsed);
    return parsed;
  }

  private buildSummaryPrompt(request: SummaryRequest): string {
    return `Analyze this coding session and provide a structured summary.

## Session Output (last ${this.config.outputLinesToAnalyze} lines)
${request.sessionOutput || 'No output available'}

## Git Changes
${request.gitDiff || 'No changes detected'}

${request.ticketContent ? `## Ticket Requirements\n${request.ticketContent}` : ''}

Respond with a JSON object in this exact format:
{
  "headline": "Brief one-line summary (max 80 chars)",
  "description": "Detailed summary in 2-4 sentences",
  "actions": [
    {"type": "read|write|edit|bash|test|other", "description": "What was done", "target": "file or command"}
  ],
  "filesChanged": [
    {"path": "path/to/file", "changeType": "created|modified|deleted", "summary": "Brief description"}
  ],
  "status": "completed|in_progress|blocked|failed"
}

Important:
- Extract actual actions from the session output
- List real files that were changed based on git diff
- Assess status based on evidence in the output
- Be concise but informative`;
  }

  private parseSummaryResponse(sessionId: string, response: string): SessionSummary {
    try {
      // Extract JSON from response (handle markdown code blocks)
      const jsonMatch = response.match(/```(?:json)?\s*([\s\S]*?)```/) || [null, response];
      const jsonStr = jsonMatch[1]?.trim() || response.trim();
      const data = JSON.parse(jsonStr) as {
        headline: string;
        description: string;
        actions: SessionAction[];
        filesChanged: FileChange[];
        status: SessionSummary['status'];
      };

      return {
        sessionId,
        headline: data.headline || 'Session activity',
        description: data.description || 'No description available',
        actions: data.actions || [],
        filesChanged: data.filesChanged || [],
        status: data.status || 'in_progress',
        analyzedAt: new Date(),
      };
    } catch (error) {
      throw new AnalysisParseError(
        `Failed to parse summary response: ${error instanceof Error ? error.message : 'Unknown error'}`,
        response
      );
    }
  }

  // ==========================================================================
  // Review Report
  // ==========================================================================

  /**
   * Generate a detailed review report for a session/ticket (from cache or generate new)
   * @param sessionId - The session ID
   * @param regenerate - If true, force regeneration even if cached
   */
  async generateReviewReport(sessionId: string, regenerate = false): Promise<ReviewReport> {
    // Check cache first (unless regenerating)
    if (!regenerate) {
      const cached = await this.getCachedReviewReport(sessionId);
      if (cached) {
        return cached;
      }
    }

    const session = await prisma.session.findUnique({
      where: { id: sessionId },
      include: { ticket: true, project: true },
    });

    if (!session || !session.ticket || !session.project) {
      throw new SessionAnalyzerError(
        `Session ${sessionId} not found or not associated with a ticket`,
        'INVALID_SESSION'
      );
    }

    const sessionOutput = this.getSessionOutput(sessionId);
    const gitDiff = await this.getGitDiff(session.project.repoPath);
    const ticketContent = await this.getTicketContent(
      session.project.repoPath,
      session.ticket.filePath
    );
    const testOutput = await this.getTestOutput(session.project.repoPath);

    const request: ReviewReportRequest = {
      sessionId,
      ticketId: session.ticket.id,
      ticketTitle: session.ticket.title,
      ticketContent,
      sessionOutput,
      gitDiff,
      testOutput,
    };

    const report = await this.executeReviewAnalysis(request);

    // Cache the result
    await this.saveReviewReport(report);

    return report;
  }

  /**
   * Get cached review report from database
   */
  private async getCachedReviewReport(sessionId: string): Promise<ReviewReport | null> {
    const cached = await prisma.reviewReportCache.findUnique({
      where: { sessionId },
    });

    if (!cached) {
      return null;
    }

    return {
      sessionId: cached.sessionId,
      ticketId: cached.ticketId,
      ticketTitle: cached.ticketTitle,
      completionStatus: cached.completionStatus as ReviewReport['completionStatus'],
      confidence: cached.confidence,
      accomplished: cached.accomplished as string[],
      remaining: cached.remaining as string[],
      concerns: cached.concerns as string[],
      nextSteps: cached.nextSteps as string[],
      suggestedCommitMessage: cached.suggestedCommitMessage ?? undefined,
      suggestedPrDescription: cached.suggestedPrDescription ?? undefined,
      generatedAt: cached.generatedAt,
    };
  }

  /**
   * Save review report to database cache
   */
  private async saveReviewReport(report: ReviewReport): Promise<void> {
    await prisma.reviewReportCache.upsert({
      where: { sessionId: report.sessionId },
      create: {
        sessionId: report.sessionId,
        ticketId: report.ticketId,
        ticketTitle: report.ticketTitle,
        completionStatus: report.completionStatus as 'complete' | 'partial' | 'blocked' | 'unclear',
        confidence: report.confidence,
        accomplished: report.accomplished,
        remaining: report.remaining,
        concerns: report.concerns,
        nextSteps: report.nextSteps,
        suggestedCommitMessage: report.suggestedCommitMessage ?? null,
        suggestedPrDescription: report.suggestedPrDescription ?? null,
        generatedAt: report.generatedAt,
      },
      update: {
        ticketId: report.ticketId,
        ticketTitle: report.ticketTitle,
        completionStatus: report.completionStatus as 'complete' | 'partial' | 'blocked' | 'unclear',
        confidence: report.confidence,
        accomplished: report.accomplished,
        remaining: report.remaining,
        concerns: report.concerns,
        nextSteps: report.nextSteps,
        suggestedCommitMessage: report.suggestedCommitMessage ?? null,
        suggestedPrDescription: report.suggestedPrDescription ?? null,
        generatedAt: report.generatedAt,
      },
    });
  }

  private async executeReviewAnalysis(request: ReviewReportRequest): Promise<ReviewReport> {
    const prompt = this.buildReviewPrompt(request);

    const response = await this.callClaudeSDK(prompt);
    const parsed = this.parseReviewResponse(request, response);

    this.emit('analysis:review', parsed);
    return parsed;
  }

  private buildReviewPrompt(request: ReviewReportRequest): string {
    return `You are reviewing a coding session to determine if a ticket has been completed.

## Ticket: ${request.ticketTitle}
${request.ticketContent}

## Session Output
${request.sessionOutput || 'No output available'}

## Git Changes
${request.gitDiff || 'No changes detected'}

## Test Results
${request.testOutput || 'No test output available'}

Analyze the work done and respond with a JSON object in this exact format:
{
  "completionStatus": "complete|partial|blocked|unclear",
  "confidence": 85,
  "accomplished": ["List of things that were accomplished"],
  "remaining": ["List of things still to be done (if any)"],
  "concerns": ["Any potential issues or concerns"],
  "nextSteps": ["Suggested next steps for the developer"],
  "suggestedCommitMessage": "feat: brief description of changes",
  "suggestedPrDescription": "## Summary\\n\\nBrief description...\\n\\n## Changes\\n\\n- Change 1\\n- Change 2"
}

Important:
- Compare the ticket requirements against the actual changes
- Be specific about what was accomplished
- If tests failed, note that in concerns
- Provide actionable next steps
- Generate conventional commit message (feat/fix/refactor/docs/test/chore)`;
  }

  private parseReviewResponse(request: ReviewReportRequest, response: string): ReviewReport {
    try {
      const jsonMatch = response.match(/```(?:json)?\s*([\s\S]*?)```/) || [null, response];
      const jsonStr = jsonMatch[1]?.trim() || response.trim();
      const data = JSON.parse(jsonStr) as {
        completionStatus: ReviewReport['completionStatus'];
        confidence: number;
        accomplished: string[];
        remaining: string[];
        concerns: string[];
        nextSteps: string[];
        suggestedCommitMessage?: string;
        suggestedPrDescription?: string;
      };

      return {
        sessionId: request.sessionId,
        ticketId: request.ticketId,
        ticketTitle: request.ticketTitle,
        completionStatus: data.completionStatus || 'unclear',
        confidence: data.confidence || 0,
        accomplished: data.accomplished || [],
        remaining: data.remaining || [],
        concerns: data.concerns || [],
        nextSteps: data.nextSteps || [],
        suggestedCommitMessage: data.suggestedCommitMessage,
        suggestedPrDescription: data.suggestedPrDescription,
        generatedAt: new Date(),
      };
    } catch (error) {
      throw new AnalysisParseError(
        `Failed to parse review response: ${error instanceof Error ? error.message : 'Unknown error'}`,
        response
      );
    }
  }

  // ==========================================================================
  // Commit Message Generation
  // ==========================================================================

  /**
   * Generate a commit message from git diff
   */
  async generateCommitMessage(projectPath: string, ticketId?: string): Promise<CommitMessageResult> {
    const gitDiff = await this.getGitDiff(projectPath);

    let ticketContent = '';
    if (ticketId) {
      const ticket = await prisma.ticket.findUnique({
        where: { id: ticketId },
        include: { project: true },
      });
      if (ticket && ticket.project) {
        ticketContent = await this.getTicketContent(ticket.project.repoPath, ticket.filePath);
      }
    }

    const request: CommitMessageRequest = {
      gitDiff,
      ticketContent,
    };

    return this.executeCommitMessageGeneration(request);
  }

  private async executeCommitMessageGeneration(request: CommitMessageRequest): Promise<CommitMessageResult> {
    const prompt = `Generate a conventional commit message for these changes.

## Git Diff
${request.gitDiff || 'No changes'}

${request.ticketContent ? `## Ticket Context\n${request.ticketContent}` : ''}

Respond with a JSON object:
{
  "type": "feat|fix|refactor|docs|test|chore",
  "scope": "optional scope",
  "message": "The full commit message including type and scope",
  "breaking": false
}

Rules:
- Use conventional commits format: type(scope): description
- First line max 72 chars
- Be specific about what changed
- If breaking change, set breaking: true`;

    const response = await this.callClaudeSDK(prompt);

    try {
      const jsonMatch = response.match(/```(?:json)?\s*([\s\S]*?)```/) || [null, response];
      const jsonStr = jsonMatch[1]?.trim() || response.trim();
      const data = JSON.parse(jsonStr) as {
        type: CommitMessageResult['type'];
        scope?: string;
        message: string;
        breaking: boolean;
      };

      return {
        type: data.type || 'chore',
        scope: data.scope,
        message: data.message || 'Update code',
        breaking: data.breaking || false,
      };
    } catch (error) {
      throw new AnalysisParseError(
        `Failed to parse commit message response: ${error instanceof Error ? error.message : 'Unknown error'}`,
        response
      );
    }
  }

  // ==========================================================================
  // PR Description Generation
  // ==========================================================================

  /**
   * Generate a PR description
   */
  async generatePrDescription(
    projectPath: string,
    ticketId: string,
    baseBranch = 'main'
  ): Promise<PrDescriptionResult> {
    const ticket = await prisma.ticket.findUnique({
      where: { id: ticketId },
      include: { project: true },
    });

    if (!ticket || !ticket.project) {
      throw new SessionAnalyzerError(`Ticket not found: ${ticketId}`, 'TICKET_NOT_FOUND');
    }

    const ticketContent = await this.getTicketContent(ticket.project.repoPath, ticket.filePath);
    const gitDiff = await this.getGitDiff(projectPath, baseBranch);
    const commitMessages = await this.getCommitMessages(projectPath, baseBranch);

    const request: PrDescriptionRequest = {
      ticketContent,
      gitDiff,
      commitMessages,
    };

    return this.executePrDescriptionGeneration(request, ticket.title);
  }

  private async executePrDescriptionGeneration(
    request: PrDescriptionRequest,
    ticketTitle: string
  ): Promise<PrDescriptionResult> {
    const prompt = `Generate a pull request description.

## Ticket
${request.ticketContent}

## Git Diff
${request.gitDiff || 'No changes'}

## Commits
${request.commitMessages.join('\n') || 'No commits'}

Respond with a JSON object:
{
  "title": "PR title (max 72 chars)",
  "body": "## Summary\\n\\nDescription...\\n\\n## Changes\\n\\n- Change 1\\n\\n## Testing\\n\\nHow to test...",
  "labels": ["enhancement", "bug", etc]
}

Rules:
- Title should be clear and concise
- Body should use markdown
- Include Summary, Changes, and Testing sections
- Suggest appropriate labels`;

    const response = await this.callClaudeSDK(prompt);

    try {
      const jsonMatch = response.match(/```(?:json)?\s*([\s\S]*?)```/) || [null, response];
      const jsonStr = jsonMatch[1]?.trim() || response.trim();
      const data = JSON.parse(jsonStr) as {
        title: string;
        body: string;
        labels: string[];
      };

      return {
        title: data.title || ticketTitle,
        body: data.body || '## Summary\n\nNo description provided.',
        labels: data.labels || [],
      };
    } catch (error) {
      throw new AnalysisParseError(
        `Failed to parse PR description response: ${error instanceof Error ? error.message : 'Unknown error'}`,
        response
      );
    }
  }

  // ==========================================================================
  // Parse Session Output for Activity Events
  // ==========================================================================

  /**
   * Parse session output and extract activity events
   */
  parseActivityFromOutput(sessionId: string, output: string): ActivityEvent[] {
    const events: ActivityEvent[] = [];
    const lines = output.split('\n');
    const now = new Date();

    // Pattern matchers for common Claude Code activities
    const patterns = [
      { regex: /Reading\s+(.+)/, type: 'tool_use' as const, tool: 'Read' },
      { regex: /Writing\s+(.+)/, type: 'tool_use' as const, tool: 'Write' },
      { regex: /Editing\s+(.+)/, type: 'tool_use' as const, tool: 'Edit' },
      { regex: /Running:\s*(.+)/, type: 'tool_use' as const, tool: 'Bash' },
      { regex: /\$\s+(.+)/, type: 'tool_use' as const, tool: 'Bash' },
      { regex: /Searching\s+(.+)/, type: 'tool_use' as const, tool: 'Grep' },
      { regex: /---TASK_COMPLETE---/, type: 'milestone' as const, tool: undefined },
    ];

    for (const line of lines) {
      for (const pattern of patterns) {
        const match = line.match(pattern.regex);
        if (match) {
          events.push({
            sessionId,
            type: pattern.type,
            tool: pattern.tool,
            description: pattern.type === 'milestone' ? 'Task completed' : match[1] || line,
            timestamp: now,
          });
          break;
        }
      }
    }

    return events;
  }

  // ==========================================================================
  // Claude SDK Integration
  // ==========================================================================

  /**
   * Call Claude using the Agent SDK
   * Uses CLI credentials automatically from ~/.claude/.credentials.json
   */
  private async callClaudeSDK(prompt: string): Promise<string> {
    const abortController = new AbortController();

    // Set up timeout
    const timeoutId = setTimeout(() => {
      abortController.abort();
    }, this.config.timeoutMs);

    try {
      console.log('[SessionAnalyzer] Calling Claude SDK with model:', this.config.model);
      const stream = query({
        prompt,
        options: {
          model: this.config.model,
          maxTurns: 1,
          abortController,
          // Disable all tools - we just want text analysis
          tools: [],
          // Auto-allow everything since no tools are used anyway
          permissionMode: 'default',
        },
      });

      let resultText = '';

      for await (const msg of stream) {
        if (msg.type === 'result') {
          const resultMsg = msg as SDKResultMessage;
          if (resultMsg.subtype === 'success') {
            resultText = resultMsg.result;
          } else if ('errors' in resultMsg) {
            throw new SessionAnalyzerError(
              `Analysis failed: ${resultMsg.errors.join(', ')}`,
              'ANALYSIS_ERROR'
            );
          }
        } else if (msg.type === 'assistant' && 'message' in msg) {
          // Extract text from assistant message content
          const assistantMsg = msg as SDKMessage & { message: { content: Array<{ type: string; text?: string }> } };
          for (const block of assistantMsg.message.content) {
            if (block.type === 'text' && block.text) {
              resultText += block.text;
            }
          }
        }
      }

      if (!resultText) {
        throw new SessionAnalyzerError('No response from Claude', 'NO_RESPONSE');
      }

      return resultText;
    } catch (error) {
      console.error('[SessionAnalyzer] Claude SDK error:', error);
      if (error instanceof SessionAnalyzerError) {
        throw error;
      }
      if (abortController.signal.aborted) {
        throw new AnalysisTimeoutError(this.config.timeoutMs);
      }
      const errorMessage = error instanceof Error ? error.message : String(error);
      throw new SessionAnalyzerError(
        `Claude SDK error: ${errorMessage}`,
        'SDK_ERROR'
      );
    } finally {
      clearTimeout(timeoutId);
    }
  }

  // ==========================================================================
  // Helper Methods
  // ==========================================================================

  private getSessionOutput(sessionId: string): string {
    try {
      const lines = sessionSupervisor.getSessionOutput(sessionId, this.config.outputLinesToAnalyze);
      return lines.join('\n');
    } catch {
      return '';
    }
  }

  private async getGitDiff(repoPath: string, baseBranch?: string): Promise<string> {
    try {
      // Determine base branch if not provided
      let base = baseBranch;
      if (!base) {
        base = await this.detectBaseBranch(repoPath);
      }

      // Compare against base branch, excluding markdown files
      const diffCmd = `git diff ${base}...HEAD -- . ":(exclude)*.md"`;

      const { stdout } = await execAsync(diffCmd, {
        cwd: repoPath,
        timeout: 10000,
        maxBuffer: 1024 * 1024,
      });

      const diff = stdout.trim();
      if (diff.length > 50000) {
        return diff.substring(0, 50000) + '\n... [diff truncated]';
      }
      return diff || 'No changes detected';
    } catch {
      return 'Git diff not available';
    }
  }

  private async detectBaseBranch(repoPath: string): Promise<string> {
    try {
      // Try to get the default branch from remote
      const { stdout } = await execAsync(
        'git symbolic-ref refs/remotes/origin/HEAD 2>/dev/null | sed "s@^refs/remotes/origin/@@"',
        { cwd: repoPath, timeout: 5000 }
      );
      const branch = stdout.trim();
      if (branch) return branch;
    } catch {
      // Fallback: check if main or master exists
    }

    try {
      // Check if 'main' exists
      await execAsync('git rev-parse --verify main', { cwd: repoPath, timeout: 5000 });
      return 'main';
    } catch {
      // Fall back to 'master'
      return 'master';
    }
  }

  private async getTicketContent(repoPath: string, filePath: string): Promise<string> {
    const absolutePath = join(repoPath, filePath);
    if (!existsSync(absolutePath)) {
      return '';
    }

    try {
      return await readFile(absolutePath, 'utf-8');
    } catch {
      return '';
    }
  }

  private async getTestOutput(repoPath: string): Promise<string> {
    const testPaths = ['test-results.txt', 'test-output.txt', '.test-results'];

    for (const testPath of testPaths) {
      const fullPath = join(repoPath, testPath);
      if (existsSync(fullPath)) {
        try {
          const content = await readFile(fullPath, 'utf-8');
          return content.length > 10000
            ? content.substring(0, 10000) + '\n... [truncated]'
            : content;
        } catch {
          continue;
        }
      }
    }

    return '';
  }

  private async getCommitMessages(repoPath: string, baseBranch: string): Promise<string[]> {
    try {
      const { stdout } = await execAsync(
        `git log ${baseBranch}..HEAD --pretty=format:"%s"`,
        { cwd: repoPath, timeout: 5000 }
      );
      return stdout.trim().split('\n').filter(Boolean);
    } catch {
      return [];
    }
  }
}

// ============================================================================
// Singleton Export
// ============================================================================

export const sessionAnalyzer = new SessionAnalyzer();

// Re-export types
export * from './session-analyzer-types.js';
