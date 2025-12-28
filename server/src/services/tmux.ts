/**
 * tmux Integration Service
 * Provides functions for interacting with tmux sessions, windows, and panes
 */

import { exec, execSync, type ExecException } from 'child_process';
import { promisify } from 'util';
import {
  TmuxSession,
  TmuxWindow,
  TmuxPane,
  CapturePaneOptions,
  CreatePaneOptions,
  TmuxError,
  TmuxNotAvailableError,
  TmuxSessionNotFoundError,
  TmuxWindowNotFoundError,
  TmuxPaneNotFoundError,
  TmuxCommandError,
} from './tmux-types.js';

const execAsync = promisify(exec);

// ANSI escape code regex pattern
const ANSI_REGEX = /\x1b\[[0-9;]*[a-zA-Z]/g;

/**
 * Strip ANSI escape codes from a string
 */
export function stripAnsiCodes(str: string): string {
  return str.replace(ANSI_REGEX, '');
}

/**
 * Execute a tmux command and return the output
 * @internal Exported for testing purposes
 */
export async function execTmux(args: string[]): Promise<string> {
  const command = `tmux ${args.join(' ')}`;

  try {
    const { stdout } = await execAsync(command, {
      encoding: 'utf8',
      timeout: 30000, // 30 second timeout
    });
    return stdout;
  } catch (error) {
    const execError = error as ExecException & { stderr?: string };

    // Check if tmux is not available
    if (execError.code === 127 || execError.message.includes('command not found')) {
      throw new TmuxNotAvailableError();
    }

    // Check for specific error messages
    const stderr = execError.stderr ?? '';

    if (stderr.includes('no server running')) {
      // No tmux server - return empty for list operations
      return '';
    }

    if (stderr.includes("can't find session") || stderr.includes('session not found')) {
      const sessionMatch = stderr.match(/session[:\s]+(\S+)/i);
      throw new TmuxSessionNotFoundError(sessionMatch?.[1] ?? 'unknown');
    }

    if (stderr.includes("can't find window") || stderr.includes('window not found')) {
      throw new TmuxWindowNotFoundError('unknown', 'unknown');
    }

    if (stderr.includes("can't find pane") || stderr.includes('pane not found')) {
      const paneMatch = stderr.match(/pane[:\s]+(\S+)/i);
      throw new TmuxPaneNotFoundError(paneMatch?.[1] ?? 'unknown');
    }

    throw new TmuxCommandError(
      `tmux command failed: ${execError.message}`,
      command,
      execError.code ?? 1,
      stderr
    );
  }
}

/**
 * Execute a tmux command synchronously
 * @internal Exported for testing purposes
 */
export function execTmuxSync(args: string[]): string {
  const command = `tmux ${args.join(' ')}`;

  try {
    return execSync(command, {
      encoding: 'utf8',
      timeout: 30000,
    });
  } catch (error) {
    const execError = error as Error & { status?: number; stderr?: Buffer };

    if (execError.message.includes('command not found')) {
      throw new TmuxNotAvailableError();
    }

    const stderr = execError.stderr?.toString() ?? '';

    if (stderr.includes('no server running')) {
      return '';
    }

    throw new TmuxCommandError(
      `tmux command failed: ${execError.message}`,
      command,
      execError.status ?? 1,
      stderr
    );
  }
}

/**
 * Check if tmux is available on the system
 */
export async function isTmuxAvailable(): Promise<boolean> {
  try {
    await execAsync('tmux -V');
    return true;
  } catch {
    return false;
  }
}

/**
 * Get the tmux version
 */
export async function getTmuxVersion(): Promise<string> {
  try {
    const { stdout } = await execAsync('tmux -V');
    return stdout.trim();
  } catch {
    throw new TmuxNotAvailableError();
  }
}

// ============================================================================
// Session Discovery
// ============================================================================

/**
 * List all running tmux sessions
 */
export async function listSessions(): Promise<TmuxSession[]> {
  const format = '#{session_name}|#{session_windows}|#{session_attached}|#{session_created}';
  const output = await execTmux(['list-sessions', '-F', `"${format}"`]);

  if (!output.trim()) {
    return [];
  }

  return output
    .trim()
    .split('\n')
    .filter((line) => line.length > 0)
    .map((line) => {
      const parts = line.split('|');
      if (parts.length < 4) {
        throw new TmuxError(`Invalid session format: ${line}`);
      }

      return {
        name: parts[0] ?? '',
        windows: parseInt(parts[1] ?? '0', 10),
        attached: parts[2] === '1',
        created: new Date(parseInt(parts[3] ?? '0', 10) * 1000),
      };
    });
}

/**
 * Check if a session exists
 */
export async function sessionExists(name: string): Promise<boolean> {
  try {
    await execTmux(['has-session', '-t', escapeShellArg(name)]);
    return true;
  } catch (error) {
    if (error instanceof TmuxSessionNotFoundError) {
      return false;
    }
    // For other errors like "no server running", return false
    if (error instanceof TmuxCommandError && error.stderr.includes('no server running')) {
      return false;
    }
    throw error;
  }
}

/**
 * List windows in a session
 */
export async function listWindows(session: string): Promise<TmuxWindow[]> {
  if (!(await sessionExists(session))) {
    throw new TmuxSessionNotFoundError(session);
  }

  const format = '#{window_index}|#{window_name}|#{window_active}|#{window_panes}';
  const output = await execTmux([
    'list-windows',
    '-t',
    escapeShellArg(session),
    '-F',
    `"${format}"`,
  ]);

  if (!output.trim()) {
    return [];
  }

  return output
    .trim()
    .split('\n')
    .filter((line) => line.length > 0)
    .map((line) => {
      const parts = line.split('|');
      if (parts.length < 4) {
        throw new TmuxError(`Invalid window format: ${line}`);
      }

      return {
        index: parseInt(parts[0] ?? '0', 10),
        name: parts[1] ?? '',
        active: parts[2] === '1',
        panes: parseInt(parts[3] ?? '0', 10),
      };
    });
}

// ============================================================================
// Pane Management
// ============================================================================

/**
 * List panes in a session or window
 */
export async function listPanes(target: string): Promise<TmuxPane[]> {
  const format =
    '#{pane_id}|#{session_name}|#{window_index}|#{pane_index}|#{pane_pid}|#{pane_active}';

  let output: string;
  try {
    output = await execTmux(['list-panes', '-t', escapeShellArg(target), '-F', `"${format}"`]);
  } catch (error) {
    if (error instanceof TmuxSessionNotFoundError) {
      throw error;
    }
    // Try listing all panes in the session if window-specific fails
    try {
      output = await execTmux([
        'list-panes',
        '-s',
        '-t',
        escapeShellArg(target),
        '-F',
        `"${format}"`,
      ]);
    } catch {
      throw error;
    }
  }

  if (!output.trim()) {
    return [];
  }

  return output
    .trim()
    .split('\n')
    .filter((line) => line.length > 0)
    .map((line) => {
      const parts = line.split('|');
      if (parts.length < 6) {
        throw new TmuxError(`Invalid pane format: ${line}`);
      }

      return {
        id: parts[0] ?? '',
        session: parts[1] ?? '',
        window: parseInt(parts[2] ?? '0', 10),
        index: parseInt(parts[3] ?? '0', 10),
        pid: parseInt(parts[4] ?? '0', 10),
        active: parts[5] === '1',
      };
    });
}

/**
 * Create a new pane in a session
 * @returns The pane ID (e.g., "%5")
 */
export async function createPane(session: string, options: CreatePaneOptions = {}): Promise<string> {
  if (!(await sessionExists(session))) {
    throw new TmuxSessionNotFoundError(session);
  }

  const target = options.window ? `${session}:${options.window}` : session;
  const args = ['split-window', '-t', escapeShellArg(target), '-P', '-F', '"#{pane_id}"'];

  // Add horizontal split option
  if (options.horizontal) {
    args.push('-h');
  }

  // Add working directory
  if (options.cwd) {
    args.push('-c', escapeShellArg(options.cwd));
  }

  // Add initial command
  if (options.command) {
    args.push(escapeShellArg(options.command));
  }

  const output = await execTmux(args);
  const paneId = output.trim();

  if (!paneId || !paneId.startsWith('%')) {
    throw new TmuxError(`Failed to create pane: unexpected output "${output}"`);
  }

  return paneId;
}

/**
 * Kill a specific pane
 */
export async function killPane(paneId: string): Promise<void> {
  if (!(await isPaneAlive(paneId))) {
    throw new TmuxPaneNotFoundError(paneId);
  }

  await execTmux(['kill-pane', '-t', escapeShellArg(paneId)]);
}

/**
 * Set the title of a pane
 * @param paneId The pane ID (e.g., "%5")
 * @param title The title to set
 */
export async function setPaneTitle(paneId: string, title: string): Promise<void> {
  await execTmux(['select-pane', '-t', escapeShellArg(paneId), '-T', escapeShellArg(title)]);
}

/**
 * Get the title of a pane
 * @param paneId The pane ID (e.g., "%5")
 * @returns The pane title, or null if pane not found
 */
export async function getPaneTitle(paneId: string): Promise<string | null> {
  try {
    const output = await execTmux([
      'display-message',
      '-t',
      escapeShellArg(paneId),
      '-p',
      '"#{pane_title}"',
    ]);
    return output.trim() || null;
  } catch {
    return null;
  }
}

/**
 * Check if a pane is still alive
 */
export async function isPaneAlive(paneId: string): Promise<boolean> {
  try {
    const output = await execTmux([
      'list-panes',
      '-a',
      '-F',
      '"#{pane_id}"',
    ]);

    if (!output) {
      return false;
    }

    const panes = output
      .trim()
      .split('\n')
      .map((line) => line.trim());

    return panes.includes(paneId);
  } catch (error) {
    if (error instanceof TmuxCommandError && error.stderr.includes('no server running')) {
      return false;
    }
    throw error;
  }
}

/**
 * Get information about a specific pane
 */
export async function getPane(paneId: string): Promise<TmuxPane | null> {
  try {
    const format =
      '#{pane_id}|#{session_name}|#{window_index}|#{pane_index}|#{pane_pid}|#{pane_active}|#{pane_title}';
    const output = await execTmux(['display-message', '-t', escapeShellArg(paneId), '-p', `"${format}"`]);

    const line = output.trim();
    if (!line) {
      return null;
    }

    const parts = line.split('|');
    if (parts.length < 6) {
      return null;
    }

    const pane: TmuxPane = {
      id: parts[0] ?? '',
      session: parts[1] ?? '',
      window: parseInt(parts[2] ?? '0', 10),
      index: parseInt(parts[3] ?? '0', 10),
      pid: parseInt(parts[4] ?? '0', 10),
      active: parts[5] === '1',
    };

    // Only set title if present (exactOptionalPropertyTypes compatibility)
    if (parts[6]) {
      pane.title = parts[6];
    }

    return pane;
  } catch {
    return null;
  }
}

// ============================================================================
// Output Capture
// ============================================================================

/**
 * Capture output from a pane
 */
export async function capturePane(
  paneId: string,
  options: CapturePaneOptions = {}
): Promise<string> {
  const { lines = 1000, stripAnsi = true, startLine, endLine } = options;

  if (!(await isPaneAlive(paneId))) {
    throw new TmuxPaneNotFoundError(paneId);
  }

  const args = ['capture-pane', '-t', escapeShellArg(paneId), '-p'];

  // Add line range options
  if (startLine !== undefined) {
    args.push('-S', startLine.toString());
  } else {
    // Default to capturing last N lines from scrollback
    args.push('-S', (-lines).toString());
  }

  if (endLine !== undefined) {
    args.push('-E', endLine.toString());
  }

  // Add escape sequence handling
  if (!stripAnsi) {
    args.push('-e'); // Include escape sequences
  }

  let output: string;
  try {
    // Try with alternate screen first (for TUI apps)
    output = await execTmux([...args, '-a']);
  } catch (error) {
    // Fall back without -a if no alternate screen
    if (error instanceof TmuxCommandError && error.stderr?.includes('no alternate screen')) {
      output = await execTmux(args);
    } else {
      throw error;
    }
  }

  // Strip ANSI codes if requested (and not already handled by tmux)
  if (stripAnsi) {
    return stripAnsiCodes(output);
  }

  return output;
}

/**
 * Capture the visible portion of a pane only
 */
export async function captureVisiblePane(paneId: string, stripAnsi = true): Promise<string> {
  return capturePane(paneId, { startLine: 0, stripAnsi });
}

// ============================================================================
// Input Injection
// ============================================================================

/**
 * Send keys to a pane
 * @param paneId - The target pane ID
 * @param keys - Keys to send (can include special keys like Enter, C-c, etc.)
 * @param literal - If true, send keys literally without key name lookup (default: false)
 */
export async function sendKeys(paneId: string, keys: string, literal: boolean = false): Promise<void> {
  if (!(await isPaneAlive(paneId))) {
    throw new TmuxPaneNotFoundError(paneId);
  }

  const args = ['send-keys', '-t', escapeShellArg(paneId)];
  if (literal) {
    args.push('-l');
  }
  args.push(escapeShellArg(keys));

  await execTmux(args);
}

/**
 * Send raw keys to a pane (literal mode, for terminal emulation)
 * This is designed for real-time terminal input where escape sequences
 * should be passed through exactly as received from xterm.js
 * @param paneId - The target pane ID
 * @param keys - Raw key data from terminal emulator
 */
export async function sendRawKeys(paneId: string, keys: string): Promise<void> {
  if (!(await isPaneAlive(paneId))) {
    throw new TmuxPaneNotFoundError(paneId);
  }

  // For raw terminal input, use literal mode (-l) to prevent tmux from
  // interpreting key names. Also use -H for hex encoding to handle
  // escape sequences and special characters reliably.
  const hexKeys = Buffer.from(keys, 'utf-8')
    .toString('hex')
    .match(/.{1,2}/g)
    ?.join(' ') ?? '';

  if (hexKeys) {
    await execTmux(['send-keys', '-t', escapeShellArg(paneId), '-H', hexKeys]);
  }
}

/**
 * Send text input followed by Enter
 * @param paneId - The target pane ID
 * @param text - Text to send (will be followed by Enter key)
 */
export async function sendText(paneId: string, text: string): Promise<void> {
  if (!(await isPaneAlive(paneId))) {
    throw new TmuxPaneNotFoundError(paneId);
  }

  await execTmux(['send-keys', '-t', escapeShellArg(paneId), escapeShellArg(text), 'Enter']);
}

/**
 * Send Ctrl+C (interrupt signal) to a pane
 */
export async function sendInterrupt(paneId: string): Promise<void> {
  if (!(await isPaneAlive(paneId))) {
    throw new TmuxPaneNotFoundError(paneId);
  }

  await execTmux(['send-keys', '-t', escapeShellArg(paneId), 'C-c']);
}

/**
 * Send Ctrl+D (EOF) to a pane
 */
export async function sendEof(paneId: string): Promise<void> {
  if (!(await isPaneAlive(paneId))) {
    throw new TmuxPaneNotFoundError(paneId);
  }

  await execTmux(['send-keys', '-t', escapeShellArg(paneId), 'C-d']);
}

/**
 * Send Ctrl+Z (suspend) to a pane
 */
export async function sendSuspend(paneId: string): Promise<void> {
  if (!(await isPaneAlive(paneId))) {
    throw new TmuxPaneNotFoundError(paneId);
  }

  await execTmux(['send-keys', '-t', escapeShellArg(paneId), 'C-z']);
}

// ============================================================================
// Session Management
// ============================================================================

/**
 * Create a new tmux session
 */
export async function createSession(
  name: string,
  options: { cwd?: string; command?: string; detached?: boolean } = {}
): Promise<void> {
  const args = ['new-session', '-s', escapeShellArg(name)];

  if (options.detached !== false) {
    args.push('-d'); // Create detached by default
  }

  if (options.cwd) {
    args.push('-c', escapeShellArg(options.cwd));
  }

  if (options.command) {
    args.push(escapeShellArg(options.command));
  }

  await execTmux(args);
}

/**
 * Kill a tmux session
 */
export async function killSession(name: string): Promise<void> {
  if (!(await sessionExists(name))) {
    throw new TmuxSessionNotFoundError(name);
  }

  await execTmux(['kill-session', '-t', escapeShellArg(name)]);
}

// ============================================================================
// Window Management
// ============================================================================

/**
 * Create a new window in a session
 */
export async function createWindow(
  session: string,
  options: { name?: string; cwd?: string; command?: string } = {}
): Promise<number> {
  if (!(await sessionExists(session))) {
    throw new TmuxSessionNotFoundError(session);
  }

  const args = ['new-window', '-t', escapeShellArg(session), '-P', '-F', '"#{window_index}"'];

  if (options.name) {
    args.push('-n', escapeShellArg(options.name));
  }

  if (options.cwd) {
    args.push('-c', escapeShellArg(options.cwd));
  }

  if (options.command) {
    args.push(escapeShellArg(options.command));
  }

  const output = await execTmux(args);
  return parseInt(output.trim(), 10);
}

/**
 * Kill a window
 */
export async function killWindow(session: string, windowIndex: number | string): Promise<void> {
  const target = `${session}:${windowIndex}`;

  try {
    await execTmux(['kill-window', '-t', escapeShellArg(target)]);
  } catch (error) {
    if (error instanceof TmuxCommandError) {
      if (error.stderr.includes("can't find window")) {
        throw new TmuxWindowNotFoundError(session, String(windowIndex));
      }
    }
    throw error;
  }
}

// ============================================================================
// Utility Functions
// ============================================================================

/**
 * Escape a string for safe use in shell commands
 */
export function escapeShellArg(arg: string): string {
  // Use single quotes and escape any single quotes within
  return `'${arg.replace(/'/g, "'\\''")}'`;
}

/**
 * Wait for a condition to be true in pane output
 */
export async function waitForOutput(
  paneId: string,
  pattern: RegExp | string,
  options: { timeout?: number; pollInterval?: number } = {}
): Promise<string> {
  const { timeout = 30000, pollInterval = 100 } = options;
  const startTime = Date.now();
  const regex = typeof pattern === 'string' ? new RegExp(pattern) : pattern;

  while (Date.now() - startTime < timeout) {
    const output = await capturePane(paneId, { lines: 500 });

    if (regex.test(output)) {
      return output;
    }

    await new Promise((resolve) => setTimeout(resolve, pollInterval));
  }

  throw new TmuxError(`Timeout waiting for pattern: ${pattern}`);
}

/**
 * Get the current working directory of a pane
 */
export async function getPaneCwd(paneId: string): Promise<string> {
  if (!(await isPaneAlive(paneId))) {
    throw new TmuxPaneNotFoundError(paneId);
  }

  const output = await execTmux([
    'display-message',
    '-t',
    escapeShellArg(paneId),
    '-p',
    '"#{pane_current_path}"',
  ]);

  return output.trim();
}

/**
 * Get the current command running in a pane
 */
export async function getPaneCommand(paneId: string): Promise<string> {
  if (!(await isPaneAlive(paneId))) {
    throw new TmuxPaneNotFoundError(paneId);
  }

  const output = await execTmux([
    'display-message',
    '-t',
    escapeShellArg(paneId),
    '-p',
    '"#{pane_current_command}"',
  ]);

  return output.trim();
}

// Re-export types for convenience
export type {
  TmuxSession,
  TmuxWindow,
  TmuxPane,
  CapturePaneOptions,
  CreatePaneOptions,
} from './tmux-types.js';

export {
  TmuxError,
  TmuxNotAvailableError,
  TmuxSessionNotFoundError,
  TmuxWindowNotFoundError,
  TmuxPaneNotFoundError,
  TmuxCommandError,
} from './tmux-types.js';
