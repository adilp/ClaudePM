/**
 * Sessions API Router
 * Endpoints for managing Claude Code sessions
 */

import { Router, Request, Response, NextFunction } from 'express';
import { ZodError } from 'zod';
import {
  sessionIdSchema,
  projectIdSchema,
  startSessionSchema,
  startTicketSessionSchema,
  sendInputSchema,
  sendKeysSchema,
  stopSessionSchema,
  outputQuerySchema,
  type SessionResponse,
  type SessionOutputResponse,
  type ErrorResponse,
  type MessageResponse,
} from './sessions-schemas.js';
import {
  sessionSupervisor,
  SessionNotFoundError,
  SessionProjectNotFoundError,
  SessionTicketNotFoundError,
  SessionAlreadyRunningError,
  SessionNotRunningError,
  SessionCreationError,
  SessionInputError,
  type SessionInfo,
} from '../services/session-supervisor.js';
import {
  sessionAnalyzer,
  SessionAnalyzerError,
  AnalysisTimeoutError,
  AnalysisParseError,
} from '../services/session-analyzer.js';
import type { Session } from '../generated/prisma/index.js';

const router = Router();

// ============================================================================
// Helpers
// ============================================================================

/**
 * Convert Session or SessionInfo to API response format
 */
function toSessionResponse(session: Session | SessionInfo): SessionResponse {
  return {
    id: session.id,
    project_id: session.projectId,
    ticket_id: session.ticketId,
    type: session.type,
    status: session.status,
    context_percent: session.contextPercent,
    pane_id: 'paneId' in session ? session.paneId : session.tmuxPaneId,
    started_at: session.startedAt?.toISOString() ?? null,
    ended_at: session.endedAt?.toISOString() ?? null,
    created_at: session.createdAt.toISOString(),
    updated_at: session.updatedAt.toISOString(),
  };
}

/**
 * Format Zod validation errors
 */
function formatZodError(error: ZodError): ErrorResponse {
  const details: Record<string, string[]> = {};
  for (const issue of error.issues) {
    const path = issue.path.join('.');
    details[path] ??= [];
    details[path].push(issue.message);
  }
  return {
    error: 'Validation error',
    details,
  };
}

/**
 * Error handler for session routes
 */
function handleSessionError(err: Error, res: Response<ErrorResponse>): void {
  if (err instanceof ZodError) {
    res.status(400).json(formatZodError(err));
    return;
  }

  if (err instanceof SessionNotFoundError) {
    res.status(404).json({ error: err.message });
    return;
  }

  if (err instanceof SessionProjectNotFoundError) {
    res.status(404).json({ error: err.message });
    return;
  }

  if (err instanceof SessionTicketNotFoundError) {
    res.status(404).json({ error: err.message });
    return;
  }

  if (err instanceof SessionAlreadyRunningError) {
    res.status(409).json({ error: err.message });
    return;
  }

  if (err instanceof SessionNotRunningError) {
    res.status(400).json({ error: err.message });
    return;
  }

  if (err instanceof SessionCreationError) {
    res.status(500).json({ error: err.message });
    return;
  }

  if (err instanceof SessionInputError) {
    res.status(400).json({ error: err.message });
    return;
  }

  // Log unexpected errors
  console.error('Unexpected error in sessions API:', err);
  res.status(500).json({ error: 'Internal server error' });
}

/**
 * Async handler wrapper
 */
function asyncHandler<T>(
  fn: (req: Request, res: Response<T>, next: NextFunction) => Promise<void>
) {
  return (req: Request, res: Response<T>, next: NextFunction): void => {
    Promise.resolve(fn(req, res, next)).catch((err) => {
      handleSessionError(err as Error, res as Response<ErrorResponse>);
    });
  };
}

// ============================================================================
// Routes
// ============================================================================

/**
 * GET /api/sessions
 * List all sessions, optionally filtered by project
 *
 * Query params:
 * - project_id: Filter by project (optional)
 */
router.get(
  '/sessions',
  asyncHandler<SessionResponse[] | ErrorResponse>(async (req, res) => {
    const projectId = req.query.project_id as string | undefined;

    const sessions = await sessionSupervisor.listSessions(projectId);

    res.json(sessions.map(toSessionResponse));
  })
);

/**
 * POST /api/projects/:id/sessions
 * Start a new session for a project
 *
 * Body options:
 * - ticket_id: Start a ticket session (optional)
 * - initial_prompt: Custom initial prompt (optional)
 * - cwd: Working directory override (optional)
 */
router.post(
  '/projects/:id/sessions',
  asyncHandler<SessionResponse | ErrorResponse>(async (req, res) => {
    const { id: projectId } = projectIdSchema.parse(req.params);

    // Check if this is a ticket session or ad-hoc
    // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
    if (req.body.ticket_id) {
      const input = startTicketSessionSchema.parse(req.body);

      // Build options conditionally to handle undefined
      const options: Parameters<typeof sessionSupervisor.startTicketSession>[0] = {
        projectId,
        ticketId: input.ticket_id,
      };
      if (input.initial_prompt !== undefined) {
        options.initialPrompt = input.initial_prompt;
      }
      if (input.cwd !== undefined) {
        options.cwd = input.cwd;
      }

      const session = await sessionSupervisor.startTicketSession(options);

      res.status(201).json(toSessionResponse(session));
    } else {
      const input = startSessionSchema.parse(req.body);

      // Build options conditionally to handle undefined
      const options: Parameters<typeof sessionSupervisor.startSession>[0] = {
        projectId,
      };
      if (input.initial_prompt !== undefined) {
        options.initialPrompt = input.initial_prompt;
      }
      if (input.cwd !== undefined) {
        options.cwd = input.cwd;
      }

      const session = await sessionSupervisor.startSession(options);

      res.status(201).json(toSessionResponse(session));
    }
  })
);

/**
 * GET /api/sessions/:id
 * Get session details
 */
router.get(
  '/sessions/:id',
  asyncHandler<SessionResponse | ErrorResponse>(async (req, res) => {
    const { id } = sessionIdSchema.parse(req.params);

    const session = await sessionSupervisor.getSession(id);

    res.json(toSessionResponse(session));
  })
);

/**
 * POST /api/sessions/:id/stop
 * Stop a running session
 *
 * Body options:
 * - force: Force kill without grace period (optional, default false)
 */
router.post(
  '/sessions/:id/stop',
  asyncHandler<MessageResponse | ErrorResponse>(async (req, res) => {
    const { id } = sessionIdSchema.parse(req.params);
    const { force } = stopSessionSchema.parse(req.body);

    await sessionSupervisor.stopSession(id, force);

    res.json({ message: 'Session stopped successfully' });
  })
);

/**
 * POST /api/sessions/:id/input
 * Send input to a running session
 *
 * Body:
 * - input: Text to send to the session (required)
 */
router.post(
  '/sessions/:id/input',
  asyncHandler<MessageResponse | ErrorResponse>(async (req, res) => {
    const { id } = sessionIdSchema.parse(req.params);
    const { input } = sendInputSchema.parse(req.body);

    await sessionSupervisor.sendInput(id, input);

    res.json({ message: 'Input sent successfully' });
  })
);

/**
 * POST /api/sessions/:id/keys
 * Send keys to a session (for mobile scroll controls, special keys, etc.)
 * Uses ttyd WebSocket if available, falls back to tmux send-keys
 *
 * Body:
 * - keys: Key sequence to send (e.g., "C-a [", "C-u", "q")
 */
router.post(
  '/sessions/:id/keys',
  asyncHandler<MessageResponse | ErrorResponse>(async (req, res) => {
    const { id } = sessionIdSchema.parse(req.params);
    const { keys } = sendKeysSchema.parse(req.body);

    // Try ttyd first (sends directly to terminal via WebSocket)
    if (ttydManager.isRunning(id)) {
      try {
        await ttydManager.sendKeys(id, keys);
        res.json({ message: 'Keys sent via ttyd' });
        return;
      } catch (err) {
        console.warn(`[Sessions API] ttyd sendKeys failed, falling back to tmux:`, err);
      }
    }

    // Fallback to tmux send-keys
    await sessionSupervisor.sendKeys(id, keys);
    res.json({ message: 'Keys sent via tmux' });
  })
);

/**
 * GET /api/sessions/:id/output
 * Get recent output from a session
 *
 * Query params:
 * - lines: Number of lines to retrieve (optional, default 100, max 10000)
 */
router.get(
  '/sessions/:id/output',
  (req, res: Response<SessionOutputResponse | ErrorResponse>) => {
    try {
      const { id } = sessionIdSchema.parse(req.params);
      const { lines } = outputQuerySchema.parse(req.query);

      const output = sessionSupervisor.getSessionOutput(id, lines);

      res.json({
        session_id: id,
        lines: output,
        total_lines: output.length,
      });
    } catch (err) {
      handleSessionError(err as Error, res);
    }
  }
);

/**
 * POST /api/sessions/sync
 * Sync session state with tmux reality - cleans up orphaned sessions
 *
 * Query params:
 * - project_id: Optional project ID to limit sync scope
 */
router.post(
  '/sessions/sync',
  asyncHandler(async (req, res) => {
    const projectId = req.query.project_id as string | undefined;

    const result = await sessionSupervisor.syncSessions(projectId);

    res.json({
      message: `Synced ${result.totalChecked} sessions`,
      orphaned_sessions: result.orphanedSessions.map((s) => ({
        session_id: s.sessionId,
        pane_id: s.paneId,
      })),
      alive_sessions: result.aliveSessions.map((s) => ({
        session_id: s.sessionId,
        pane_id: s.paneId,
        pane_title: s.paneTitle,
      })),
      total_checked: result.totalChecked,
      orphaned_count: result.orphanedSessions.length,
    });
  })
);

// ============================================================================
// Session Analysis Endpoints (Anthropic SDK-powered)
// ============================================================================

/**
 * Handle session analyzer errors
 */
function handleAnalyzerError(err: Error, res: Response<ErrorResponse>): void {
  if (err instanceof AnalysisTimeoutError) {
    res.status(504).json({ error: err.message });
  } else if (err instanceof AnalysisParseError) {
    res.status(500).json({ error: `Failed to parse analysis response: ${err.rawOutput.substring(0, 200)}` });
  } else if (err instanceof SessionAnalyzerError) {
    res.status(400).json({ error: err.message });
  } else {
    res.status(500).json({ error: 'Internal server error' });
  }
}

/**
 * Get session summary
 * GET /sessions/:id/summary
 *
 * Query params:
 * - regenerate: If 'true', force regeneration even if cached
 */
router.get(
  '/sessions/:id/summary',
  asyncHandler(async (req, res) => {
    try {
      const { id } = sessionIdSchema.parse(req.params);
      const regenerate = req.query.regenerate === 'true';
      const summary = await sessionAnalyzer.generateSummary(id, regenerate);

      res.json({
        session_id: summary.sessionId,
        ticket_id: summary.ticketId,
        headline: summary.headline,
        description: summary.description,
        actions: summary.actions,
        files_changed: summary.filesChanged,
        status: summary.status,
        analyzed_at: summary.analyzedAt.toISOString(),
      });
    } catch (err) {
      handleAnalyzerError(err as Error, res);
    }
  })
);

/**
 * Get review report for a session
 * GET /sessions/:id/review-report
 *
 * Query params:
 * - regenerate: If 'true', force regeneration even if cached
 */
router.get(
  '/sessions/:id/review-report',
  asyncHandler(async (req, res) => {
    try {
      const { id } = sessionIdSchema.parse(req.params);
      const regenerate = req.query.regenerate === 'true';
      const report = await sessionAnalyzer.generateReviewReport(id, regenerate);

      res.json({
        session_id: report.sessionId,
        ticket_id: report.ticketId,
        ticket_title: report.ticketTitle,
        completion_status: report.completionStatus,
        confidence: report.confidence,
        accomplished: report.accomplished,
        remaining: report.remaining,
        concerns: report.concerns,
        next_steps: report.nextSteps,
        suggested_commit_message: report.suggestedCommitMessage,
        suggested_pr_description: report.suggestedPrDescription,
        generated_at: report.generatedAt.toISOString(),
      });
    } catch (err) {
      handleAnalyzerError(err as Error, res);
    }
  })
);

/**
 * Generate commit message for a session's changes
 * POST /sessions/:id/commit-message
 */
router.post(
  '/sessions/:id/commit-message',
  asyncHandler(async (req, res) => {
    try {
      const { id } = sessionIdSchema.parse(req.params);

      // Get session to find project path
      const session = await sessionSupervisor.getSession(id);
      if (!session) {
        res.status(404).json({ error: 'Session not found' });
        return;
      }

      // Get project info
      const { prisma } = await import('../config/db.js');
      const dbSession = await prisma.session.findUnique({
        where: { id },
        include: { project: true },
      });

      if (!dbSession?.project) {
        res.status(400).json({ error: 'Session not associated with a project' });
        return;
      }

      const result = await sessionAnalyzer.generateCommitMessage(
        dbSession.project.repoPath,
        dbSession.ticketId ?? undefined
      );

      res.json({
        message: result.message,
        type: result.type,
        scope: result.scope,
        breaking: result.breaking,
      });
    } catch (err) {
      handleAnalyzerError(err as Error, res);
    }
  })
);

/**
 * Generate PR description for a session's work
 * POST /sessions/:id/pr-description
 */
router.post(
  '/sessions/:id/pr-description',
  asyncHandler(async (req, res) => {
    try {
      const { id } = sessionIdSchema.parse(req.params);
      const baseBranch = (req.query.base_branch as string) || 'main';

      // Get session with project and ticket
      const { prisma } = await import('../config/db.js');
      const session = await prisma.session.findUnique({
        where: { id },
        include: { project: true, ticket: true },
      });

      if (!session?.project) {
        res.status(400).json({ error: 'Session not associated with a project' });
        return;
      }

      if (!session.ticketId) {
        res.status(400).json({ error: 'Session not associated with a ticket' });
        return;
      }

      const result = await sessionAnalyzer.generatePrDescription(
        session.project.repoPath,
        session.ticketId,
        baseBranch
      );

      res.json({
        title: result.title,
        body: result.body,
        labels: result.labels,
      });
    } catch (err) {
      handleAnalyzerError(err as Error, res);
    }
  })
);

/**
 * Parse activity events from session output
 * GET /sessions/:id/activity
 */
router.get(
  '/sessions/:id/activity',
  asyncHandler(async (req, res) => {
    try {
      const { id } = sessionIdSchema.parse(req.params);
      const lines = parseInt(req.query.lines as string) || 100;

      // Get session output
      const output = sessionSupervisor.getSessionOutput(id, lines);
      const events = sessionAnalyzer.parseActivityFromOutput(id, output.join('\n'));

      res.json({
        session_id: id,
        events: events.map((e) => ({
          type: e.type,
          tool: e.tool,
          description: e.description,
          timestamp: e.timestamp.toISOString(),
        })),
        line_count: output.length,
      });
    } catch (err) {
      if (err instanceof SessionNotFoundError) {
        res.status(404).json({ error: 'Session not found' });
      } else {
        handleAnalyzerError(err as Error, res);
      }
    }
  })
);

// ============================================================================
// ttyd Terminal Endpoints
// ============================================================================

import {
  ttydManager,
  TtydSessionNotFoundError,
  TtydAlreadyRunningError,
  TtydError,
} from '../services/ttyd-manager.js';

/**
 * Get or start ttyd for a session
 * POST /sessions/:id/ttyd
 * Returns the ttyd URL and port
 */
router.post(
  '/sessions/:id/ttyd',
  asyncHandler(async (req, res) => {
    try {
      const { id } = sessionIdSchema.parse(req.params);

      const instance = await ttydManager.getOrStart(id);

      // Use origin/referer to get the actual client host (Vite proxy changes Host header)
      const origin = req.get('origin') || req.get('referer');
      let host = 'localhost';
      if (origin) {
        try {
          host = new URL(origin).hostname;
        } catch {
          host = req.get('host')?.split(':')[0] ?? 'localhost';
        }
      }

      res.json({
        session_id: id,
        port: instance.port,
        url: `http://${host}:${instance.port}`,
        ws_url: `ws://${host}:${instance.port}/ws`,
      });
    } catch (err) {
      if (err instanceof TtydSessionNotFoundError) {
        res.status(404).json({ error: err.message });
      } else if (err instanceof TtydError) {
        res.status(400).json({ error: err.message });
      } else {
        throw err;
      }
    }
  })
);

/**
 * Get ttyd status for a session
 * GET /sessions/:id/ttyd
 */
router.get(
  '/sessions/:id/ttyd',
  asyncHandler(async (req, res) => {
    const { id } = sessionIdSchema.parse(req.params);

    const instance = ttydManager.getInstance(id);

    if (!instance) {
      res.json({
        session_id: id,
        running: false,
      });
      return;
    }

    // Use origin/referer to get the actual client host (Vite proxy changes Host header)
    const origin = req.get('origin') || req.get('referer');
    let host = 'localhost';
    if (origin) {
      try {
        host = new URL(origin).hostname;
      } catch {
        host = req.get('host')?.split(':')[0] ?? 'localhost';
      }
    }

    res.json({
      session_id: id,
      running: true,
      port: instance.port,
      url: `http://${host}:${instance.port}`,
      ws_url: `ws://${host}:${instance.port}/ws`,
      created_at: instance.createdAt.toISOString(),
    });
  })
);

/**
 * Stop ttyd for a session
 * DELETE /sessions/:id/ttyd
 */
router.delete(
  '/sessions/:id/ttyd',
  asyncHandler(async (req, res) => {
    const { id } = sessionIdSchema.parse(req.params);

    ttydManager.stop(id);

    res.json({
      session_id: id,
      message: 'ttyd stopped',
    });
  })
);

/**
 * Focus/select tmux pane for a session
 * POST /sessions/:id/focus
 * Selects and zooms the tmux pane associated with the session
 */
router.post(
  '/sessions/:id/focus',
  asyncHandler(async (req, res) => {
    const { id } = sessionIdSchema.parse(req.params);

    // Get session from database to find pane ID
    const { prisma } = await import('../config/db.js');
    const session = await prisma.session.findUnique({
      where: { id },
    });

    if (!session) {
      res.status(404).json({ error: 'Session not found' });
      return;
    }

    const paneId = session.tmuxPaneId;
    if (!paneId || !paneId.startsWith('%')) {
      res.status(400).json({ error: 'Session has no valid pane ID' });
      return;
    }

    // Select and zoom the pane
    const tmuxPath = process.env.TMUX_PATH ?? '/usr/local/bin/tmux';
    const { execSync } = await import('child_process');

    // Select the pane first
    try {
      execSync(`${tmuxPath} select-pane -t ${paneId}`, { env: { ...process.env, TMUX: '' } });
    } catch (e) {
      console.error(`[Sessions API] Failed to select pane ${paneId}:`, e);
      res.status(500).json({ error: 'Failed to select pane' });
      return;
    }

    // Check if pane is already zoomed using window_zoomed_flag
    try {
      const isZoomed = execSync(
        `${tmuxPath} display-message -t ${paneId} -p '#{window_zoomed_flag}'`,
        { env: { ...process.env, TMUX: '' }, encoding: 'utf8' }
      ).trim();

      // Only zoom if not already zoomed
      if (isZoomed !== '1') {
        execSync(`${tmuxPath} resize-pane -Z -t ${paneId}`, { env: { ...process.env, TMUX: '' } });
        console.log(`[Sessions API] Pane ${paneId} zoomed`);
      } else {
        console.log(`[Sessions API] Pane ${paneId} already zoomed`);
      }

      res.json({
        session_id: id,
        pane_id: paneId,
        message: 'Pane focused and zoomed',
      });
    } catch (e) {
      console.error(`[Sessions API] Failed to zoom pane ${paneId}:`, e);
      res.status(500).json({ error: 'Failed to zoom pane' });
    }
  })
);

/**
 * POST /api/sessions/:id/scroll
 * Control terminal scrolling (mobile-friendly)
 *
 * Body:
 * - action: "up" | "down" | "enter" | "exit"
 */
router.post(
  '/sessions/:id/scroll',
  asyncHandler<MessageResponse | ErrorResponse>(async (req, res) => {
    const { id } = sessionIdSchema.parse(req.params);
    const action = req.body.action as string;

    if (!['up', 'down', 'enter', 'exit'].includes(action)) {
      res.status(400).json({ error: 'Invalid action. Use: up, down, enter, exit' });
      return;
    }

    // Get session to find pane ID
    const { prisma } = await import('../config/db.js');
    const session = await prisma.session.findUnique({ where: { id } });
    if (!session?.tmuxPaneId) {
      res.status(404).json({ error: 'Session or pane not found' });
      return;
    }

    const paneId = session.tmuxPaneId;
    const { enterCopyMode, exitCopyMode, scrollUp, scrollDown, isInCopyMode } = await import('../services/tmux.js');

    try {
      switch (action) {
        case 'enter':
          await enterCopyMode(paneId);
          res.json({ message: 'Entered copy mode' });
          break;
        case 'exit':
          await exitCopyMode(paneId);
          res.json({ message: 'Exited copy mode' });
          break;
        case 'up':
          // Auto-enter copy mode if not already in it
          if (!(await isInCopyMode(paneId))) {
            await enterCopyMode(paneId);
          }
          await scrollUp(paneId);
          res.json({ message: 'Scrolled up' });
          break;
        case 'down':
          // Auto-enter copy mode if not already in it (same as 'up')
          if (!(await isInCopyMode(paneId))) {
            await enterCopyMode(paneId);
          }
          await scrollDown(paneId);
          res.json({ message: 'Scrolled down' });
          break;
      }
    } catch (err) {
      console.error('[Scroll API] Error:', err);
      res.status(500).json({ error: 'Failed to execute scroll action' });
    }
  })
);

export default router;
