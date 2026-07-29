/**
 * Types and errors for the WorkmuxBridge service.
 *
 * The bridge reads workmux's on-disk agent state
 * (`~/.local/state/workmux/agents/*.json`) and surfaces it to the app as a
 * live, global list of worktree "agents". See `workmux-bridge.ts`.
 */

import { z } from 'zod';

/**
 * Raw shape of a single workmux agent state file.
 *
 * Only the fields the bridge relies on are validated; everything else is
 * allowed through so a workmux format bump doesn't break parsing. Non-essential
 * fields are optional for resilience against partial/legacy writes.
 */
export const workmuxAgentFileSchema = z
  .object({
    pane_key: z.object({
      backend: z.string(),
      instance: z.string(),
      pane_id: z.string(),
    }),
    workdir: z.string(),
    status: z.string(),
    status_ts: z.number().optional(),
    pane_title: z.string().optional(),
    updated_ts: z.number().optional(),
    window_name: z.string().optional(),
    session_name: z.string().optional(),
    agent_kind: z.string().optional(),
  })
  .passthrough();

export type WorkmuxAgentFile = z.infer<typeof workmuxAgentFileSchema>;

/**
 * Client-facing agent DTO — a single workmux worktree session.
 *
 * Deliberately does NOT carry the pane id: the app never targets an agent's
 * pane (all agent interaction happens in the Claude Code mobile app). `worktree`
 * is the handle the app hands to `wm merge`; `project` is for grouping.
 */
export interface Agent {
  /** Stable, globally-unique id: `${backend}:${instance}:${pane_id}`. */
  id: string;
  /** `wm merge` target — basename of the workdir, e.g. "feebug". */
  worktree: string;
  /** Parent repo for grouping, e.g. "CanvassingApp". */
  project: string;
  /** workmux status, passed through: "working" | "waiting" | "done" | ... */
  status: string;
  /** pane_title with the animated spinner glyph stripped. */
  title: string;
  /** Absolute worktree path. */
  workdir: string;
  /** Epoch seconds when status last changed (for "elapsed"). 0 if unknown. */
  statusTs: number;
  /** Epoch seconds of the last state write (staleness). 0 if unknown. */
  updatedTs: number;
}

/** A single change detected between two polls. */
export type AgentChange =
  | { kind: 'added'; agent: Agent }
  | { kind: 'updated'; agent: Agent }
  | { kind: 'removed'; agent: Agent };

/**
 * Events emitted by the bridge. `agent:update` fires for both new and changed
 * agents (the payload carries the full agent); `agent:removed` when a worktree
 * session goes away (file deleted or its pane is no longer alive in tmux).
 */
export interface WorkmuxBridgeEvents {
  'agent:update': (agent: Agent) => void;
  'agent:removed': (agent: Agent) => void;
}
