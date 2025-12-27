/**
 * Git Service Tests
 * Tests for git operations: diff, status, branch info
 */

import { describe, test, expect, vi, beforeEach, afterEach } from 'vitest';

// Mock child_process before importing the service
const { mockExecAsync } = vi.hoisted(() => ({
  mockExecAsync: vi.fn(),
}));

vi.mock('child_process', () => ({
  exec: vi.fn(),
}));

vi.mock('util', async (importOriginal) => {
  const actual = await importOriginal<typeof import('util')>();
  return {
    ...actual,
    promisify: () => mockExecAsync,
  };
});

// ============================================================================
// Error Classes Tests
// ============================================================================

describe('Git Error Classes', () => {
  // Import dynamically after mocks are set up
  let GitError: typeof import('../../src/services/git-types.js').GitError;
  let NotAGitRepositoryError: typeof import('../../src/services/git-types.js').NotAGitRepositoryError;
  let GitCommandError: typeof import('../../src/services/git-types.js').GitCommandError;
  let GitTimeoutError: typeof import('../../src/services/git-types.js').GitTimeoutError;

  beforeEach(async () => {
    const types = await import('../../src/services/git-types.js');
    GitError = types.GitError;
    NotAGitRepositoryError = types.NotAGitRepositoryError;
    GitCommandError = types.GitCommandError;
    GitTimeoutError = types.GitTimeoutError;
  });

  test('GitError should have correct properties', () => {
    const error = new GitError('test error', 'TEST_CODE');
    expect(error.message).toBe('test error');
    expect(error.code).toBe('TEST_CODE');
    expect(error.name).toBe('GitError');
    expect(error instanceof Error).toBe(true);
  });

  test('NotAGitRepositoryError should include path', () => {
    const error = new NotAGitRepositoryError('/path/to/dir');
    expect(error.message).toBe('Not a git repository: /path/to/dir');
    expect(error.code).toBe('NOT_A_GIT_REPOSITORY');
    expect(error.path).toBe('/path/to/dir');
    expect(error.name).toBe('NotAGitRepositoryError');
  });

  test('GitCommandError should include command and stderr', () => {
    const error = new GitCommandError('git diff', 128, 'fatal: bad revision');
    expect(error.message).toBe('Git command failed: git diff (exit code 128)');
    expect(error.code).toBe('GIT_COMMAND_FAILED');
    expect(error.command).toBe('git diff');
    expect(error.exitCode).toBe(128);
    expect(error.stderr).toBe('fatal: bad revision');
    expect(error.name).toBe('GitCommandError');
  });

  test('GitTimeoutError should include timeout value', () => {
    const error = new GitTimeoutError('git diff', 10000);
    expect(error.message).toBe('Git command timed out after 10000ms: git diff');
    expect(error.code).toBe('GIT_TIMEOUT');
    expect(error.command).toBe('git diff');
    expect(error.timeoutMs).toBe(10000);
    expect(error.name).toBe('GitTimeoutError');
  });
});

// ============================================================================
// Configuration Tests
// ============================================================================

describe('Git Configuration', () => {
  let DEFAULT_GIT_CONFIG: typeof import('../../src/services/git-types.js').DEFAULT_GIT_CONFIG;

  beforeEach(async () => {
    const types = await import('../../src/services/git-types.js');
    DEFAULT_GIT_CONFIG = types.DEFAULT_GIT_CONFIG;
  });

  test('DEFAULT_GIT_CONFIG should have correct defaults', () => {
    expect(DEFAULT_GIT_CONFIG.timeoutMs).toBe(10_000);
    expect(DEFAULT_GIT_CONFIG.cacheTtlMs).toBe(5_000);
    expect(DEFAULT_GIT_CONFIG.maxDiffLines).toBe(5000);
    expect(DEFAULT_GIT_CONFIG.excludePatterns).toEqual(['*.md']);
    expect(DEFAULT_GIT_CONFIG.defaultBaseBranch).toBe('main');
  });
});

// ============================================================================
// Diff Parsing Tests
// ============================================================================

describe('Diff Parsing', () => {
  let parseDiff: typeof import('../../src/services/git-types.js').parseDiff;

  beforeEach(async () => {
    const types = await import('../../src/services/git-types.js');
    parseDiff = types.parseDiff;
  });

  test('parseDiff should parse a simple file modification', () => {
    const diffOutput = `diff --git a/src/index.ts b/src/index.ts
index abc1234..def5678 100644
--- a/src/index.ts
+++ b/src/index.ts
@@ -1,3 +1,4 @@
 import express from 'express';
+import { env } from './config/env.js';

 const app = express();`;

    const result = parseDiff(diffOutput);

    expect(result).toHaveLength(1);
    expect(result[0].filePath).toBe('src/index.ts');
    expect(result[0].changeType).toBe('modified');
    expect(result[0].hunks).toHaveLength(1);
    expect(result[0].hunks[0].oldStart).toBe(1);
    expect(result[0].hunks[0].oldCount).toBe(3);
    expect(result[0].hunks[0].newStart).toBe(1);
    expect(result[0].hunks[0].newCount).toBe(4);
  });

  test('parseDiff should detect added files', () => {
    const diffOutput = `diff --git a/src/new-file.ts b/src/new-file.ts
new file mode 100644
index 0000000..abc1234
--- /dev/null
+++ b/src/new-file.ts
@@ -0,0 +1,5 @@
+export function newFunction() {
+  return 'hello';
+}`;

    const result = parseDiff(diffOutput);

    expect(result).toHaveLength(1);
    expect(result[0].filePath).toBe('src/new-file.ts');
    expect(result[0].changeType).toBe('added');
  });

  test('parseDiff should detect deleted files', () => {
    const diffOutput = `diff --git a/src/old-file.ts b/src/old-file.ts
deleted file mode 100644
index abc1234..0000000
--- a/src/old-file.ts
+++ /dev/null
@@ -1,5 +0,0 @@
-export function oldFunction() {
-  return 'goodbye';
-}`;

    const result = parseDiff(diffOutput);

    expect(result).toHaveLength(1);
    expect(result[0].filePath).toBe('src/old-file.ts');
    expect(result[0].changeType).toBe('deleted');
  });

  test('parseDiff should handle multiple files', () => {
    const diffOutput = `diff --git a/file1.ts b/file1.ts
index abc..def 100644
--- a/file1.ts
+++ b/file1.ts
@@ -1 +1,2 @@
 line1
+line2
diff --git a/file2.ts b/file2.ts
index 123..456 100644
--- a/file2.ts
+++ b/file2.ts
@@ -1 +1 @@
-old
+new`;

    const result = parseDiff(diffOutput);

    expect(result).toHaveLength(2);
    expect(result[0].filePath).toBe('file1.ts');
    expect(result[1].filePath).toBe('file2.ts');
  });

  test('parseDiff should handle empty diff', () => {
    const result = parseDiff('');
    expect(result).toEqual([]);
  });

  test('parseDiff should detect renamed files', () => {
    const diffOutput = `diff --git a/old-name.ts b/new-name.ts
similarity index 95%
rename from old-name.ts
rename to new-name.ts
index abc..def 100644
--- a/old-name.ts
+++ b/new-name.ts
@@ -1 +1 @@
-old
+new`;

    const result = parseDiff(diffOutput);

    expect(result).toHaveLength(1);
    expect(result[0].filePath).toBe('new-name.ts');
    expect(result[0].oldFilePath).toBe('old-name.ts');
    expect(result[0].changeType).toBe('renamed');
  });
});

// ============================================================================
// Status Parsing Tests
// ============================================================================

describe('Status Parsing', () => {
  let parseStatus: typeof import('../../src/services/git-types.js').parseStatus;

  beforeEach(async () => {
    const types = await import('../../src/services/git-types.js');
    parseStatus = types.parseStatus;
  });

  test('parseStatus should parse branch info', () => {
    const statusOutput = `## main...origin/main
M  src/index.ts
?? new-file.ts`;

    const result = parseStatus(statusOutput);

    expect(result.branch).toBe('main');
    expect(result.upstream).toBe('origin/main');
  });

  test('parseStatus should parse staged files', () => {
    const statusOutput = `## main
M  src/index.ts
A  src/new-file.ts`;

    const result = parseStatus(statusOutput);

    expect(result.staged).toHaveLength(2);
    expect(result.staged[0]).toEqual({ path: 'src/index.ts', status: 'modified' });
    expect(result.staged[1]).toEqual({ path: 'src/new-file.ts', status: 'added' });
  });

  test('parseStatus should parse unstaged files', () => {
    const statusOutput = `## main
 M src/changed.ts
 D src/deleted.ts`;

    const result = parseStatus(statusOutput);

    expect(result.unstaged).toHaveLength(2);
    expect(result.unstaged[0]).toEqual({ path: 'src/changed.ts', status: 'modified' });
    expect(result.unstaged[1]).toEqual({ path: 'src/deleted.ts', status: 'deleted' });
  });

  test('parseStatus should parse untracked files', () => {
    const statusOutput = `## main
?? new-file.ts
?? another-file.ts`;

    const result = parseStatus(statusOutput);

    expect(result.untracked).toHaveLength(2);
    expect(result.untracked).toContain('new-file.ts');
    expect(result.untracked).toContain('another-file.ts');
  });

  test('parseStatus should detect clean working directory', () => {
    const statusOutput = `## main`;

    const result = parseStatus(statusOutput);

    expect(result.clean).toBe(true);
    expect(result.staged).toEqual([]);
    expect(result.unstaged).toEqual([]);
    expect(result.untracked).toEqual([]);
  });

  test('parseStatus should detect dirty working directory', () => {
    const statusOutput = `## main
M  src/index.ts`;

    const result = parseStatus(statusOutput);

    expect(result.clean).toBe(false);
  });

  test('parseStatus should detect detached HEAD', () => {
    const statusOutput = `## HEAD (no branch)
M  src/index.ts`;

    const result = parseStatus(statusOutput);

    expect(result.detached).toBe(true);
    expect(result.branch).toBeNull();
  });

  test('parseStatus should parse ahead/behind counts', () => {
    const statusOutput = `## main...origin/main [ahead 2, behind 1]
M  src/index.ts`;

    const result = parseStatus(statusOutput);

    expect(result.ahead).toBe(2);
    expect(result.behind).toBe(1);
  });
});

// ============================================================================
// GitService Tests
// ============================================================================

describe('GitService', () => {
  let GitService: typeof import('../../src/services/git.js').GitService;
  let gitService: InstanceType<typeof import('../../src/services/git.js').GitService>;

  beforeEach(async () => {
    vi.clearAllMocks();
    const mod = await import('../../src/services/git.js');
    GitService = mod.GitService;
    gitService = new GitService();
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  describe('getDiff', () => {
    test('should return parsed diff for a repository', async () => {
      const mockDiff = `diff --git a/src/index.ts b/src/index.ts
index abc..def 100644
--- a/src/index.ts
+++ b/src/index.ts
@@ -1 +1,2 @@
 line1
+line2`;

      mockExecAsync.mockResolvedValueOnce({ stdout: mockDiff, stderr: '' });

      const result = await gitService.getDiff('/path/to/repo');

      expect(result.files).toHaveLength(1);
      expect(result.files[0].filePath).toBe('src/index.ts');
      expect(mockExecAsync).toHaveBeenCalledWith(
        expect.stringContaining('git diff'),
        expect.objectContaining({ cwd: '/path/to/repo' })
      );
    });

    test('should exclude markdown files by default', async () => {
      mockExecAsync.mockResolvedValueOnce({ stdout: '', stderr: '' });

      await gitService.getDiff('/path/to/repo');

      expect(mockExecAsync).toHaveBeenCalledWith(
        expect.stringContaining("':!*.md'"),
        expect.any(Object)
      );
    });

    test('should use custom base branch when provided', async () => {
      mockExecAsync.mockResolvedValueOnce({ stdout: '', stderr: '' });

      await gitService.getDiff('/path/to/repo', { baseBranch: 'develop' });

      expect(mockExecAsync).toHaveBeenCalledWith(
        expect.stringContaining('git diff develop'),
        expect.any(Object)
      );
    });

    test('should throw NotAGitRepositoryError for non-git directory', async () => {
      mockExecAsync.mockRejectedValueOnce({
        code: 128,
        stderr: 'fatal: not a git repository',
      });

      const { NotAGitRepositoryError } = await import('../../src/services/git-types.js');

      await expect(gitService.getDiff('/not/a/repo')).rejects.toThrow(NotAGitRepositoryError);
    });

    test('should truncate large diffs', async () => {
      // Create a diff with more lines than maxDiffLines
      const lines = Array(50).fill('+line').join('\n');
      const largeDiff = `diff --git a/large.ts b/large.ts
index abc..def 100644
--- a/large.ts
+++ b/large.ts
@@ -1,50 +1,51 @@
${lines}`;

      mockExecAsync.mockResolvedValueOnce({ stdout: largeDiff, stderr: '' });

      // Use a service with a low maxDiffLines threshold
      const smallMaxService = new GitService({ maxDiffLines: 10 });
      const result = await smallMaxService.getDiff('/path/to/repo');

      expect(result.truncated).toBe(true);
      expect(result.totalLines).toBeGreaterThan(10);
    });
  });

  describe('getStatus', () => {
    test('should return parsed status for a repository', async () => {
      mockExecAsync.mockResolvedValueOnce({
        stdout: `## main...origin/main
M  src/index.ts
?? new-file.ts`,
        stderr: '',
      });

      const result = await gitService.getStatus('/path/to/repo');

      expect(result.branch).toBe('main');
      expect(result.staged).toHaveLength(1);
      expect(result.untracked).toContain('new-file.ts');
    });

    test('should throw NotAGitRepositoryError for non-git directory', async () => {
      mockExecAsync.mockRejectedValueOnce({
        code: 128,
        stderr: 'fatal: not a git repository',
      });

      const { NotAGitRepositoryError } = await import('../../src/services/git-types.js');

      await expect(gitService.getStatus('/not/a/repo')).rejects.toThrow(NotAGitRepositoryError);
    });
  });

  describe('getBranchInfo', () => {
    test('should return current branch info', async () => {
      // Mock for branch name
      mockExecAsync.mockResolvedValueOnce({ stdout: 'feature/my-branch\n', stderr: '' });
      // Mock for remote tracking
      mockExecAsync.mockResolvedValueOnce({ stdout: 'origin/feature/my-branch\n', stderr: '' });
      // Mock for recent commits
      mockExecAsync.mockResolvedValueOnce({
        stdout: `abc1234|Fix bug|2025-12-27T10:00:00Z
def5678|Add feature|2025-12-27T09:00:00Z`,
        stderr: '',
      });

      const result = await gitService.getBranchInfo('/path/to/repo');

      expect(result.name).toBe('feature/my-branch');
      expect(result.remote).toBe('origin/feature/my-branch');
      expect(result.recentCommits).toHaveLength(2);
      expect(result.recentCommits[0].hash).toBe('abc1234');
      expect(result.recentCommits[0].message).toBe('Fix bug');
    });

    test('should handle branch with no remote tracking', async () => {
      mockExecAsync.mockResolvedValueOnce({ stdout: 'local-branch\n', stderr: '' });
      mockExecAsync.mockRejectedValueOnce({ code: 128, stderr: 'no upstream' });
      mockExecAsync.mockResolvedValueOnce({ stdout: '', stderr: '' });

      const result = await gitService.getBranchInfo('/path/to/repo');

      expect(result.name).toBe('local-branch');
      expect(result.remote).toBeNull();
    });

    test('should detect main/master branch', async () => {
      mockExecAsync.mockResolvedValueOnce({ stdout: 'main\n', stderr: '' });
      mockExecAsync.mockResolvedValueOnce({ stdout: 'origin/main\n', stderr: '' });
      mockExecAsync.mockResolvedValueOnce({ stdout: '', stderr: '' });

      const result = await gitService.getBranchInfo('/path/to/repo');

      expect(result.isMainBranch).toBe(true);
    });

    test('should detect feature branch', async () => {
      mockExecAsync.mockResolvedValueOnce({ stdout: 'feature/CSM-013\n', stderr: '' });
      mockExecAsync.mockResolvedValueOnce({ stdout: 'origin/feature/CSM-013\n', stderr: '' });
      mockExecAsync.mockResolvedValueOnce({ stdout: '', stderr: '' });

      const result = await gitService.getBranchInfo('/path/to/repo');

      expect(result.isMainBranch).toBe(false);
    });
  });

  describe('caching', () => {
    test('should cache diff results', async () => {
      const mockDiff = `diff --git a/file.ts b/file.ts
index abc..def 100644
--- a/file.ts
+++ b/file.ts
@@ -1 +1 @@
-old
+new`;

      mockExecAsync.mockResolvedValue({ stdout: mockDiff, stderr: '' });

      // First call
      await gitService.getDiff('/path/to/repo');
      // Second call (should use cache)
      await gitService.getDiff('/path/to/repo');

      // Should only call git once due to caching
      expect(mockExecAsync).toHaveBeenCalledTimes(1);
    });

    test('should expire cache after TTL', async () => {
      vi.useFakeTimers();

      const mockDiff = `diff --git a/file.ts b/file.ts
index abc..def 100644
--- a/file.ts
+++ b/file.ts
@@ -1 +1 @@
-old
+new`;

      mockExecAsync.mockResolvedValue({ stdout: mockDiff, stderr: '' });

      // First call
      await gitService.getDiff('/path/to/repo');

      // Advance past cache TTL (5 seconds)
      vi.advanceTimersByTime(6000);

      // Second call (should not use expired cache)
      await gitService.getDiff('/path/to/repo');

      expect(mockExecAsync).toHaveBeenCalledTimes(2);

      vi.useRealTimers();
    });

    test('should clear cache on clearCache call', async () => {
      const mockDiff = `diff --git a/file.ts b/file.ts
index abc..def 100644
--- a/file.ts
+++ b/file.ts
@@ -1 +1 @@
-old
+new`;

      mockExecAsync.mockResolvedValue({ stdout: mockDiff, stderr: '' });

      await gitService.getDiff('/path/to/repo');
      gitService.clearCache();
      await gitService.getDiff('/path/to/repo');

      expect(mockExecAsync).toHaveBeenCalledTimes(2);
    });
  });

  describe('timeout handling', () => {
    test('should throw GitTimeoutError when command times out', async () => {
      // Create a promise that never resolves
      mockExecAsync.mockImplementationOnce(
        () =>
          new Promise((_, reject) => {
            const error = new Error('Command timed out');
            (error as Error & { killed: boolean }).killed = true;
            setTimeout(() => reject(error), 100);
          })
      );

      const { GitTimeoutError } = await import('../../src/services/git-types.js');

      // Use short timeout for test
      const shortTimeoutService = new GitService({ timeoutMs: 50 });

      await expect(shortTimeoutService.getDiff('/path/to/repo')).rejects.toThrow(GitTimeoutError);
    });
  });
});
