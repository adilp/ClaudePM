/**
 * Waiting Detector Service
 * Multi-layer detection for when Claude is waiting for user input
 *
 * Layer 1: Claude Code Hooks (immediate)
 * Layer 2: JSONL transcript polling (reliable)
 * Layer 3: Output pattern matching (fallback)
 */

import { EventEmitter } from 'events';
import {
  type WaitingStateEvent,
  type WaitingSignal,
  type WaitingReason,
  type WaitingDetectorConfig,
  type WaitingSessionState,
  type ClaudeHookPayload,
  DEFAULT_WAITING_DETECTOR_CONFIG,
  SessionNotWatchedError,
  WaitingDetectorError,
} from './waiting-detector-types.js';
import { contextMonitor } from './context-monitor.js';
import type { ClaudeStateChangeEvent } from './context-monitor-types.js';
import { sessionSupervisor } from './session-supervisor.js';
import type { SessionOutputEvent } from './session-supervisor-types.js';

// ============================================================================
// Events Interface
// ============================================================================

/**
 * Event emitter interface for type-safe event handling
 */
export interface WaitingDetectorEvents {
  'waiting:stateChange': (event: WaitingStateEvent) => void;
  'error': (error: Error, sessionId?: string) => void;
}

// ============================================================================
// WaitingDetector Class
// ============================================================================

/**
 * WaitingDetector consolidates signals from three detection layers
 * to determine when Claude is waiting for user input.
 *
 * Emits events:
 * - 'waiting:stateChange' - When waiting state changes
 * - 'error' - When an error occurs during detection
 */
export class WaitingDetector extends EventEmitter {
  /** Per-session state */
  private sessions: Map<string, WaitingSessionState> = new Map();

  /** Debounce timers for each session */
  private debounceTimers: Map<string, ReturnType<typeof setTimeout>> = new Map();

  /** Clear timers (to reset waiting state after activity) */
  private clearTimers: Map<string, ReturnType<typeof setTimeout>> = new Map();

  /** Idle check timers for question patterns */
  private idleCheckTimers: Map<string, ReturnType<typeof setTimeout>> = new Map();

  /** Pending signals waiting for debounce */
  private pendingSignals: Map<string, WaitingSignal> = new Map();

  /** Configuration */
  private config: WaitingDetectorConfig;

  /** Pre-compiled regex patterns */
  private immediatePatternRe: RegExp | null = null;
  private questionPatternRe: RegExp | null = null;

  /** Whether the detector is running */
  private running: boolean = false;

  /** Bound event handlers for cleanup */
  private boundHandleClaudeStateChange: ((event: ClaudeStateChangeEvent) => void) | null = null;
  private boundHandleSessionOutput: ((event: SessionOutputEvent) => void) | null = null;

  constructor(config: Partial<WaitingDetectorConfig> = {}) {
    super();
    this.config = { ...DEFAULT_WAITING_DETECTOR_CONFIG, ...config };
    this.compilePatterns();
  }

  // ==========================================================================
  // Lifecycle
  // ==========================================================================

  /**
   * Start the waiting detector
   */
  start(): void {
    if (this.running) return;
    this.running = true;

    // Create bound handlers
    this.boundHandleClaudeStateChange = this.handleClaudeStateChange.bind(this);
    this.boundHandleSessionOutput = this.handleSessionOutput.bind(this);

    // Subscribe to ContextMonitor events (Layer 2)
    if (this.config.enableJsonl) {
      contextMonitor.on('claude:stateChange', this.boundHandleClaudeStateChange);
    }

    // Subscribe to SessionSupervisor output events (Layer 3)
    if (this.config.enableOutputPatterns) {
      sessionSupervisor.on('session:output', this.boundHandleSessionOutput);
    }
  }

  /**
   * Stop the waiting detector
   */
  stop(): void {
    if (!this.running) return;
    this.running = false;

    // Unsubscribe from events
    if (this.boundHandleClaudeStateChange) {
      contextMonitor.removeListener('claude:stateChange', this.boundHandleClaudeStateChange);
      this.boundHandleClaudeStateChange = null;
    }

    if (this.boundHandleSessionOutput) {
      sessionSupervisor.removeListener('session:output', this.boundHandleSessionOutput);
      this.boundHandleSessionOutput = null;
    }

    // Clear all timers
    for (const timer of this.debounceTimers.values()) {
      clearTimeout(timer);
    }
    for (const timer of this.clearTimers.values()) {
      clearTimeout(timer);
    }
    for (const timer of this.idleCheckTimers.values()) {
      clearTimeout(timer);
    }

    this.sessions.clear();
    this.debounceTimers.clear();
    this.clearTimers.clear();
    this.idleCheckTimers.clear();
    this.pendingSignals.clear();
  }

  /**
   * Check if the detector is running
   */
  isRunning(): boolean {
    return this.running;
  }

  // ==========================================================================
  // Session Management
  // ==========================================================================

  /**
   * Start watching a session for waiting states
   */
  watchSession(sessionId: string): void {
    if (this.sessions.has(sessionId)) {
      return; // Already watching
    }

    const now = new Date();
    this.sessions.set(sessionId, {
      sessionId,
      isWaiting: false,
      lastSignalTime: now,
      lastOutputTime: now,
      thresholdNotified: false,
    });
  }

  /**
   * Stop watching a session
   */
  unwatchSession(sessionId: string): void {
    this.sessions.delete(sessionId);

    // Clean up timers
    const debounceTimer = this.debounceTimers.get(sessionId);
    if (debounceTimer) {
      clearTimeout(debounceTimer);
      this.debounceTimers.delete(sessionId);
    }

    const clearTimer = this.clearTimers.get(sessionId);
    if (clearTimer) {
      clearTimeout(clearTimer);
      this.clearTimers.delete(sessionId);
    }

    const idleTimer = this.idleCheckTimers.get(sessionId);
    if (idleTimer) {
      clearTimeout(idleTimer);
      this.idleCheckTimers.delete(sessionId);
    }

    this.pendingSignals.delete(sessionId);
  }

  /**
   * Check if a session is being watched
   */
  isWatching(sessionId: string): boolean {
    return this.sessions.has(sessionId);
  }

  /**
   * Get list of watched session IDs
   */
  getWatchedSessions(): string[] {
    return Array.from(this.sessions.keys());
  }

  /**
   * Get current waiting state for a session
   */
  getWaitingState(sessionId: string): { isWaiting: boolean; reason?: WaitingReason } {
    const session = this.sessions.get(sessionId);
    if (!session) {
      throw new SessionNotWatchedError(sessionId);
    }
    const result: { isWaiting: boolean; reason?: WaitingReason } = {
      isWaiting: session.isWaiting,
    };
    if (session.lastWaitingReason !== undefined) {
      result.reason = session.lastWaitingReason;
    }
    return result;
  }

  // ==========================================================================
  // Layer 1: Hook Handler (called externally from API route)
  // ==========================================================================

  /**
   * Handle incoming Claude Code hook event
   * Called by the API route that receives hook payloads
   */
  handleHookEvent(payload: ClaudeHookPayload): void {
    if (!this.config.enableHooks || !this.running) return;

    // Determine session ID from payload
    const sessionId = this.resolveSessionFromHook(payload);
    if (!sessionId) {
      this.emit(
        'error',
        new WaitingDetectorError('Could not resolve session from hook payload', 'HOOK_SESSION_RESOLVE_FAILED'),
        undefined
      );
      return;
    }

    if (!this.sessions.has(sessionId)) {
      return; // Not watching this session
    }

    const now = new Date();

    // Handle Stop event - session finished
    if (payload.event === 'Stop') {
      this.processSignal({
        sessionId,
        waiting: false,
        reason: 'stopped',
        layer: 'hook',
        timestamp: now,
        context: 'stop_event',
      });
      return;
    }

    // Handle Notification events
    if (payload.event === 'Notification') {
      let reason: WaitingReason = 'unknown';

      if (payload.matcher?.includes('permission_prompt')) {
        reason = 'permission_prompt';
      } else if (payload.matcher?.includes('idle_prompt')) {
        reason = 'idle_prompt';
      }

      const signal: WaitingSignal = {
        sessionId,
        waiting: true,
        reason,
        layer: 'hook',
        timestamp: now,
      };
      if (payload.matcher) {
        signal.context = payload.matcher;
      }
      this.processSignal(signal);
    }
  }

  // ==========================================================================
  // Layer 2: JSONL State Change Handler
  // ==========================================================================

  /**
   * Handle Claude state change events from ContextMonitor
   */
  private handleClaudeStateChange(event: ClaudeStateChangeEvent): void {
    if (!this.config.enableJsonl || !this.running) return;

    const session = this.sessions.get(event.sessionId);
    if (!session) return;

    // Map Claude state to waiting reason
    let waiting = false;
    let reason: WaitingReason = 'unknown';

    switch (event.newState) {
      case 'waiting_approval':
        waiting = true;
        reason = 'permission_prompt';
        break;
      case 'context_exhausted':
        waiting = true;
        reason = 'context_exhausted';
        break;
      case 'completed':
        // Completed clears waiting state
        waiting = false;
        reason = 'stopped';
        break;
      case 'active':
        // Active clears waiting state
        waiting = false;
        break;
      default:
        // Unknown state - don't change anything
        return;
    }

    this.processSignal({
      sessionId: event.sessionId,
      waiting,
      reason,
      layer: 'jsonl',
      timestamp: event.timestamp,
    });
  }

  // ==========================================================================
  // Layer 3: Output Pattern Matching
  // ==========================================================================

  /**
   * Handle output events from SessionSupervisor
   */
  private handleSessionOutput(event: SessionOutputEvent): void {
    if (!this.config.enableOutputPatterns || !this.running) return;

    const session = this.sessions.get(event.sessionId);
    if (!session) return;

    const now = new Date();

    // Update last output time for idle detection
    session.lastOutputTime = now;

    // Check output lines for patterns
    const combinedOutput = event.lines.join('\n');

    // Check immediate patterns first
    if (this.immediatePatternRe?.test(combinedOutput)) {
      this.processSignal({
        sessionId: event.sessionId,
        waiting: true,
        reason: 'permission_prompt',
        layer: 'output_pattern',
        timestamp: now,
        context: 'immediate_pattern',
      });
      return;
    }

    // Check question patterns (require idle detection)
    if (this.questionPatternRe?.test(combinedOutput)) {
      // Schedule idle check
      this.scheduleIdleCheck(event.sessionId, now);
    }

    // Any output activity schedules clearing of waiting state
    if (session.isWaiting) {
      this.scheduleClearWaiting(event.sessionId);
    }
  }

  // ==========================================================================
  // Signal Processing and Consolidation
  // ==========================================================================

  /**
   * Process a signal from any detection layer
   */
  private processSignal(signal: WaitingSignal): void {
    const session = this.sessions.get(signal.sessionId);
    if (!session) return;

    // Store pending signal
    this.pendingSignals.set(signal.sessionId, signal);

    // Clear any existing clear timer if we're signaling waiting=true
    if (signal.waiting) {
      const clearTimer = this.clearTimers.get(signal.sessionId);
      if (clearTimer) {
        clearTimeout(clearTimer);
        this.clearTimers.delete(signal.sessionId);
      }
    }

    // Debounce the emission
    this.scheduleEmission(signal.sessionId);
  }

  /**
   * Schedule debounced emission of pending signal
   */
  private scheduleEmission(sessionId: string): void {
    // Clear existing debounce timer
    const existingTimer = this.debounceTimers.get(sessionId);
    if (existingTimer) {
      clearTimeout(existingTimer);
    }

    const timer = setTimeout(() => {
      this.emitPendingSignal(sessionId);
    }, this.config.debounceMs);

    this.debounceTimers.set(sessionId, timer);
  }

  /**
   * Emit pending signal if state changed
   */
  private emitPendingSignal(sessionId: string): void {
    const signal = this.pendingSignals.get(sessionId);
    const session = this.sessions.get(sessionId);

    if (!signal || !session) return;

    // Only emit if state actually changed
    if (session.isWaiting !== signal.waiting) {
      session.isWaiting = signal.waiting;
      session.lastWaitingReason = signal.reason;
      session.lastSignalTime = signal.timestamp;

      const event: WaitingStateEvent = {
        sessionId,
        waiting: signal.waiting,
        reason: signal.reason,
        detectedBy: signal.layer,
        timestamp: signal.timestamp,
      };
      if (signal.context) {
        event.context = signal.context;
      }

      this.emit('waiting:stateChange', event);
    }

    this.pendingSignals.delete(sessionId);
    this.debounceTimers.delete(sessionId);
  }

  /**
   * Schedule idle check for question patterns
   */
  private scheduleIdleCheck(sessionId: string, _questionTime: Date): void {
    const session = this.sessions.get(sessionId);
    if (!session) return;

    // Clear existing idle timer
    const existingTimer = this.idleCheckTimers.get(sessionId);
    if (existingTimer) {
      clearTimeout(existingTimer);
    }

    // Wait for idle threshold and then check
    const timer = setTimeout(() => {
      const now = new Date();
      const idleTime = now.getTime() - session.lastOutputTime.getTime();
      const thresholdMs = this.config.outputPatterns.idleThresholdSeconds * 1000;

      // Check if still idle (no output since question was detected)
      if (idleTime >= thresholdMs && this.sessions.has(sessionId)) {
        this.processSignal({
          sessionId,
          waiting: true,
          reason: 'question',
          layer: 'output_pattern',
          timestamp: now,
          context: 'question_after_idle',
        });
      }

      this.idleCheckTimers.delete(sessionId);
    }, this.config.outputPatterns.idleThresholdSeconds * 1000);

    this.idleCheckTimers.set(sessionId, timer);
  }

  /**
   * Schedule clearing of waiting state after activity
   */
  private scheduleClearWaiting(sessionId: string): void {
    const session = this.sessions.get(sessionId);
    if (!session?.isWaiting) return;

    // Clear existing timer
    const existingTimer = this.clearTimers.get(sessionId);
    if (existingTimer) {
      clearTimeout(existingTimer);
    }

    // Schedule clearing of waiting state
    const timer = setTimeout(() => {
      if (this.sessions.has(sessionId)) {
        this.processSignal({
          sessionId,
          waiting: false,
          reason: 'unknown',
          layer: 'output_pattern',
          timestamp: new Date(),
          context: 'activity_cleared',
        });
      }
      this.clearTimers.delete(sessionId);
    }, this.config.clearDelayMs);

    this.clearTimers.set(sessionId, timer);
  }

  // ==========================================================================
  // Helper Methods
  // ==========================================================================

  /**
   * Compile output patterns into regex
   */
  private compilePatterns(): void {
    const { immediate, questionPatterns } = this.config.outputPatterns;

    if (immediate.length > 0) {
      const escaped = immediate.map((p) => this.escapeRegex(p));
      this.immediatePatternRe = new RegExp(escaped.join('|'), 'i');
    }

    if (questionPatterns.length > 0) {
      // Question patterns may already be regex patterns (like \\?$)
      // so don't escape them if they look like regex
      const patterns = questionPatterns.map((p) => {
        // If it looks like a regex pattern (contains regex metacharacters in meaningful positions)
        if (p.includes('\\') || p.startsWith('^') || p.endsWith('$')) {
          return p;
        }
        return this.escapeRegex(p);
      });
      this.questionPatternRe = new RegExp(patterns.join('|'), 'im');
    }
  }

  /**
   * Escape special regex characters
   */
  private escapeRegex(str: string): string {
    return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  }

  /**
   * Resolve session ID from hook payload
   */
  private resolveSessionFromHook(payload: ClaudeHookPayload): string | null {
    // Direct session ID in payload
    if (payload.session_id) {
      return payload.session_id;
    }

    // Try to match by cwd - check active sessions in supervisor
    if (payload.cwd) {
      const activeSessions = sessionSupervisor.listActiveSessions();
      // For now, if there's only one active session, use it
      // TODO: Match by project repo path when projects have repo_path stored
      if (activeSessions.length === 1) {
        const session = activeSessions[0];
        if (session) {
          return session.id;
        }
      }
    }

    // Try to match by transcript_path
    if (payload.transcript_path) {
      const monitoredSessions = contextMonitor.getMonitoredSessions();
      // For now, if there's only one monitored session, use it
      // TODO: Match by transcript path comparison
      if (monitoredSessions.length === 1) {
        const sessionId = monitoredSessions[0];
        if (sessionId) {
          return sessionId;
        }
      }
    }

    // Fallback: if only one session is being watched, use it
    const watchedSessions = this.getWatchedSessions();
    if (watchedSessions.length === 1) {
      const sessionId = watchedSessions[0];
      if (sessionId) {
        return sessionId;
      }
    }

    return null;
  }

  /**
   * Update configuration at runtime
   */
  updateConfig(config: Partial<WaitingDetectorConfig>): void {
    this.config = { ...this.config, ...config };
    this.compilePatterns();
  }

  /**
   * Get current configuration
   */
  getConfig(): WaitingDetectorConfig {
    return { ...this.config };
  }
}

// ============================================================================
// Singleton Instance
// ============================================================================

export const waitingDetector = new WaitingDetector();

// ============================================================================
// Re-exports
// ============================================================================

export { DEFAULT_WAITING_DETECTOR_CONFIG, SessionNotWatchedError, WaitingDetectorError } from './waiting-detector-types.js';

export type {
  WaitingStateEvent,
  WaitingSignal,
  WaitingReason,
  DetectionLayer,
  WaitingDetectorConfig,
  WaitingSessionState,
  ClaudeHookPayload,
} from './waiting-detector-types.js';
