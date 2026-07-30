/**
 * Types for the Live Activity push service (server -> APNs -> lock screen).
 *
 * The `LiveActivityContentState` below is the server's mirror of the iOS
 * `AgentActivityAttributes.ContentState` (issue #9, variant C). ActivityKit
 * decodes a pushed `content-state` with a **default** `JSONDecoder`, so:
 *   - keys must match the Swift property names EXACTLY (camelCase — `doneOverflow`,
 *     not `done_overflow`); and
 *   - `Date` fields decode from **Unix epoch SECONDS** (a JSON number), matching
 *     the app's `Date(timeIntervalSince1970:)`. Hence `since: number` (seconds).
 * The Swift `active` (working + waiting) is a computed property, so it is NOT
 * encoded here — sending it would just be ignored.
 *
 * See `live-activity-push.ts` for the pure render logic and the push service.
 */

/** One agent row — mirrors `AgentActivityAttributes.ContentState.Row`. */
export interface LiveActivityRow {
  /** Stable agent id (see `Agent.id`). */
  id: string;
  /** Raw workmux status: "working" | "waiting" | "done" | other. */
  status: string;
  /** Task title (spinner glyph already stripped by the bridge). */
  title: string;
  /** `wm merge` target handle, e.g. "feebug". */
  worktree: string;
  /** When the status last changed, as **Unix epoch seconds** (decoded to `Date`). */
  since: number;
}

/** Mirror of the iOS `ContentState`; encoded as the push `aps.content-state`. */
export interface LiveActivityContentState {
  /** Fleet-wide count of agents whose status buckets to "working". */
  working: number;
  /** ...to "waiting". */
  waiting: number;
  /** ...to "done". */
  done: number;
  /** Total agents (all statuses, including "other"). */
  total: number;
  /** Top-N agents, already sorted + capped (waiting -> working -> done -> title). */
  rows: LiveActivityRow[];
  /** `done` agents NOT present in `rows` — the "+N done" footer. */
  doneOverflow: number;
}

/**
 * ActivityKit lifecycle event for a Live Activity push.
 *   - `start`  — remotely START an activity via push-to-start (issue #13). Only
 *                valid when addressed to a **push-to-start** token; the payload
 *                additionally carries `attributes-type` + `attributes`.
 *   - `update` — push new content to an already-running activity (issue #10).
 *   - `end`    — end a running activity.
 */
export type LiveActivityEvent = 'start' | 'update' | 'end';

/**
 * For a push-to-start (`event: "start"`) payload, `attributes-type` MUST equal
 * the Swift `ActivityAttributes` struct name exactly, and `attributes` MUST be
 * the JSON of its non-`ContentState` (root) fields. Our struct is
 * `AgentActivityAttributes` with a single `appName` field defaulting to
 * "workmux" — see `apps/ios/ClaudePM/Models/AgentActivityAttributes.swift`.
 * ActivityKit decodes these with a default `JSONDecoder`, so the key/value must
 * match the Swift property names verbatim.
 */
export const LIVE_ACTIVITY_ATTRIBUTES_TYPE = 'AgentActivityAttributes';

/** The root attributes for a push-to-start payload (mirrors `appName`). */
export const LIVE_ACTIVITY_ATTRIBUTES = { appName: 'workmux' } as const;
