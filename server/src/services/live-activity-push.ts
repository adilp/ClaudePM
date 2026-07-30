/**
 * LiveActivityPushService — pushes variant-C Live Activity content updates to
 * iOS over APNs so the lock screen / Dynamic Island stay live while the app is
 * backgrounded (issue #10).
 *
 * Source of truth is the WorkmuxBridge's agent stream. This service subscribes
 * to `agent:update` / `agent:removed`, re-renders the whole fleet into the exact
 * `ContentState` the iOS app builds locally (see `AgentLiveActivityManager`), and
 * pushes it to every registered Live Activity token. The render logic is the
 * pure test seam below; the service wraps it in the three guards the ticket calls
 * for so we stay inside APNs' Live-Activity budget:
 *
 *   1. Dedupe   — only push when the *rendered* content changes. The signature
 *                 deliberately excludes each row's `since`: elapsed time renders
 *                 as a self-ticking `.relative` timer on the client, so a
 *                 since-only delta needs no push.
 *   2. Debounce — a trailing window coalesces a burst of changes into one push.
 *   3. Budget   — a sliding 1h window caps total pushes; over budget we drop and
 *                 let the next real change retry.
 *
 * Lifecycle: each update carries a rolling `stale-date` (a liveness signal — if
 * pushes stop, the system dims the activity rather than showing stale counts as
 * fresh). When the fleet empties we push `event: "end"` with a `dismissal-date`
 * so a backgrounded activity doesn't linger showing agents that are gone.
 */

import { prisma } from '../config/db.js';
import { env } from '../config/env.js';
import { apnsClient } from './apns-client.js';
import { workmuxBridge } from './workmux-bridge.js';
import type { Agent } from './workmux-bridge-types.js';
import type {
  LiveActivityContentState,
  LiveActivityEvent,
  LiveActivityRow,
} from './live-activity-push-types.js';

// ============================================================================
// Pure logic (the test seam) — see tests/services/live-activity-push.test.ts
// ============================================================================

type StatusBucket = 'working' | 'waiting' | 'done' | 'other';

/**
 * Bucket a raw workmux status the same way the iOS `AgentActivityStatus` enum
 * does — case-insensitively, with everything unrecognised falling to "other".
 */
export function statusBucket(raw: string): StatusBucket {
  switch (raw.toLowerCase()) {
    case 'working':
      return 'working';
    case 'waiting':
      return 'waiting';
    case 'done':
      return 'done';
    default:
      return 'other';
  }
}

/** Sort priority: waiting first (needs attention), then working, done, other. */
function sortPriority(raw: string): number {
  switch (statusBucket(raw)) {
    case 'waiting':
      return 0;
    case 'working':
      return 1;
    case 'done':
      return 2;
    case 'other':
      return 3;
  }
}

/**
 * The row's `since` in **epoch seconds**, mirroring the app's `statusSince`:
 * prefer `statusTs`, fall back to `updatedTs`, then to "now" — guarding the
 * documented `0 == unknown` sentinel so elapsed never renders as decades.
 */
export function rowSince(agent: Agent, nowSeconds: number): number {
  if (agent.statusTs > 0) return agent.statusTs;
  if (agent.updatedTs > 0) return agent.updatedTs;
  return nowSeconds;
}

/**
 * Render the full agent list into the variant-C `ContentState`. This MUST stay
 * byte-for-byte compatible with iOS `AgentLiveActivityManager.makeContentState`:
 * same bucket counts, same waiting->working->done->title ordering, same top-N
 * cap, same `doneOverflow` (done agents not shown as rows), same `total`.
 */
export function renderContentState(
  agents: Agent[],
  maxRows: number,
  nowSeconds: number
): LiveActivityContentState {
  let working = 0;
  let waiting = 0;
  let done = 0;
  for (const a of agents) {
    const bucket = statusBucket(a.status);
    if (bucket === 'working') working += 1;
    else if (bucket === 'waiting') waiting += 1;
    else if (bucket === 'done') done += 1;
  }

  const sorted = [...agents].sort((lhs, rhs) => {
    const lp = sortPriority(lhs.status);
    const rp = sortPriority(rhs.status);
    if (lp !== rp) return lp - rp;
    // Case-insensitive ascending, matching Swift's localizedCaseInsensitiveCompare
    // closely enough for the ASCII task titles we display.
    return lhs.title.toLowerCase().localeCompare(rhs.title.toLowerCase());
  });

  const rows: LiveActivityRow[] = sorted.slice(0, maxRows).map((a) => ({
    id: a.id,
    status: a.status,
    title: a.title,
    worktree: a.worktree,
    since: rowSince(a, nowSeconds),
  }));

  const doneShown = rows.filter((r) => statusBucket(r.status) === 'done').length;
  const doneOverflow = Math.max(0, done - doneShown);

  return { working, waiting, done, total: agents.length, rows, doneOverflow };
}

/**
 * A stable dedupe key for a rendered state, **excluding** each row's `since`.
 * Two renders with the same signature look identical on screen (elapsed time
 * ticks client-side), so there is nothing worth a push between them.
 */
export function renderSignature(state: LiveActivityContentState): string {
  return JSON.stringify({
    w: state.working,
    a: state.waiting,
    d: state.done,
    t: state.total,
    o: state.doneOverflow,
    r: state.rows.map((row) => [row.id, row.status, row.title, row.worktree]),
  });
}

// ============================================================================
// Service
// ============================================================================

const ONE_HOUR_MS = 60 * 60 * 1000;
/** Platform discriminator used for Live Activity tokens (see devices.ts). */
const LIVE_ACTIVITY_PLATFORM_PREFIX = 'ios-liveactivity';

interface LiveActivityPushDeps {
  /** Current full fleet snapshot (defaults to the workmux bridge). */
  listAgents: () => Agent[];
  /** Injectable clock in ms (defaults to Date.now) — for tests. */
  now?: () => number;
  debounceMs?: number;
  maxPerHour?: number;
  staleMs?: number;
  maxRows?: number;
}

export interface LiveActivityPushResult {
  /** APNs is configured (key/team/path all present). */
  configured: boolean;
  /** How many Live Activity tokens are currently registered. */
  tokens: number;
  /** How many agents were in the fleet at push time. */
  agents: number;
  sent: number;
  failed: number;
}

export class LiveActivityPushService {
  private readonly listAgents: () => Agent[];
  private readonly now: () => number;
  private readonly debounceMs: number;
  private readonly maxPerHour: number;
  private readonly staleMs: number;
  private readonly maxRows: number;

  private flushTimer: ReturnType<typeof setTimeout> | null = null;
  /** Signature of the last state we pushed; null once ended / never pushed. */
  private activeSignature: string | null = null;
  /** Last pushed `waiting` count — drives priority escalation. */
  private lastWaiting = 0;
  /** Epoch-ms of recent pushes, for the sliding-window budget. */
  private sendWindow: number[] = [];

  constructor(deps: LiveActivityPushDeps) {
    this.listAgents = deps.listAgents;
    this.now = deps.now ?? (() => Date.now());
    this.debounceMs = deps.debounceMs ?? env.LIVE_ACTIVITY_DEBOUNCE_MS;
    this.maxPerHour = deps.maxPerHour ?? env.LIVE_ACTIVITY_MAX_PER_HOUR;
    this.staleMs = deps.staleMs ?? env.LIVE_ACTIVITY_STALE_MS;
    this.maxRows = deps.maxRows ?? env.LIVE_ACTIVITY_MAX_ROWS;
  }

  /**
   * Called on every bridge `agent:update` / `agent:removed`. (Re)arms a trailing
   * debounce so a burst collapses to a single flush carrying the final state.
   */
  schedule(): void {
    if (this.flushTimer) clearTimeout(this.flushTimer);
    this.flushTimer = setTimeout(() => {
      this.flushTimer = null;
      void this.flush();
    }, this.debounceMs);
    this.flushTimer.unref?.();
  }

  /** Cancel any pending flush (shutdown). */
  stop(): void {
    if (this.flushTimer) {
      clearTimeout(this.flushTimer);
      this.flushTimer = null;
    }
  }

  /**
   * Recompute the rendered state and push it if it changed and we're in budget.
   * Never throws — a bad tick is logged and skipped.
   */
  async flush(): Promise<void> {
    // Not configured => nothing to push (and no point querying tokens).
    if (apnsClient.configError()) return;

    try {
      const nowMs = this.now();
      const nowSec = Math.floor(nowMs / 1000);
      const agents = this.listAgents();

      // Fleet empty => end a live activity if one is running.
      if (agents.length === 0) {
        if (this.activeSignature !== null) {
          await this.pushEnd(nowSec);
          this.activeSignature = null;
          this.lastWaiting = 0;
        }
        return;
      }

      const state = renderContentState(agents, this.maxRows, nowSec);
      const signature = renderSignature(state);
      if (signature === this.activeSignature) return; // dedupe: nothing visible changed

      if (!this.withinBudget(nowMs)) {
        console.warn(
          `[LiveActivityPush] Over budget (${this.maxPerHour}/h) — dropping update; next change retries`
        );
        return;
      }

      const priority = state.waiting > this.lastWaiting ? 10 : 5;
      const result = await this.pushUpdate(state, nowSec, priority);

      // Only commit the "we pushed this" bookkeeping if there was actually a
      // token to push to; otherwise a later-registered token still gets the
      // current state on the next change.
      if (result.tokens > 0) {
        this.sendWindow.push(nowMs);
        this.activeSignature = signature;
        this.lastWaiting = state.waiting;
      }
    } catch (err) {
      console.error('[LiveActivityPush] flush failed:', err);
    }
  }

  /**
   * Force a push of the current fleet state, bypassing debounce/dedupe/budget.
   * The "confirm receipt on device" trigger for Live Activity setup, mirroring
   * `test-push` for standard alerts.
   */
  async pushNow(): Promise<LiveActivityPushResult> {
    const nowSec = Math.floor(this.now() / 1000);
    const agents = this.listAgents();
    const tokens = await this.getTokens();

    if (agents.length === 0) {
      return {
        configured: !apnsClient.configError(),
        tokens: tokens.length,
        agents: 0,
        sent: 0,
        failed: 0,
      };
    }

    const state = renderContentState(agents, this.maxRows, nowSec);
    const result = await this.pushUpdate(state, nowSec, 10, tokens);
    // Keep bookkeeping consistent so the automatic path dedupes against it.
    if (result.tokens > 0) {
      this.activeSignature = renderSignature(state);
      this.lastWaiting = state.waiting;
    }
    return {
      configured: !apnsClient.configError(),
      tokens: result.tokens,
      agents: agents.length,
      sent: result.sent,
      failed: result.failed,
    };
  }

  // -- internals -------------------------------------------------------------

  /** Prune the sliding window and report whether we may push again. */
  private withinBudget(nowMs: number): boolean {
    const cutoff = nowMs - ONE_HOUR_MS;
    this.sendWindow = this.sendWindow.filter((t) => t > cutoff);
    return this.sendWindow.length < this.maxPerHour;
  }

  private async getTokens(): Promise<string[]> {
    const rows = await prisma.deviceToken.findMany({
      where: { platform: { startsWith: LIVE_ACTIVITY_PLATFORM_PREFIX } },
      select: { token: true },
    });
    return rows.map((r) => r.token);
  }

  private async pushUpdate(
    state: LiveActivityContentState,
    nowSec: number,
    priority: 5 | 10,
    knownTokens?: string[]
  ): Promise<{ sent: number; failed: number; tokens: number }> {
    const payload: Record<string, unknown> = {
      aps: {
        timestamp: nowSec,
        event: 'update' satisfies LiveActivityEvent,
        'content-state': state,
        ...(this.staleMs > 0 && { 'stale-date': nowSec + Math.floor(this.staleMs / 1000) }),
      },
    };
    return this.sendToTokens(payload, priority, knownTokens);
  }

  private async pushEnd(nowSec: number): Promise<{ sent: number; failed: number; tokens: number }> {
    // A coherent final frame (empty fleet) plus an immediate dismissal.
    const emptyState: LiveActivityContentState = {
      working: 0,
      waiting: 0,
      done: 0,
      total: 0,
      rows: [],
      doneOverflow: 0,
    };
    const payload: Record<string, unknown> = {
      aps: {
        timestamp: nowSec,
        event: 'end' satisfies LiveActivityEvent,
        'content-state': emptyState,
        'dismissal-date': nowSec,
      },
    };
    return this.sendToTokens(payload, 10);
  }

  /**
   * Fan a payload out to every Live Activity token, pruning any Apple reports as
   * permanently invalid (an ended activity's token goes stale). Mirrors
   * `notification-service.sendPush`.
   */
  private async sendToTokens(
    payload: Record<string, unknown>,
    priority: 5 | 10,
    knownTokens?: string[]
  ): Promise<{ sent: number; failed: number; tokens: number }> {
    const tokens = knownTokens ?? (await this.getTokens());
    if (tokens.length === 0) return { sent: 0, failed: 0, tokens: 0 };

    let sent = 0;
    let failed = 0;
    const stale: string[] = [];

    for (const token of tokens) {
      const result = await apnsClient.send(token, payload, {
        pushType: 'liveactivity',
        priority,
      });
      if (result.ok) {
        sent += 1;
      } else {
        failed += 1;
        console.warn(
          `[LiveActivityPush] Push to ${token.slice(0, 8)}… failed ` +
            `(status ${result.status}${result.reason ? `, ${result.reason}` : ''})`
        );
        if (result.shouldPrune) stale.push(token);
      }
    }

    if (stale.length > 0) {
      await prisma.deviceToken.deleteMany({ where: { token: { in: stale } } });
      console.log(`[LiveActivityPush] Pruned ${stale.length} dead Live Activity token(s)`);
    }

    return { sent, failed, tokens: tokens.length };
  }
}

/** Singleton — reads the live fleet from the bridge; its events are wired in index.ts. */
export const liveActivityPush = new LiveActivityPushService({
  listAgents: () => workmuxBridge.list(),
});
