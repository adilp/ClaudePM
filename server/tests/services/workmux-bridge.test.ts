/**
 * WorkmuxBridge pure-logic tests.
 *
 * The pre-agreed test seam is the pure transformation logic: cleaning titles,
 * deriving the worktree/project handles from a workdir, mapping a raw state file
 * to the client Agent DTO, and diffing two polls into a change list. The I/O
 * (fs polling, tmux liveness, timers, WebSocket) is exercised against the real
 * interfaces at runtime, not here.
 */

import { describe, it, expect } from 'vitest';
import {
  cleanTitle,
  deriveWorktree,
  deriveProject,
  toAgent,
  diffAgents,
} from '../../src/services/workmux-bridge.js';
import type { Agent, WorkmuxAgentFile } from '../../src/services/workmux-bridge-types.js';

describe('WorkmuxBridge pure logic', () => {
  describe('cleanTitle', () => {
    it('strips a leading braille spinner glyph and surrounding whitespace', () => {
      expect(cleanTitle('⠐ Set up Workmux project')).toBe('Set up Workmux project');
      expect(cleanTitle('⠂ Claude Code')).toBe('Claude Code');
    });

    it('strips a run of leading spinner glyphs', () => {
      expect(cleanTitle('⠁⠃  Building')).toBe('Building');
    });

    it('leaves a title without a spinner untouched', () => {
      expect(cleanTitle('Fix the login bug')).toBe('Fix the login bug');
    });

    it('trims plain surrounding whitespace', () => {
      expect(cleanTitle('  Deploy  ')).toBe('Deploy');
    });

    it('handles empty / spinner-only input', () => {
      expect(cleanTitle('')).toBe('');
      expect(cleanTitle('⠐')).toBe('');
    });
  });

  describe('deriveWorktree', () => {
    it('returns the worktree name for a worktree path', () => {
      expect(
        deriveWorktree('/Users/Adil/Desktop/projects/canvassApp/CanvassingApp/.worktrees/feebug')
      ).toBe('feebug');
    });

    it('returns the repo name for a main checkout', () => {
      expect(deriveWorktree('/Users/Adil/Desktop/projects/claudePM')).toBe('claudePM');
    });

    it('ignores a trailing slash', () => {
      expect(deriveWorktree('/Users/Adil/Desktop/projects/claudePM/')).toBe('claudePM');
    });
  });

  describe('deriveProject', () => {
    it('returns the segment before .worktrees for a worktree path', () => {
      expect(
        deriveProject('/Users/Adil/Desktop/projects/canvassApp/CanvassingApp/.worktrees/feebug')
      ).toBe('CanvassingApp');
    });

    it('falls back to the basename for a main checkout', () => {
      expect(deriveProject('/Users/Adil/Desktop/projects/tempsso/sso-web')).toBe('sso-web');
      expect(deriveProject('/Users/Adil/Desktop/projects/claudePM')).toBe('claudePM');
    });
  });

  describe('toAgent', () => {
    const raw: WorkmuxAgentFile = {
      pane_key: {
        backend: 'tmux',
        instance: '/private/tmp/tmux-501/default',
        pane_id: '%176',
      },
      workdir: '/Users/Adil/Desktop/projects/claudePM',
      status: 'working',
      status_ts: 1785337703,
      pane_title: '⠐ Set up Workmux project',
      updated_ts: 1785337884,
      window_name: 'DATABASE',
      session_name: 'Database',
      agent_kind: 'claude',
    };

    it('maps a raw state file to the client DTO', () => {
      expect(toAgent(raw)).toEqual<Agent>({
        id: 'tmux:/private/tmp/tmux-501/default:%176',
        worktree: 'claudePM',
        project: 'claudePM',
        status: 'working',
        title: 'Set up Workmux project',
        workdir: '/Users/Adil/Desktop/projects/claudePM',
        statusTs: 1785337703,
        updatedTs: 1785337884,
      });
    });

    it('defaults optional fields (title, timestamps) sensibly', () => {
      const minimal: WorkmuxAgentFile = {
        pane_key: { backend: 'tmux', instance: 'inst', pane_id: '%9' },
        workdir: '/a/b/proj',
        status: 'waiting',
      };
      const agent = toAgent(minimal);
      expect(agent.title).toBe('');
      expect(agent.statusTs).toBe(0);
      expect(agent.updatedTs).toBe(0);
      expect(agent.status).toBe('waiting');
    });
  });

  describe('diffAgents', () => {
    const mk = (over: Partial<Agent> & Pick<Agent, 'id'>): Agent => ({
      worktree: 'wt',
      project: 'proj',
      status: 'working',
      title: 'Task',
      workdir: '/a/b/wt',
      statusTs: 100,
      updatedTs: 100,
      ...over,
    });
    const map = (...agents: Agent[]): Map<string, Agent> =>
      new Map(agents.map((a) => [a.id, a]));

    it('reports added agents', () => {
      const a = mk({ id: 'a' });
      expect(diffAgents(map(), map(a))).toEqual([{ kind: 'added', agent: a }]);
    });

    it('reports removed agents (carrying the previous agent)', () => {
      const a = mk({ id: 'a' });
      expect(diffAgents(map(a), map())).toEqual([{ kind: 'removed', agent: a }]);
    });

    it('reports an update when status changes', () => {
      const before = mk({ id: 'a', status: 'working' });
      const after = mk({ id: 'a', status: 'waiting' });
      expect(diffAgents(map(before), map(after))).toEqual([{ kind: 'updated', agent: after }]);
    });

    it('reports an update when the cleaned title changes', () => {
      const before = mk({ id: 'a', title: 'Old task' });
      const after = mk({ id: 'a', title: 'New task' });
      expect(diffAgents(map(before), map(after))).toEqual([{ kind: 'updated', agent: after }]);
    });

    it('does NOT report a change when only timestamps move (spinner/elapsed churn)', () => {
      const before = mk({ id: 'a', statusTs: 100, updatedTs: 100 });
      const after = mk({ id: 'a', statusTs: 100, updatedTs: 250 });
      expect(diffAgents(map(before), map(after))).toEqual([]);
    });

    it('handles a mixed set: one removed, one added, one unchanged', () => {
      const stable = mk({ id: 'stable' });
      const gone = mk({ id: 'gone' });
      const fresh = mk({ id: 'fresh' });
      const changes = diffAgents(map(stable, gone), map(stable, fresh));
      expect(changes).toContainEqual({ kind: 'removed', agent: gone });
      expect(changes).toContainEqual({ kind: 'added', agent: fresh });
      expect(changes.some((c) => c.agent.id === 'stable')).toBe(false);
      expect(changes).toHaveLength(2);
    });
  });
});
