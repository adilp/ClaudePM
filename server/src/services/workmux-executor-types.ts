/**
 * Types, errors, and pure helpers for the WorkmuxExecutor service.
 *
 * The executor runs whitelisted `workmux` lifecycle commands (merge / remove /
 * add) on behalf of the app, each as a fresh `execFile('workmux', …, { cwd })`
 * subprocess — never tmux `send-keys` (the agent's pane runs an interactive
 * Claude session). The pure argument-builders and parsers below are the test
 * seam; the subprocess wiring lives in `workmux-executor.ts`.
 */

// ============================================================================
// Outcomes
// ============================================================================

/** Normalised result of one completed subprocess (any exit code). */
export interface RunOutcome {
  stdout: string;
  stderr: string;
  /** Process exit code; 0 = success. */
  code: number;
}

/** What a command endpoint returns to the app — workmux's real captured output. */
export interface WorkmuxCommandResult {
  action: 'merge' | 'remove' | 'add';
  /** The worktree the command ran in (absent for `add`, which targets a project). */
  workdir?: string;
  stdout: string;
  stderr: string;
  exitCode: number;
}

/** The subprocess seam — injectable so tests never spawn a real process. */
export type ExecFn = (bin: string, args: string[], cwd: string) => Promise<RunOutcome>;

// ============================================================================
// Errors
// ============================================================================

/** Base error carrying a stable machine code the API maps to an HTTP status. */
export class WorkmuxError extends Error {
  constructor(
    message: string,
    public readonly code: string
  ) {
    super(message);
    this.name = 'WorkmuxError';
    Object.setPrototypeOf(this, new.target.prototype);
  }
}

/** No live agent matches the given id (stale/closed since the app last saw it). */
export class AgentNotFoundError extends WorkmuxError {
  constructor(public readonly agentId: string) {
    super(`No live agent with id: ${agentId}`, 'AGENT_NOT_FOUND');
    this.name = 'AgentNotFoundError';
  }
}

/** `remove` refused: the worktree has uncommitted changes and force wasn't set. */
export class WorktreeDirtyError extends WorkmuxError {
  constructor(
    public readonly workdir: string,
    /** Raw `git status --porcelain` output — the dirty files, for display. */
    public readonly porcelain: string
  ) {
    super(`Worktree has uncommitted changes: ${workdir}`, 'WORKTREE_DIRTY');
    this.name = 'WorktreeDirtyError';
  }

  /** The dirty paths, parsed from porcelain, for a friendlier message. */
  get files(): string[] {
    // Porcelain lines are `XY<space>path`; the first column may be a space
    // (e.g. " M"), so slice the raw line — don't trim the status columns off.
    return this.porcelain
      .split('\n')
      .filter((l) => l.trim().length > 0)
      .map((l) => l.slice(3).trim())
      .filter(Boolean);
  }
}

/**
 * `add` can't run: the project has no live agent to borrow a workdir from, and
 * workmux has no global repo registry to locate it. This is the known
 * "can't bootstrap the first agent" gap — do it from the Mac.
 */
export class NoProjectAgentError extends WorkmuxError {
  constructor(public readonly project: string) {
    super(
      `No existing agent for project "${project}" to run "workmux add" from`,
      'NO_PROJECT_AGENT'
    );
    this.name = 'NoProjectAgentError';
  }
}

/** A workmux subprocess exited non-zero; carries its real stdout/stderr. */
export class WorkmuxCommandError extends WorkmuxError {
  constructor(
    public readonly action: string,
    public readonly outcome: RunOutcome,
    public readonly workdir?: string
  ) {
    super(
      `workmux ${action} failed (exit ${outcome.code}): ${
        outcome.stderr.trim() || outcome.stdout.trim() || 'no output'
      }`,
      'WORKMUX_FAILED'
    );
    this.name = 'WorkmuxCommandError';
  }
}

/** The workmux binary couldn't be spawned at all (e.g. not on PATH). */
export class WorkmuxSpawnError extends WorkmuxError {
  constructor(
    public readonly bin: string,
    public readonly syscall: string
  ) {
    super(`Failed to spawn "${bin}" (${syscall})`, 'WORKMUX_SPAWN_FAILED');
    this.name = 'WorkmuxSpawnError';
  }
}

/** A subprocess exceeded its timeout and was killed. */
export class WorkmuxTimeoutError extends WorkmuxError {
  constructor(
    public readonly command: string,
    public readonly timeoutMs: number
  ) {
    super(`Command timed out after ${timeoutMs}ms: ${command}`, 'WORKMUX_TIMEOUT');
    this.name = 'WorkmuxTimeoutError';
  }
}

// ============================================================================
// Pure helpers (the test seam)
// ============================================================================

/**
 * `merge` runs with NO name argument: cwd is the worktree, and a bare path is
 * collision-proof where two projects share a worktree name. workmux reads its
 * own config for the merge strategy + `main_branch`. No force — if the worktree
 * is dirty or a pre-merge hook fails, workmux exits non-zero and we surface it.
 */
export function buildMergeArgs(): string[] {
  return ['merge'];
}

/**
 * `remove` always passes `-f`: we do our own dirty pre-check, so `-f` here only
 * skips workmux's now-redundant interactive confirmation (a prompt would hang a
 * non-interactive subprocess). On the dirty+force path it also ignores the
 * uncommitted changes, which is exactly the "discard" intent.
 */
export function buildRemoveArgs(): string[] {
  return ['remove', '-f'];
}

/**
 * `add <name> [-p "<task>"] -b` — background window so the server call returns
 * without switching tmux focus. The new agent surfaces via the bridge stream.
 */
export function buildAddArgs(name: string, task?: string): string[] {
  const args = ['add', name];
  if (task && task.trim().length > 0) {
    args.push('-p', task);
  }
  args.push('-b');
  return args;
}

/** A worktree is clean iff `git status --porcelain` prints nothing. */
export function isWorktreeClean(porcelain: string): boolean {
  return porcelain.trim().length === 0;
}

/**
 * Parse `~/.config/claudepm/tasks.yaml` — a plain YAML list of task strings.
 * Deliberately minimal (no yaml dependency): reads `- item` entries, strips
 * matching surrounding quotes, and skips blanks / `#` comments / doc markers.
 * Anything it can't recognise as a list item is ignored, not an error.
 */
export function parseTaskPresets(text: string): string[] {
  const presets: string[] = [];
  for (const rawLine of text.split('\n')) {
    const line = rawLine.trim();
    if (!line || line.startsWith('#') || line === '---' || line === '...') continue;
    const match = line.match(/^-\s+(.*)$/);
    if (!match) continue;
    let value = (match[1] ?? '').trim();
    if (value.length === 0) continue;
    if (
      (value.startsWith('"') && value.endsWith('"') && value.length >= 2) ||
      (value.startsWith("'") && value.endsWith("'") && value.length >= 2)
    ) {
      value = value.slice(1, -1);
    }
    if (value.length > 0) presets.push(value);
  }
  return presets;
}
