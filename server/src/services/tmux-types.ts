/**
 * tmux Integration Types
 * Type definitions for the tmux service
 */

/**
 * Represents a tmux session
 */
export interface TmuxSession {
  name: string;
  windows: number;
  attached: boolean;
  created: Date;
}

/**
 * Represents a tmux window within a session
 */
export interface TmuxWindow {
  index: number;
  name: string;
  active: boolean;
  panes: number;
}

/**
 * Represents a tmux pane
 */
export interface TmuxPane {
  /** Pane ID in tmux format (e.g., "%0") */
  id: string;
  /** Session name */
  session: string;
  /** Window index */
  window: number;
  /** Pane index within the window */
  index: number;
  /** Process ID running in the pane */
  pid: number;
  /** Whether the pane is currently active */
  active: boolean;
}

/**
 * Options for capturing pane output
 */
export interface CapturePaneOptions {
  /** Number of lines to capture (default: 1000) */
  lines?: number;
  /** Strip ANSI escape codes (default: true) */
  stripAnsi?: boolean;
  /** Start line (negative for scrollback) */
  startLine?: number;
  /** End line */
  endLine?: number;
}

/**
 * Options for creating a pane
 */
export interface CreatePaneOptions {
  /** Target window (default: current window) */
  window?: string;
  /** Split horizontally instead of vertically */
  horizontal?: boolean;
  /** Initial command to run in the pane */
  command?: string;
  /** Working directory for the pane */
  cwd?: string;
}

/**
 * Base error class for tmux-related errors
 */
export class TmuxError extends Error {
  constructor(
    message: string,
    public readonly command?: string,
    public readonly exitCode?: number
  ) {
    super(message);
    this.name = 'TmuxError';
    // Maintains proper prototype chain for instanceof checks
    Object.setPrototypeOf(this, new.target.prototype);
  }
}

/**
 * Error thrown when tmux is not installed or not available
 */
export class TmuxNotAvailableError extends TmuxError {
  constructor() {
    super('tmux is not installed or not available in PATH');
    this.name = 'TmuxNotAvailableError';
  }
}

/**
 * Error thrown when a tmux session is not found
 */
export class TmuxSessionNotFoundError extends TmuxError {
  constructor(public readonly session: string) {
    super(`tmux session not found: ${session}`);
    this.name = 'TmuxSessionNotFoundError';
  }
}

/**
 * Error thrown when a tmux window is not found
 */
export class TmuxWindowNotFoundError extends TmuxError {
  constructor(
    public readonly session: string,
    public readonly window: string
  ) {
    super(`tmux window not found: ${session}:${window}`);
    this.name = 'TmuxWindowNotFoundError';
  }
}

/**
 * Error thrown when a tmux pane is not found
 */
export class TmuxPaneNotFoundError extends TmuxError {
  constructor(public readonly paneId: string) {
    super(`tmux pane not found: ${paneId}`);
    this.name = 'TmuxPaneNotFoundError';
  }
}

/**
 * Error thrown when a tmux command fails
 */
export class TmuxCommandError extends TmuxError {
  constructor(
    message: string,
    command: string,
    exitCode: number,
    public readonly stderr: string
  ) {
    super(message, command, exitCode);
    this.name = 'TmuxCommandError';
  }
}
