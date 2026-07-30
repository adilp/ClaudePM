/**
 * WorkmuxExecutor tests.
 *
 * The executor takes injectable seams (exec, agentsProvider, readTasksFile), so
 * nothing here spawns a real process or touches the filesystem.
 */

import { describe, test, expect, vi } from 'vitest';
import { WorkmuxExecutor } from '../../src/services/workmux-executor.js';
import {
  buildAddArgs,
  buildMergeArgs,
  buildRemoveArgs,
  isWorktreeClean,
  parseTaskPresets,
  AgentNotFoundError,
  NoProjectAgentError,
  WorkmuxCommandError,
  WorktreeDirtyError,
  type ExecFn,
  type RunOutcome,
} from '../../src/services/workmux-executor-types.js';
import type { Agent } from '../../src/services/workmux-bridge-types.js';

// ----------------------------------------------------------------------------
// Fixtures
// ----------------------------------------------------------------------------

function makeAgent(overrides: Partial<Agent> = {}): Agent {
  return {
    id: 'tmux:/private/tmp/tmux-501/default:%176',
    worktree: 'feebug',
    project: 'CanvassingApp',
    status: 'done',
    title: 'Fix the bug',
    workdir: '/Users/dev/canvassApp/.worktrees/feebug',
    statusTs: 100,
    updatedTs: 100,
    ...overrides,
  };
}

const ok = (stdout = 'done', stderr = ''): RunOutcome => ({ stdout, stderr, code: 0 });
const fail = (code = 1, stderr = 'boom', stdout = ''): RunOutcome => ({ stdout, stderr, code });

/** A fake exec that records every call and returns queued/mapped outcomes. */
function fakeExec(
  handler: (bin: string, args: string[], cwd: string) => RunOutcome
): { exec: ExecFn; calls: Array<{ bin: string; args: string[]; cwd: string }> } {
  const calls: Array<{ bin: string; args: string[]; cwd: string }> = [];
  const exec: ExecFn = async (bin, args, cwd) => {
    calls.push({ bin, args, cwd });
    return handler(bin, args, cwd);
  };
  return { exec, calls };
}

// ----------------------------------------------------------------------------
// Pure helpers
// ----------------------------------------------------------------------------

describe('argument builders', () => {
  test('buildMergeArgs has no name arg or force', () => {
    expect(buildMergeArgs()).toEqual(['merge']);
  });

  test('buildRemoveArgs always forces (we pre-check dirtiness)', () => {
    expect(buildRemoveArgs()).toEqual(['remove', '-f']);
  });

  test('buildAddArgs backgrounds and omits -p when no task', () => {
    expect(buildAddArgs('my-branch')).toEqual(['add', 'my-branch', '-b']);
  });

  test('buildAddArgs includes -p with the task as a single arg', () => {
    expect(buildAddArgs('my-branch', 'Do the thing')).toEqual([
      'add',
      'my-branch',
      '-p',
      'Do the thing',
      '-b',
    ]);
  });

  test('buildAddArgs treats a blank/whitespace task as no task', () => {
    expect(buildAddArgs('b', '   ')).toEqual(['add', 'b', '-b']);
  });
});

describe('isWorktreeClean', () => {
  test('empty porcelain is clean', () => {
    expect(isWorktreeClean('')).toBe(true);
    expect(isWorktreeClean('   \n  ')).toBe(true);
  });

  test('any porcelain line is dirty', () => {
    expect(isWorktreeClean(' M src/app.ts')).toBe(false);
    expect(isWorktreeClean('?? new.ts\n')).toBe(false);
  });
});

describe('parseTaskPresets', () => {
  test('parses a plain list of strings', () => {
    const yaml = ['- Fix the failing tests', '- Add a feature flag', '- Refactor auth'].join('\n');
    expect(parseTaskPresets(yaml)).toEqual([
      'Fix the failing tests',
      'Add a feature flag',
      'Refactor auth',
    ]);
  });

  test('strips matching surrounding quotes', () => {
    const yaml = `- "Add a feature flag for X"\n- 'Refactor the auth module'`;
    expect(parseTaskPresets(yaml)).toEqual([
      'Add a feature flag for X',
      'Refactor the auth module',
    ]);
  });

  test('skips blanks, comments, and doc markers', () => {
    const yaml = ['---', '# a comment', '', '- Real task', '   ', '...'].join('\n');
    expect(parseTaskPresets(yaml)).toEqual(['Real task']);
  });

  test('ignores non-list lines rather than erroring', () => {
    const yaml = 'tasks:\n  not a list item\n- Actual task';
    expect(parseTaskPresets(yaml)).toEqual(['Actual task']);
  });

  test('empty text yields an empty list', () => {
    expect(parseTaskPresets('')).toEqual([]);
  });
});

// ----------------------------------------------------------------------------
// merge
// ----------------------------------------------------------------------------

describe('merge', () => {
  test('runs `workmux merge` in the agent workdir with no name/force', async () => {
    const agent = makeAgent();
    const { exec, calls } = fakeExec(() => ok('Merged feebug into main'));
    const ex = new WorkmuxExecutor({ exec, agentsProvider: () => [agent] });

    const result = await ex.merge(agent.id);

    expect(calls).toEqual([{ bin: 'workmux', args: ['merge'], cwd: agent.workdir }]);
    expect(result).toMatchObject({
      action: 'merge',
      workdir: agent.workdir,
      exitCode: 0,
      stdout: 'Merged feebug into main',
    });
  });

  test('unknown id throws AgentNotFoundError before running anything', async () => {
    const { exec, calls } = fakeExec(() => ok());
    const ex = new WorkmuxExecutor({ exec, agentsProvider: () => [makeAgent()] });

    await expect(ex.merge('nope')).rejects.toBeInstanceOf(AgentNotFoundError);
    expect(calls).toHaveLength(0);
  });

  test('non-zero exit surfaces workmux output as WorkmuxCommandError', async () => {
    const agent = makeAgent();
    const { exec } = fakeExec(() => fail(1, 'error: uncommitted changes'));
    const ex = new WorkmuxExecutor({ exec, agentsProvider: () => [agent] });

    await expect(ex.merge(agent.id)).rejects.toMatchObject({
      code: 'WORKMUX_FAILED',
      outcome: { stderr: 'error: uncommitted changes', code: 1 },
    });
  });
});

// ----------------------------------------------------------------------------
// remove
// ----------------------------------------------------------------------------

describe('remove', () => {
  test('clean worktree → git status then `workmux remove -f`', async () => {
    const agent = makeAgent();
    const { exec, calls } = fakeExec((bin) => (bin === 'git' ? ok('') : ok('Removed')));
    const ex = new WorkmuxExecutor({ exec, agentsProvider: () => [agent] });

    const result = await ex.remove(agent.id);

    expect(calls[0]).toEqual({ bin: 'git', args: ['status', '--porcelain'], cwd: agent.workdir });
    expect(calls[1]).toEqual({ bin: 'workmux', args: ['remove', '-f'], cwd: agent.workdir });
    expect(result.action).toBe('remove');
  });

  test('dirty worktree without force → WorktreeDirtyError, no workmux run', async () => {
    const agent = makeAgent();
    const { exec, calls } = fakeExec((bin) =>
      bin === 'git' ? ok(' M src/app.ts\n?? new.ts') : ok('Removed')
    );
    const ex = new WorkmuxExecutor({ exec, agentsProvider: () => [agent] });

    const err = await ex.remove(agent.id).catch((e) => e);
    expect(err).toBeInstanceOf(WorktreeDirtyError);
    expect((err as WorktreeDirtyError).files).toEqual(['src/app.ts', 'new.ts']);
    // Only the git status ran; workmux remove did NOT.
    expect(calls).toHaveLength(1);
    expect(calls[0]?.bin).toBe('git');
  });

  test('dirty worktree with force → `workmux remove -f` runs', async () => {
    const agent = makeAgent();
    const { exec, calls } = fakeExec((bin) =>
      bin === 'git' ? ok(' M src/app.ts') : ok('Removed (discarded changes)')
    );
    const ex = new WorkmuxExecutor({ exec, agentsProvider: () => [agent] });

    const result = await ex.remove(agent.id, true);

    expect(calls.map((c) => c.bin)).toEqual(['git', 'workmux']);
    expect(calls[1]?.args).toEqual(['remove', '-f']);
    expect(result.stdout).toBe('Removed (discarded changes)');
  });
});

// ----------------------------------------------------------------------------
// add
// ----------------------------------------------------------------------------

describe('add', () => {
  test('runs from an existing workdir of the chosen project', async () => {
    const a1 = makeAgent({ id: 'a1', project: 'CanvassingApp', workdir: '/repos/canvass/wt-a' });
    const a2 = makeAgent({ id: 'a2', project: 'OtherProj', workdir: '/repos/other/wt-b' });
    const { exec, calls } = fakeExec(() => ok('Created worktree'));
    const ex = new WorkmuxExecutor({ exec, agentsProvider: () => [a1, a2] });

    const result = await ex.add('CanvassingApp', 'new-feature', 'Ship it');

    expect(calls).toEqual([
      { bin: 'workmux', args: ['add', 'new-feature', '-p', 'Ship it', '-b'], cwd: '/repos/canvass/wt-a' },
    ]);
    expect(result).toMatchObject({ action: 'add', exitCode: 0 });
    expect(result.workdir).toBeUndefined();
  });

  test('no existing agent for the project → NoProjectAgentError (bootstrap gap)', async () => {
    const { exec, calls } = fakeExec(() => ok());
    const ex = new WorkmuxExecutor({ exec, agentsProvider: () => [makeAgent({ project: 'X' })] });

    await expect(ex.add('Empty', 'b')).rejects.toBeInstanceOf(NoProjectAgentError);
    expect(calls).toHaveLength(0);
  });

  test('non-zero exit surfaces as WorkmuxCommandError', async () => {
    const agent = makeAgent({ project: 'P', workdir: '/repos/p/wt' });
    const { exec } = fakeExec(() => fail(1, "fatal: a branch named 'b' already exists"));
    const ex = new WorkmuxExecutor({ exec, agentsProvider: () => [agent] });

    await expect(ex.add('P', 'b')).rejects.toBeInstanceOf(WorkmuxCommandError);
  });
});

// ----------------------------------------------------------------------------
// task presets
// ----------------------------------------------------------------------------

describe('getTaskPresets', () => {
  test('missing file → empty list', async () => {
    const ex = new WorkmuxExecutor({ readTasksFile: async () => null });
    expect(await ex.getTaskPresets()).toEqual([]);
  });

  test('reads and parses the list', async () => {
    const ex = new WorkmuxExecutor({
      readTasksFile: async () => '- One\n- Two',
    });
    expect(await ex.getTaskPresets()).toEqual(['One', 'Two']);
  });

  test('reader is only consulted once per call', async () => {
    const readTasksFile = vi.fn(async () => '- Only');
    const ex = new WorkmuxExecutor({ readTasksFile });
    await ex.getTaskPresets();
    expect(readTasksFile).toHaveBeenCalledTimes(1);
  });
});
