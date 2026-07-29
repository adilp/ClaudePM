/**
 * WorkmuxBridge — surfaces live workmux agent state to the app.
 *
 * workmux writes one JSON file per agent under
 * `~/.local/state/workmux/agents/*.json` and keeps `status` accurate (it's what
 * the workmux dashboard reads). This service polls those files, cross-checks
 * each agent's pane against live tmux panes (dropping ghosts), and emits a typed
 * change stream that only fires on *real* changes — the animated spinner in the
 * title and the ticking timestamps never count. WebSocket forwards every change;
 * APNs (a later ticket) subscribes to the same stream and pushes only the
 * significant transitions.
 *
 * In-memory only: the disk files are the source of truth, so there is nothing to
 * persist. See `workmux-bridge-types.ts` for the DTO and events.
 */

import { readdir, readFile } from 'fs/promises';
import { homedir } from 'os';
import { join, basename } from 'path';
import { TypedEventEmitter } from '../utils/typed-event-emitter.js';
import { env } from '../config/env.js';
import { listAllPaneIds } from './tmux.js';
import {
  workmuxAgentFileSchema,
  type Agent,
  type AgentChange,
  type WorkmuxAgentFile,
  type WorkmuxBridgeEvents,
} from './workmux-bridge-types.js';

// ============================================================================
// Pure logic (the test seam) — see tests/services/workmux-bridge.test.ts
// ============================================================================

// Braille spinner glyphs (workmux animates the title prefix) live in U+2800–U+28FF.
const LEADING_SPINNER = /^[⠀-⣿\s]+/;

/** Strip workmux's animated spinner glyph and surrounding whitespace from a title. */
export function cleanTitle(raw: string): string {
  return raw.replace(LEADING_SPINNER, '').trim();
}

/** The `wm merge` target: the worktree/checkout directory name. */
export function deriveWorktree(workdir: string): string {
  return basename(workdir.replace(/\/+$/, ''));
}

/**
 * The parent repo, for grouping the list. For a worktree path the project is the
 * segment before `.worktrees`; otherwise it's just the directory name.
 */
export function deriveProject(workdir: string): string {
  const parts = workdir.replace(/\/+$/, '').split('/');
  const wtIndex = parts.indexOf('.worktrees');
  if (wtIndex > 0) {
    return parts[wtIndex - 1] ?? deriveWorktree(workdir);
  }
  return deriveWorktree(workdir);
}

/** Map a raw workmux state file to the client-facing Agent DTO. */
export function toAgent(raw: WorkmuxAgentFile): Agent {
  const { backend, instance, pane_id } = raw.pane_key;
  return {
    id: `${backend}:${instance}:${pane_id}`,
    worktree: deriveWorktree(raw.workdir),
    project: deriveProject(raw.workdir),
    status: raw.status,
    title: cleanTitle(raw.pane_title ?? ''),
    workdir: raw.workdir,
    statusTs: raw.status_ts ?? 0,
    updatedTs: raw.updated_ts ?? 0,
  };
}

/**
 * Semantic equality — deliberately excludes timestamps so spinner-frame and
 * elapsed-time churn never register as a change.
 */
function agentsEqual(a: Agent, b: Agent): boolean {
  return (
    a.status === b.status &&
    a.title === b.title &&
    a.worktree === b.worktree &&
    a.project === b.project &&
    a.workdir === b.workdir
  );
}

/** Diff two polls into added / updated / removed changes. */
export function diffAgents(prev: Map<string, Agent>, next: Map<string, Agent>): AgentChange[] {
  const changes: AgentChange[] = [];
  for (const [id, agent] of next) {
    const before = prev.get(id);
    if (!before) {
      changes.push({ kind: 'added', agent });
    } else if (!agentsEqual(before, agent)) {
      changes.push({ kind: 'updated', agent });
    }
  }
  for (const [id, agent] of prev) {
    if (!next.has(id)) {
      changes.push({ kind: 'removed', agent });
    }
  }
  return changes;
}

// ============================================================================
// Service
// ============================================================================

const DEFAULT_AGENTS_DIR = join(homedir(), '.local', 'state', 'workmux', 'agents');

export class WorkmuxBridge extends TypedEventEmitter<WorkmuxBridgeEvents> {
  private agents = new Map<string, Agent>();
  private timer: ReturnType<typeof setInterval> | null = null;
  private polling = false;
  private readonly agentsDir: string;
  private readonly pollMs: number;

  constructor(opts?: { agentsDir?: string; pollMs?: number }) {
    super();
    this.agentsDir = opts?.agentsDir ?? env.WORKMUX_AGENTS_DIR ?? DEFAULT_AGENTS_DIR;
    this.pollMs = opts?.pollMs ?? env.WORKMUX_POLL_MS;
  }

  /** Begin polling: one immediate refresh, then on the configured interval. */
  async start(): Promise<void> {
    if (this.timer) return;
    await this.refresh();
    this.timer = setInterval(() => {
      void this.refresh();
    }, this.pollMs);
    // Polling alone shouldn't keep the process alive.
    this.timer.unref?.();
    console.log(`[WorkmuxBridge] Polling ${this.agentsDir} every ${this.pollMs}ms`);
  }

  /** Stop polling. */
  stop(): void {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
  }

  /** Current snapshot of live agents (for the REST endpoint / WS snapshot). */
  list(): Agent[] {
    return Array.from(this.agents.values());
  }

  /**
   * Read the agents dir, cross-check tmux liveness, diff against the last poll,
   * and emit changes. Resilient: never throws — a bad tick is logged and skipped.
   */
  async refresh(): Promise<void> {
    if (this.polling) return; // don't overlap if a poll runs long
    this.polling = true;
    try {
      const next = await this.readLiveAgents();
      const changes = diffAgents(this.agents, next);
      this.agents = next;
      for (const change of changes) {
        if (change.kind === 'removed') {
          this.emit('agent:removed', change.agent);
        } else {
          this.emit('agent:update', change.agent);
        }
      }
    } catch (err) {
      console.error('[WorkmuxBridge] refresh failed:', err);
    } finally {
      this.polling = false;
    }
  }

  private async readLiveAgents(): Promise<Map<string, Agent>> {
    let files: string[];
    try {
      files = (await readdir(this.agentsDir)).filter((f) => f.endsWith('.json'));
    } catch (err) {
      // No dir yet (workmux not installed / no agents) => empty set, not an error.
      if ((err as { code?: string }).code === 'ENOENT') return new Map();
      throw err;
    }

    // Parse each file; skip anything malformed or mid-write — next poll retries.
    const raws: WorkmuxAgentFile[] = [];
    for (const file of files) {
      try {
        const contents = await readFile(join(this.agentsDir, file), 'utf-8');
        const parsed = workmuxAgentFileSchema.safeParse(JSON.parse(contents));
        if (parsed.success) raws.push(parsed.data);
      } catch {
        // unreadable / partial write this tick — ignore
      }
    }

    // Drop ghosts: an agent whose pane is no longer open in tmux.
    const alive = await this.getAlivePaneIds();
    const next = new Map<string, Agent>();
    for (const raw of raws) {
      if (alive && !alive.has(raw.pane_key.pane_id)) continue;
      const agent = toAgent(raw);
      next.set(agent.id, agent);
    }
    return next;
  }

  /**
   * Live pane ids from tmux, or `null` to skip the liveness filter.
   *
   * We only trust the filter when tmux positively reports live panes. An empty
   * result is ambiguous — `execTmux` returns "" for a stopped tmux server just
   * as it would for a running server with zero panes — so we treat it (and any
   * tmux error) as "can't confirm liveness" and skip the filter rather than
   * blanking the whole list. Genuinely-closed agents still drop when their state
   * file is removed.
   */
  private async getAlivePaneIds(): Promise<Set<string> | null> {
    try {
      const alive = await listAllPaneIds();
      return alive.size > 0 ? alive : null;
    } catch {
      return null;
    }
  }
}

/** Singleton bridge. */
export const workmuxBridge = new WorkmuxBridge();
