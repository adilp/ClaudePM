/**
 * Context Monitor Service
 * Monitors Claude Code JSONL transcript files to extract context usage
 */

import { EventEmitter } from 'events';
import { promises as fs } from 'fs';
import { watch, type FSWatcher } from 'fs';
import { homedir } from 'os';
import { join, dirname } from 'path';
import { prisma } from '../config/db.js';
import { env } from '../config/env.js';
import {
  MAX_CONTEXT_TOKENS,
  DEFAULT_THRESHOLD_PERCENT,
  FILE_POLL_INTERVAL,
  UPDATE_DEBOUNCE_MS,
  type UsageData,
  type TranscriptEntry,
  type ClaudeSessionState,
  type ContextUpdateEvent,
  type ContextThresholdEvent,
  type ClaudeStateChangeEvent,
  type MonitoredSession,
  type StartMonitoringOptions,
  TranscriptNotFoundError,
  SessionNotMonitoredError,
  SessionAlreadyMonitoredError,
  TranscriptDiscoveryError,
  ContextMonitorError,
} from './context-monitor-types.js';

// ============================================================================
// Configuration
// ============================================================================

/** Threshold percentage for low context notification (remaining percentage) */
const CONTEXT_THRESHOLD_PERCENT = env.HANDOFF_THRESHOLD_PERCENT ?? DEFAULT_THRESHOLD_PERCENT;

// ============================================================================
// Context Monitor Events Interface
// ============================================================================

/**
 * Event emitter interface for type-safe event handling
 */
export interface ContextMonitorEvents {
  'context:update': (event: ContextUpdateEvent) => void;
  'context:threshold': (event: ContextThresholdEvent) => void;
  'claude:stateChange': (event: ClaudeStateChangeEvent) => void;
  'error': (error: Error, sessionId?: string) => void;
}

// ============================================================================
// Context Monitor Class
// ============================================================================

/**
 * Context Monitor watches JSONL transcript files and extracts context usage
 *
 * Emits events:
 * - 'context:update' - When context percentage changes
 * - 'context:threshold' - When remaining context falls below threshold
 * - 'claude:stateChange' - When Claude's session state changes
 * - 'error' - When an error occurs during monitoring
 */
export class ContextMonitor extends EventEmitter {
  /** Map of session ID to monitored session data */
  private sessions: Map<string, MonitoredSession> = new Map();

  /** File watchers by session ID */
  private watchers: Map<string, FSWatcher> = new Map();

  /** Debounce timers for context updates */
  private debounceTimers: Map<string, ReturnType<typeof setTimeout>> = new Map();

  /** Whether the monitor is running */
  private running: boolean = false;

  /** Polling intervals for sessions that need polling */
  private pollingIntervals: Map<string, ReturnType<typeof setInterval>> = new Map();

  constructor() {
    super();
  }

  // ==========================================================================
  // Lifecycle Management
  // ==========================================================================

  /**
   * Start the context monitor
   */
  start(): void {
    if (this.running) {
      return;
    }
    this.running = true;
  }

  /**
   * Stop the context monitor and clean up all watchers
   */
  stop(): void {
    this.running = false;

    // Stop all watchers
    for (const [sessionId] of this.sessions) {
      this.stopMonitoringInternal(sessionId);
    }

    this.sessions.clear();
    this.watchers.clear();
    this.debounceTimers.clear();
    this.pollingIntervals.clear();
  }

  /**
   * Check if the monitor is running
   */
  isRunning(): boolean {
    return this.running;
  }

  // ==========================================================================
  // Monitoring Operations
  // ==========================================================================

  /**
   * Start monitoring a session's transcript file
   */
  async startMonitoring(options: StartMonitoringOptions): Promise<void> {
    const { sessionId, transcriptPath, projectId } = options;

    // Check if already monitoring
    if (this.sessions.has(sessionId)) {
      throw new SessionAlreadyMonitoredError(sessionId);
    }

    // Discover or validate transcript path
    let resolvedPath: string;
    if (transcriptPath) {
      resolvedPath = this.expandPath(transcriptPath);
    } else if (projectId) {
      resolvedPath = await this.discoverTranscriptPath(sessionId, projectId);
    } else {
      throw new TranscriptDiscoveryError(sessionId, 'No transcript path or project ID provided');
    }

    // Verify file exists
    try {
      await fs.access(resolvedPath);
    } catch {
      throw new TranscriptNotFoundError(resolvedPath);
    }

    // Get initial file size
    const stats = await fs.stat(resolvedPath);
    const initialPosition = stats.size;

    // Create abort controller for this session
    const abortController = new AbortController();

    // Create monitored session entry
    const monitoredSession: MonitoredSession = {
      sessionId,
      transcriptPath: resolvedPath,
      filePosition: initialPosition,
      contextPercent: 0,
      totalTokens: 0,
      claudeState: 'unknown',
      abortController,
      lastUsage: null,
      thresholdNotified: false,
    };

    this.sessions.set(sessionId, monitoredSession);

    // Parse existing content to get current state
    await this.parseExistingContent(sessionId);

    // Start watching for changes
    this.startWatching(sessionId, resolvedPath);
  }

  /**
   * Stop monitoring a session
   */
  stopMonitoring(sessionId: string): void {
    if (!this.sessions.has(sessionId)) {
      throw new SessionNotMonitoredError(sessionId);
    }

    this.stopMonitoringInternal(sessionId);
    this.sessions.delete(sessionId);
  }

  /**
   * Get current context information for a session
   */
  getSessionContext(sessionId: string): { contextPercent: number; totalTokens: number; claudeState: ClaudeSessionState } {
    const session = this.sessions.get(sessionId);
    if (!session) {
      throw new SessionNotMonitoredError(sessionId);
    }

    return {
      contextPercent: session.contextPercent,
      totalTokens: session.totalTokens,
      claudeState: session.claudeState,
    };
  }

  /**
   * Check if a session is being monitored
   */
  isMonitoring(sessionId: string): boolean {
    return this.sessions.has(sessionId);
  }

  /**
   * Get all monitored session IDs
   */
  getMonitoredSessions(): string[] {
    return Array.from(this.sessions.keys());
  }

  /**
   * Manually trigger a transcript parse for a session
   * Useful for testing or when file watcher events are missed
   */
  async refreshSession(sessionId: string): Promise<void> {
    const session = this.sessions.get(sessionId);
    if (!session) {
      throw new SessionNotMonitoredError(sessionId);
    }

    await this.processNewContent(sessionId);
  }

  // ==========================================================================
  // Internal Methods
  // ==========================================================================

  /**
   * Expand ~ to home directory
   */
  private expandPath(path: string): string {
    if (path.startsWith('~')) {
      return join(homedir(), path.slice(1));
    }
    return path;
  }

  /**
   * Discover transcript path for a session based on project
   */
  private async discoverTranscriptPath(sessionId: string, projectId: string): Promise<string> {
    // Get project from database to find repo path
    const project = await prisma.project.findUnique({
      where: { id: projectId },
    });

    if (!project) {
      throw new TranscriptDiscoveryError(sessionId, `Project not found: ${projectId}`);
    }

    // Claude stores transcripts in ~/.claude/projects/{hashed-project-path}/
    // The exact format may vary, so we'll try common patterns
    const claudeBase = this.expandPath('~/.claude/projects');

    // Try to find the project directory by listing ~/.claude/projects
    try {
      const projectDirs = await fs.readdir(claudeBase);

      // Look for the most recently modified directory that might match
      for (const dir of projectDirs) {
        const projectPath = join(claudeBase, dir);
        const stats = await fs.stat(projectPath);

        if (stats.isDirectory()) {
          // Check for transcript files in this directory
          const files = await fs.readdir(projectPath);
          const transcriptFiles = files.filter(f => f.endsWith('.jsonl'));

          if (transcriptFiles.length > 0) {
            // Sort by modification time to get the most recent
            const fileStats = await Promise.all(
              transcriptFiles.map(async f => ({
                name: f,
                stats: await fs.stat(join(projectPath, f)),
              }))
            );

            fileStats.sort((a, b) => b.stats.mtimeMs - a.stats.mtimeMs);
            const mostRecent = fileStats[0];
            if (mostRecent) {
              return join(projectPath, mostRecent.name);
            }
          }
        }
      }
    } catch (error) {
      throw new TranscriptDiscoveryError(
        sessionId,
        `Failed to read Claude projects directory: ${error instanceof Error ? error.message : 'Unknown error'}`
      );
    }

    throw new TranscriptDiscoveryError(
      sessionId,
      'Could not find transcript file for project'
    );
  }

  /**
   * Parse existing content in transcript file
   */
  private async parseExistingContent(sessionId: string): Promise<void> {
    const session = this.sessions.get(sessionId);
    if (!session) return;

    try {
      const content = await fs.readFile(session.transcriptPath, 'utf-8');
      const lines = content.split('\n').filter(line => line.trim());

      let lastUsage: UsageData | null = null;
      let lastState: ClaudeSessionState = 'unknown';

      for (const line of lines) {
        try {
          const entry = JSON.parse(line) as TranscriptEntry;

          // Extract usage if present
          if (entry.usage) {
            lastUsage = entry.usage;
          }

          // Detect state from entry
          const detectedState = this.detectStateFromEntry(entry);
          if (detectedState !== 'unknown') {
            lastState = detectedState;
          }
        } catch {
          // Skip malformed lines
          continue;
        }
      }

      // Update session with parsed data
      if (lastUsage) {
        session.lastUsage = lastUsage;
        const { contextPercent, totalTokens } = this.calculateContextUsage(lastUsage);
        session.contextPercent = contextPercent;
        session.totalTokens = totalTokens;

        // Update database
        await this.updateDatabaseContextPercent(sessionId, contextPercent);
      }

      if (lastState !== 'unknown') {
        session.claudeState = lastState;
      }

      // Update file position to end
      const stats = await fs.stat(session.transcriptPath);
      session.filePosition = stats.size;
    } catch (error) {
      this.emit('error', error instanceof Error ? error : new Error(String(error)), sessionId);
    }
  }

  /**
   * Start watching a transcript file for changes
   */
  private startWatching(sessionId: string, transcriptPath: string): void {
    const session = this.sessions.get(sessionId);
    if (!session) return;

    try {
      // Use fs.watch for efficiency
      const watcher = watch(transcriptPath, { persistent: false }, (eventType) => {
        if (eventType === 'change' && !session.abortController.signal.aborted) {
          this.scheduleProcessing(sessionId);
        }
      });

      watcher.on('error', (error) => {
        this.emit('error', error, sessionId);
        // Fall back to polling if watch fails
        this.startPolling(sessionId);
      });

      this.watchers.set(sessionId, watcher);
    } catch {
      // Fall back to polling if watch is not available
      this.startPolling(sessionId);
    }
  }

  /**
   * Start polling for file changes (fallback)
   */
  private startPolling(sessionId: string): void {
    const session = this.sessions.get(sessionId);
    if (!session) return;

    // Clear any existing polling interval
    const existingInterval = this.pollingIntervals.get(sessionId);
    if (existingInterval) {
      clearInterval(existingInterval);
    }

    const interval = setInterval(async () => {
      if (session.abortController.signal.aborted) {
        clearInterval(interval);
        return;
      }

      try {
        const stats = await fs.stat(session.transcriptPath);
        if (stats.size > session.filePosition) {
          this.scheduleProcessing(sessionId);
        }
      } catch {
        // File might have been deleted or moved
      }
    }, FILE_POLL_INTERVAL);

    this.pollingIntervals.set(sessionId, interval);
  }

  /**
   * Schedule processing with debounce
   */
  private scheduleProcessing(sessionId: string): void {
    // Clear existing timer
    const existingTimer = this.debounceTimers.get(sessionId);
    if (existingTimer) {
      clearTimeout(existingTimer);
    }

    // Set new debounced timer
    const timer = setTimeout(() => {
      this.processNewContent(sessionId).catch(error => {
        this.emit('error', error instanceof Error ? error : new Error(String(error)), sessionId);
      });
    }, UPDATE_DEBOUNCE_MS);

    this.debounceTimers.set(sessionId, timer);
  }

  /**
   * Process new content in transcript file
   */
  private async processNewContent(sessionId: string): Promise<void> {
    const session = this.sessions.get(sessionId);
    if (!session || session.abortController.signal.aborted) return;

    try {
      const stats = await fs.stat(session.transcriptPath);

      // No new content
      if (stats.size <= session.filePosition) {
        return;
      }

      // Read only new content
      const fd = await fs.open(session.transcriptPath, 'r');
      try {
        const buffer = Buffer.alloc(stats.size - session.filePosition);
        await fd.read(buffer, 0, buffer.length, session.filePosition);
        const newContent = buffer.toString('utf-8');

        // Parse new lines
        const lines = newContent.split('\n').filter(line => line.trim());

        for (const line of lines) {
          try {
            const entry = JSON.parse(line) as TranscriptEntry;
            await this.processEntry(sessionId, entry);
          } catch {
            // Skip malformed lines
            continue;
          }
        }

        // Update file position
        session.filePosition = stats.size;
      } finally {
        await fd.close();
      }
    } catch (error) {
      this.emit('error', error instanceof Error ? error : new Error(String(error)), sessionId);
    }
  }

  /**
   * Process a single transcript entry
   */
  private async processEntry(sessionId: string, entry: TranscriptEntry): Promise<void> {
    const session = this.sessions.get(sessionId);
    if (!session) return;

    // Process usage data
    if (entry.usage) {
      const previousPercent = session.contextPercent;
      session.lastUsage = entry.usage;

      const { contextPercent, totalTokens } = this.calculateContextUsage(entry.usage);
      session.contextPercent = contextPercent;
      session.totalTokens = totalTokens;

      // Emit context update event
      const updateEvent: ContextUpdateEvent = {
        sessionId,
        contextPercent,
        totalTokens,
        timestamp: new Date(),
      };
      this.emit('context:update', updateEvent);

      // Update database
      await this.updateDatabaseContextPercent(sessionId, contextPercent);

      // Check threshold (remaining percentage)
      const remainingPercent = 100 - contextPercent;
      if (!session.thresholdNotified && remainingPercent <= CONTEXT_THRESHOLD_PERCENT) {
        session.thresholdNotified = true;

        const thresholdEvent: ContextThresholdEvent = {
          sessionId,
          contextPercent,
          threshold: CONTEXT_THRESHOLD_PERCENT,
          timestamp: new Date(),
        };
        this.emit('context:threshold', thresholdEvent);
      }

      // Reset threshold notification if context drops (new session)
      if (contextPercent < previousPercent && session.thresholdNotified) {
        session.thresholdNotified = false;
      }
    }

    // Detect and emit state changes
    const newState = this.detectStateFromEntry(entry);
    if (newState !== 'unknown' && newState !== session.claudeState) {
      const previousState = session.claudeState;
      session.claudeState = newState;

      const stateEvent: ClaudeStateChangeEvent = {
        sessionId,
        previousState,
        newState,
        timestamp: new Date(),
      };
      this.emit('claude:stateChange', stateEvent);
    }
  }

  /**
   * Calculate context usage percentage and total tokens from usage data
   */
  private calculateContextUsage(usage: UsageData): { contextPercent: number; totalTokens: number } {
    const inputTokens = usage.input_tokens || 0;
    const cacheCreation = usage.cache_creation_input_tokens || 0;
    const cacheRead = usage.cache_read_input_tokens || 0;

    // Total tokens includes all input tokens
    const totalTokens = inputTokens + cacheCreation + cacheRead;

    // Calculate percentage of max context
    const contextPercent = Math.min(100, Math.round((totalTokens / MAX_CONTEXT_TOKENS) * 100));

    return { contextPercent, totalTokens };
  }

  /**
   * Detect Claude session state from transcript entry
   */
  private detectStateFromEntry(entry: TranscriptEntry): ClaudeSessionState {
    // Check stop_reason first
    if (entry.stop_reason === 'max_tokens') {
      return 'context_exhausted';
    }

    if (entry.stop_reason === 'end_turn') {
      return 'completed';
    }

    // Check for tool_use with null stop_reason (waiting for approval)
    if (entry.stop_reason === null && entry.content) {
      const hasToolUse = entry.content.some(block => block.type === 'tool_use');
      if (hasToolUse) {
        return 'waiting_approval';
      }
    }

    // If there's content but no stop_reason, Claude is likely active
    if (entry.content && entry.content.length > 0 && entry.stop_reason === undefined) {
      return 'active';
    }

    return 'unknown';
  }

  /**
   * Update context percent in database
   */
  private async updateDatabaseContextPercent(sessionId: string, contextPercent: number): Promise<void> {
    try {
      await prisma.session.update({
        where: { id: sessionId },
        data: { contextPercent },
      });
    } catch (error) {
      // Session might not exist in database (unit tests)
      // Log but don't throw
      if (process.env.NODE_ENV !== 'test') {
        console.error(`Failed to update context percent for session ${sessionId}:`, error);
      }
    }
  }

  /**
   * Stop monitoring a session (internal)
   */
  private stopMonitoringInternal(sessionId: string): void {
    const session = this.sessions.get(sessionId);
    if (session) {
      session.abortController.abort();
    }

    // Stop file watcher
    const watcher = this.watchers.get(sessionId);
    if (watcher) {
      watcher.close();
      this.watchers.delete(sessionId);
    }

    // Stop polling interval
    const interval = this.pollingIntervals.get(sessionId);
    if (interval) {
      clearInterval(interval);
      this.pollingIntervals.delete(sessionId);
    }

    // Clear debounce timer
    const timer = this.debounceTimers.get(sessionId);
    if (timer) {
      clearTimeout(timer);
      this.debounceTimers.delete(sessionId);
    }
  }
}

// ============================================================================
// Singleton Instance
// ============================================================================

/** Default context monitor instance */
export const contextMonitor = new ContextMonitor();

// ============================================================================
// Re-exports
// ============================================================================

export {
  MAX_CONTEXT_TOKENS,
  DEFAULT_THRESHOLD_PERCENT,
  FILE_POLL_INTERVAL,
  UPDATE_DEBOUNCE_MS,
  TranscriptNotFoundError,
  SessionNotMonitoredError,
  SessionAlreadyMonitoredError,
  TranscriptDiscoveryError,
  ContextMonitorError,
} from './context-monitor-types.js';

export type {
  UsageData,
  TranscriptEntry,
  TranscriptContentBlock,
  ClaudeSessionState,
  ContextUpdateEvent,
  ContextThresholdEvent,
  ClaudeStateChangeEvent,
  MonitoredSession,
  StartMonitoringOptions,
} from './context-monitor-types.js';
