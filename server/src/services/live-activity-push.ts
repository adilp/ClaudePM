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
 *
 * Push-to-start (issue #13): ActivityKit auto-ends an activity after ~8h, after
 * which the app must be foregrounded to start a fresh one — the lock screen goes
 * dark in the meantime. So this service also *starts* activities remotely: it
 * keeps a `<platform>-liveactivity-start` push-to-start token, and on a flush
 * where the fleet is non-empty and no activity is believed live (`activityLive-
 * Until` null or elapsed) it sends `event: "start"` carrying `attributes-type` +
 * `attributes` + the initial `content-state`. The #10 update path then takes
 * over once the app registers the new per-activity token. Liveness is tracked by
 * an in-memory TTL clock (see `activityLiveUntil`) so we never stack duplicate
 * activities on a backgrounded device.
 */

import { prisma } from '../config/db.js';
import { env } from '../config/env.js';
import { apnsClient } from './apns-client.js';
import { workmuxBridge } from './workmux-bridge.js';
import type { Agent } from './workmux-bridge-types.js';
import {
  LIVE_ACTIVITY_ATTRIBUTES,
  LIVE_ACTIVITY_ATTRIBUTES_TYPE,
} from './live-activity-push-types.js';
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

/**
 * Whether the server should send a push-to-start now (issue #13).
 *
 * We START when the fleet is non-empty and we do NOT currently believe an
 * activity is live for the device — i.e. `liveUntil` is null (never started /
 * fleet had emptied) or has elapsed (the ~8h ActivityKit expiry passed). While
 * we believe one is live we suppress starts so a backgrounded device never
 * stacks duplicate lock-screen activities.
 */
export function shouldStartActivity(
  fleetNonEmpty: boolean,
  liveUntil: number | null,
  nowMs: number
): boolean {
  if (!fleetNonEmpty) return false;
  return liveUntil === null || nowMs >= liveUntil;
}

/**
 * Build the `aps` dictionary for a push-to-start (`event: "start"`) payload.
 * Unlike an update, a start MUST carry `attributes-type` (the Swift struct name)
 * and `attributes` (its root fields) so ActivityKit can materialise the activity
 * with no app involvement; the initial `content-state` is the current fleet.
 */
export function buildStartAps(
  state: LiveActivityContentState,
  nowSec: number,
  staleSec: number | null
): Record<string, unknown> {
  const active = state.working + state.waiting;
  return {
    timestamp: nowSec,
    event: 'start' satisfies LiveActivityEvent,
    'attributes-type': LIVE_ACTIVITY_ATTRIBUTES_TYPE,
    attributes: LIVE_ACTIVITY_ATTRIBUTES,
    'content-state': state,
    ...(staleSec !== null && { 'stale-date': staleSec }),
    // A push-to-START must carry an `alert` to actually surface: a start without
    // one is accepted by APNs (200) but ActivityKit silently declines to present
    // it on the lock screen. (An `update` needs no alert — the activity already
    // exists.) The alert doubles as the "your fleet is live again" nudge on the
    // ~8h revival, which is exactly when we want the user's attention.
    alert: {
      title: 'workmux',
      body: `${active} active · ${state.waiting} waiting · ${state.done} done`,
      sound: 'default',
    },
  };
}

// ============================================================================
// Service
// ============================================================================

const ONE_HOUR_MS = 60 * 60 * 1000;
// Live Activity tokens are stored in device_tokens with a platform suffix
// (see devices.ts). Two kinds, distinguished by suffix:
//   - `<platform>-liveactivity`        — per-activity UPDATE tokens (#10). Match
//     with `endsWith: 'liveactivity'`, which deliberately EXCLUDES the start
//     suffix below (that ends with `-start`).
//   - `<platform>-liveactivity-start`  — app-lifetime PUSH-TO-START tokens (#13).
const UPDATE_TOKEN_SUFFIX = 'liveactivity';
const START_TOKEN_SUFFIX = 'liveactivity-start';

interface LiveActivityPushDeps {
  /** Current full fleet snapshot (defaults to the workmux bridge). */
  listAgents: () => Agent[];
  /** Injectable clock in ms (defaults to Date.now) — for tests. */
  now?: () => number;
  debounceMs?: number;
  maxPerHour?: number;
  staleMs?: number;
  maxRows?: number;
  /** How long a started activity is assumed live (suppresses re-starts). */
  startTtlMs?: number;
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
  private readonly startTtlMs: number;

  private flushTimer: ReturnType<typeof setTimeout> | null = null;
  /** Signature of the last state we pushed; null once ended / never pushed. */
  private activeSignature: string | null = null;
  /** Last pushed `waiting` count — drives priority escalation. */
  private lastWaiting = 0;
  /** Epoch-ms of recent pushes, for the sliding-window budget. */
  private sendWindow: number[] = [];
  /**
   * Epoch-ms until which we believe an activity is live on the device, so we
   * suppress a duplicate push-to-start (issue #13). Set when we send a start OR
   * when the app confirms a live per-activity token; cleared when the fleet
   * empties (we end the activity). `null` => nothing believed live.
   *
   * In-memory by design: a server restart resets it to null, so the next flush
   * may push one start even if an activity is already live — the client dedupes
   * it (adopts one, ends the extra). For a single-user app that's an acceptable
   * self-healing edge over persisting cross-process activity state.
   */
  private activityLiveUntil: number | null = null;

  constructor(deps: LiveActivityPushDeps) {
    this.listAgents = deps.listAgents;
    this.now = deps.now ?? (() => Date.now());
    this.debounceMs = deps.debounceMs ?? env.LIVE_ACTIVITY_DEBOUNCE_MS;
    this.maxPerHour = deps.maxPerHour ?? env.LIVE_ACTIVITY_MAX_PER_HOUR;
    this.staleMs = deps.staleMs ?? env.LIVE_ACTIVITY_STALE_MS;
    this.maxRows = deps.maxRows ?? env.LIVE_ACTIVITY_MAX_ROWS;
    this.startTtlMs = deps.startTtlMs ?? env.LIVE_ACTIVITY_START_TTL_MS;
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
   * The app registered a per-activity **update** token — i.e. it just observed a
   * live activity (started in-app, adopted on relaunch, or materialised from a
   * remote start). That's a positive confirmation an activity is on screen, so
   * push its liveness window forward and suppress redundant starts (issue #13).
   */
  noteActivityRegistered(): void {
    this.activityLiveUntil = this.now() + this.startTtlMs;
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

      // Fleet empty => end a live activity if one is running, and forget any
      // liveness window (nothing should be on screen now).
      if (agents.length === 0) {
        if (this.activeSignature !== null) {
          await this.pushEnd(nowSec);
          this.activeSignature = null;
          this.lastWaiting = 0;
        }
        this.activityLiveUntil = null;
        return;
      }

      const state = renderContentState(agents, this.maxRows, nowSec);
      const signature = renderSignature(state);

      // Push-to-start FIRST, and independently of the content dedupe below: an
      // activity can expire (~8h) while the fleet sits unchanged, so a start may
      // be due even when nothing visible changed (issue #13).
      if (shouldStartActivity(true, this.activityLiveUntil, nowMs)) {
        const result = await this.pushStart(state, nowSec);
        if (result.tokens > 0) {
          this.activityLiveUntil = nowMs + this.startTtlMs;
          // The start payload carries the current content, so the running
          // activity is now in sync — record it as the pushed signature so the
          // update path below doesn't immediately re-send the same frame.
          this.activeSignature = signature;
          this.lastWaiting = state.waiting;
        }
      }

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
    const tokens = await this.getUpdateTokens();

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

  /**
   * Force a push-to-START of the current fleet to every push-to-start token,
   * bypassing the liveness guard — the "confirm receipt on device" trigger for
   * push-to-start setup (mirrors `pushNow` for content updates, issue #13).
   * With an empty fleet there is nothing to start, so `agents: 0` and no push.
   */
  async startNow(): Promise<LiveActivityPushResult> {
    const nowSec = Math.floor(this.now() / 1000);
    const agents = this.listAgents();
    const tokens = await this.getStartTokens();

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
    const result = await this.pushStart(state, nowSec, tokens);
    if (result.tokens > 0) {
      // We just (re)started; treat the activity as live and in-sync so the
      // automatic path doesn't immediately re-start or re-send the same frame.
      this.activityLiveUntil = this.now() + this.startTtlMs;
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

  /** Per-activity UPDATE tokens (`*-liveactivity`, NOT the `-start` push tokens). */
  private async getUpdateTokens(): Promise<string[]> {
    const rows = await prisma.deviceToken.findMany({
      where: { platform: { endsWith: UPDATE_TOKEN_SUFFIX } },
      select: { token: true },
    });
    // `endsWith: 'liveactivity'` excludes `*-liveactivity-start` (ends with
    // `-start`), so update pushes never target a push-to-start token.
    return rows.map((r) => r.token);
  }

  /** App-lifetime PUSH-TO-START tokens (`*-liveactivity-start`). */
  private async getStartTokens(): Promise<string[]> {
    const rows = await prisma.deviceToken.findMany({
      where: { platform: { endsWith: START_TOKEN_SUFFIX } },
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
    const tokens = knownTokens ?? (await this.getUpdateTokens());
    return this.sendToTokens(payload, priority, tokens);
  }

  /**
   * Send a push-to-start to every registered push-to-start token (issue #13).
   * The initial content is the current fleet; the running activity then rides
   * the normal update path (#10) once the app registers its per-activity token.
   */
  private async pushStart(
    state: LiveActivityContentState,
    nowSec: number,
    knownTokens?: string[]
  ): Promise<{ sent: number; failed: number; tokens: number }> {
    const staleSec = this.staleMs > 0 ? nowSec + Math.floor(this.staleMs / 1000) : null;
    const payload: Record<string, unknown> = { aps: buildStartAps(state, nowSec, staleSec) };
    const tokens = knownTokens ?? (await this.getStartTokens());
    return this.sendToTokens(payload, 10, tokens);
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
    return this.sendToTokens(payload, 10, await this.getUpdateTokens());
  }

  /**
   * Fan a payload out to every Live Activity token, pruning any Apple reports as
   * permanently invalid (an ended activity's token goes stale). Mirrors
   * `notification-service.sendPush`.
   */
  private async sendToTokens(
    payload: Record<string, unknown>,
    priority: 5 | 10,
    tokens: string[]
  ): Promise<{ sent: number; failed: number; tokens: number }> {
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
