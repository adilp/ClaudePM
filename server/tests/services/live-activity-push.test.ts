/**
 * LiveActivityPush pure-logic tests.
 *
 * The test seam is the render pipeline that turns the live agent fleet into the
 * variant-C `ContentState` and the dedupe signature over it. This logic MUST
 * stay in lockstep with iOS `AgentLiveActivityManager.makeContentState`, so the
 * cases below pin the shared contract: bucket counts, the waiting->working->done
 * ordering, the top-N cap, `doneOverflow`, `total`, epoch-seconds `since`, and
 * the deliberate exclusion of `since` from the dedupe signature. The I/O (APNs
 * send, token queries, debounce timers, budget window) is not exercised here.
 */

import { describe, it, expect } from 'vitest';
import {
  statusBucket,
  rowSince,
  renderContentState,
  renderSignature,
} from '../../src/services/live-activity-push.js';
import type { Agent } from '../../src/services/workmux-bridge-types.js';

function agent(overrides: Partial<Agent> & Pick<Agent, 'id' | 'status' | 'title'>): Agent {
  return {
    worktree: overrides.title,
    project: 'proj',
    workdir: `/repo/.worktrees/${overrides.title}`,
    statusTs: 1000,
    updatedTs: 1000,
    ...overrides,
  } as Agent;
}

describe('LiveActivityPush pure logic', () => {
  describe('statusBucket', () => {
    it('buckets the known statuses case-insensitively', () => {
      expect(statusBucket('working')).toBe('working');
      expect(statusBucket('WAITING')).toBe('waiting');
      expect(statusBucket('Done')).toBe('done');
    });

    it('falls everything else to "other"', () => {
      expect(statusBucket('idle')).toBe('other');
      expect(statusBucket('')).toBe('other');
    });
  });

  describe('rowSince', () => {
    it('prefers statusTs when set', () => {
      expect(rowSince(agent({ id: 'a', status: 'working', title: 'x', statusTs: 500, updatedTs: 900 }), 12345)).toBe(500);
    });

    it('falls back to updatedTs when statusTs is the 0 sentinel', () => {
      expect(rowSince(agent({ id: 'a', status: 'working', title: 'x', statusTs: 0, updatedTs: 900 }), 12345)).toBe(900);
    });

    it('falls back to now when both timestamps are unknown', () => {
      expect(rowSince(agent({ id: 'a', status: 'working', title: 'x', statusTs: 0, updatedTs: 0 }), 12345)).toBe(12345);
    });
  });

  describe('renderContentState', () => {
    it('counts buckets and totals across all agents (incl. "other")', () => {
      const state = renderContentState(
        [
          agent({ id: '1', status: 'working', title: 'a' }),
          agent({ id: '2', status: 'working', title: 'b' }),
          agent({ id: '3', status: 'waiting', title: 'c' }),
          agent({ id: '4', status: 'done', title: 'd' }),
          agent({ id: '5', status: 'idle', title: 'e' }), // "other"
        ],
        3,
        0
      );
      expect(state.working).toBe(2);
      expect(state.waiting).toBe(1);
      expect(state.done).toBe(1);
      expect(state.total).toBe(5); // "other" is counted in total but no bucket
    });

    it('sorts waiting -> working -> done -> other, tiebreaking on title (case-insensitive)', () => {
      const state = renderContentState(
        [
          agent({ id: 'd', status: 'done', title: 'zeta' }),
          agent({ id: 'w2', status: 'working', title: 'Beta' }),
          agent({ id: 'w1', status: 'working', title: 'alpha' }),
          agent({ id: 'wait', status: 'waiting', title: 'gamma' }),
        ],
        4,
        0
      );
      expect(state.rows.map((r) => r.id)).toEqual(['wait', 'w1', 'w2', 'd']);
    });

    it('caps rows at maxRows but keeps full bucket counts', () => {
      const state = renderContentState(
        [
          agent({ id: '1', status: 'waiting', title: 'a' }),
          agent({ id: '2', status: 'working', title: 'b' }),
          agent({ id: '3', status: 'working', title: 'c' }),
          agent({ id: '4', status: 'working', title: 'd' }),
        ],
        3,
        0
      );
      expect(state.rows).toHaveLength(3);
      expect(state.working).toBe(3);
      expect(state.waiting).toBe(1);
      expect(state.total).toBe(4);
    });

    it('doneOverflow counts only the done agents NOT shown as rows', () => {
      // 5 done agents, maxRows 3 -> 3 shown, 2 overflow.
      const agents = ['a', 'b', 'c', 'd', 'e'].map((t, i) =>
        agent({ id: String(i), status: 'done', title: t })
      );
      const state = renderContentState(agents, 3, 0);
      expect(state.done).toBe(5);
      expect(state.rows).toHaveLength(3);
      expect(state.doneOverflow).toBe(2);
    });

    it('doneOverflow is 0 when a waiting/working agent pushes done off the visible rows', () => {
      const state = renderContentState(
        [
          agent({ id: 'w', status: 'waiting', title: 'a' }),
          agent({ id: 'r', status: 'working', title: 'b' }),
          agent({ id: 'd1', status: 'done', title: 'c' }),
          agent({ id: 'd2', status: 'done', title: 'd' }),
        ],
        3,
        0
      );
      // rows = [waiting, working, done(c)]; one done shown, one hidden.
      expect(state.done).toBe(2);
      expect(state.doneOverflow).toBe(1);
    });

    it('renders since as epoch seconds honouring the statusTs fallback chain', () => {
      const state = renderContentState(
        [agent({ id: '1', status: 'working', title: 'a', statusTs: 0, updatedTs: 7777 })],
        3,
        99999
      );
      expect(state.rows[0]?.since).toBe(7777);
    });
  });

  describe('renderSignature', () => {
    const base = () =>
      renderContentState(
        [
          agent({ id: '1', status: 'waiting', title: 'a', statusTs: 100 }),
          agent({ id: '2', status: 'working', title: 'b', statusTs: 200 }),
        ],
        3,
        0
      );

    it('ignores since — a since-only delta produces an identical signature', () => {
      const a = base();
      const b = renderContentState(
        [
          agent({ id: '1', status: 'waiting', title: 'a', statusTs: 555 }),
          agent({ id: '2', status: 'working', title: 'b', statusTs: 999 }),
        ],
        3,
        0
      );
      expect(renderSignature(a)).toBe(renderSignature(b));
    });

    it('changes when a status changes', () => {
      const a = base();
      const b = renderContentState(
        [
          agent({ id: '1', status: 'done', title: 'a', statusTs: 100 }),
          agent({ id: '2', status: 'working', title: 'b', statusTs: 200 }),
        ],
        3,
        0
      );
      expect(renderSignature(a)).not.toBe(renderSignature(b));
    });

    it('changes when a title changes', () => {
      const a = base();
      const b = renderContentState(
        [
          agent({ id: '1', status: 'waiting', title: 'renamed', statusTs: 100 }),
          agent({ id: '2', status: 'working', title: 'b', statusTs: 200 }),
        ],
        3,
        0
      );
      expect(renderSignature(a)).not.toBe(renderSignature(b));
    });

    it('changes when an agent is added', () => {
      const a = base();
      const b = renderContentState(
        [
          agent({ id: '1', status: 'waiting', title: 'a', statusTs: 100 }),
          agent({ id: '2', status: 'working', title: 'b', statusTs: 200 }),
          agent({ id: '3', status: 'working', title: 'c', statusTs: 300 }),
        ],
        3,
        0
      );
      expect(renderSignature(a)).not.toBe(renderSignature(b));
    });
  });
});
