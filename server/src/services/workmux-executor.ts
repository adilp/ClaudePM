/**
 * WorkmuxExecutor — runs whitelisted `workmux` lifecycle commands for the app.
 *
 * Each command is a fresh `execFile('workmux', …, { cwd })` subprocess (arg
 * array, no shell string → nothing needs shell-escaping), capturing workmux's
 * real stdout/stderr so the app can show it. This is NOT tmux `send-keys`: the
 * agent's pane runs an interactive Claude session, so we never type into it.
 *
 * Targeting: merge/remove resolve the worktree `workdir` from the live agent map
 * (keyed on the unique agent id); add resolves a cwd from any existing agent of
 * the chosen project (workmux has no global repo registry). See
 * `workmux-executor-types.ts` for the pure argument-builders and errors.
 */

import { execFile } from 'child_process';
import { homedir } from 'os';
import { join } from 'path';
import { readFile } from 'fs/promises';
import { workmuxBridge } from './workmux-bridge.js';
import type { Agent } from './workmux-bridge-types.js';
import {
  buildAddArgs,
  buildMergeArgs,
  buildRemoveArgs,
  isWorktreeClean,
  parseTaskPresets,
  AgentNotFoundError,
  NoProjectAgentError,
  WorkmuxCommandError,
  WorkmuxSpawnError,
  WorkmuxTimeoutError,
  WorktreeDirtyError,
  type ExecFn,
  type RunOutcome,
  type WorkmuxCommandResult,
} from './workmux-executor-types.js';

const DEFAULT_BIN = 'workmux';
const DEFAULT_TIMEOUT_MS = 120_000; // merge/add may run hooks + spawn an agent
const DEFAULT_TASKS_PATH = join(homedir(), '.config', 'claudepm', 'tasks.yaml');
const MAX_BUFFER = 10 * 1024 * 1024;

export interface WorkmuxExecutorOptions {
  /** workmux binary (default "workmux", resolved on PATH). */
  bin?: string;
  timeoutMs?: number;
  /** Live agents — defaults to the bridge singleton. */
  agentsProvider?: () => Agent[];
  /** Path to the task-preset library. */
  tasksPath?: string;
  /** Subprocess seam — injectable in tests so nothing is really spawned. */
  exec?: ExecFn;
  /** Task-file reader seam — returns `null` when the file is absent. */
  readTasksFile?: () => Promise<string | null>;
}

export class WorkmuxExecutor {
  private readonly bin: string;
  private readonly timeoutMs: number;
  private readonly agentsProvider: () => Agent[];
  private readonly tasksPath: string;
  private readonly exec: ExecFn;
  private readonly readTasksFile: () => Promise<string | null>;

  constructor(opts: WorkmuxExecutorOptions = {}) {
    this.bin = opts.bin ?? DEFAULT_BIN;
    this.timeoutMs = opts.timeoutMs ?? DEFAULT_TIMEOUT_MS;
    this.agentsProvider = opts.agentsProvider ?? (() => workmuxBridge.list());
    this.tasksPath = opts.tasksPath ?? DEFAULT_TASKS_PATH;
    this.exec = opts.exec ?? this.defaultExec.bind(this);
    this.readTasksFile = opts.readTasksFile ?? this.defaultReadTasksFile.bind(this);
  }

  /** Merge a `done` agent's worktree, then let workmux tear down its window/pane. */
  async merge(id: string): Promise<WorkmuxCommandResult> {
    const agent = this.resolveAgent(id);
    const outcome = await this.exec(this.bin, buildMergeArgs(), agent.workdir);
    if (outcome.code !== 0) {
      throw new WorkmuxCommandError('merge', outcome, agent.workdir);
    }
    return this.toResult('merge', outcome, agent.workdir);
  }

  /**
   * Remove an agent's worktree. Clean → straight `remove -f`. Dirty → refuse
   * with the git status (the app shows it and can re-ask) unless `force`, then
   * `remove -f` discards the changes.
   */
  async remove(id: string, force = false): Promise<WorkmuxCommandResult> {
    const agent = this.resolveAgent(id);

    const status = await this.exec('git', ['status', '--porcelain'], agent.workdir);
    if (status.code !== 0) {
      throw new WorkmuxCommandError('git status', status, agent.workdir);
    }
    if (!isWorktreeClean(status.stdout) && !force) {
      throw new WorktreeDirtyError(agent.workdir, status.stdout);
    }

    const outcome = await this.exec(this.bin, buildRemoveArgs(), agent.workdir);
    if (outcome.code !== 0) {
      throw new WorkmuxCommandError('remove', outcome, agent.workdir);
    }
    return this.toResult('remove', outcome, agent.workdir);
  }

  /**
   * Add a new agent to a project, running `workmux add` from an existing
   * worktree of that project. Backgrounded; the new agent surfaces via the
   * bridge's `agent:update`.
   */
  async add(project: string, name: string, task?: string): Promise<WorkmuxCommandResult> {
    const cwd = this.agentsProvider().find((a) => a.project === project)?.workdir;
    if (!cwd) {
      throw new NoProjectAgentError(project);
    }
    const outcome = await this.exec(this.bin, buildAddArgs(name, task), cwd);
    if (outcome.code !== 0) {
      throw new WorkmuxCommandError('add', outcome, cwd);
    }
    return this.toResult('add', outcome, undefined);
  }

  /** The saved task library (`~/.config/claudepm/tasks.yaml`); [] if absent. */
  async getTaskPresets(): Promise<string[]> {
    const text = await this.readTasksFile();
    if (text == null) return [];
    return parseTaskPresets(text);
  }

  // --------------------------------------------------------------------------

  private resolveAgent(id: string): Agent {
    const agent = this.agentsProvider().find((a) => a.id === id);
    if (!agent) throw new AgentNotFoundError(id);
    return agent;
  }

  private toResult(
    action: WorkmuxCommandResult['action'],
    outcome: RunOutcome,
    workdir: string | undefined
  ): WorkmuxCommandResult {
    return {
      action,
      ...(workdir ? { workdir } : {}),
      stdout: outcome.stdout,
      stderr: outcome.stderr,
      exitCode: outcome.code,
    };
  }

  /** Default subprocess runner: resolves for any clean exit, rejects only on
   * spawn failure or timeout so callers can surface a non-zero exit's output. */
  private defaultExec(bin: string, args: string[], cwd: string): Promise<RunOutcome> {
    return new Promise((resolve, reject) => {
      execFile(
        bin,
        args,
        { cwd, timeout: this.timeoutMs, maxBuffer: MAX_BUFFER },
        (err, stdout, stderr) => {
          if (err) {
            const e = err as NodeJS.ErrnoException & { killed?: boolean };
            // Spawn failure (binary missing, etc.) surfaces a string errno.
            if (typeof e.code === 'string') {
              reject(new WorkmuxSpawnError(bin, e.code));
              return;
            }
            // Killed by the timeout guard.
            if (e.killed) {
              reject(new WorkmuxTimeoutError([bin, ...args].join(' '), this.timeoutMs));
              return;
            }
            // Non-zero exit: not an error here — hand back the captured output.
            resolve({
              stdout: stdout ?? '',
              stderr: stderr ?? '',
              code: typeof e.code === 'number' ? e.code : 1,
            });
            return;
          }
          resolve({ stdout: stdout ?? '', stderr: stderr ?? '', code: 0 });
        }
      );
    });
  }

  private async defaultReadTasksFile(): Promise<string | null> {
    try {
      return await readFile(this.tasksPath, 'utf-8');
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code === 'ENOENT') return null;
      throw err;
    }
  }
}

/** Singleton executor bound to the live bridge. */
export const workmuxExecutor = new WorkmuxExecutor();
