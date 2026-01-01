/**
 * Git Service Types
 * Type definitions and error classes for git operations
 */

// ============================================================================
// Configuration
// ============================================================================

/**
 * Configuration for the git service
 */
export interface GitConfig {
  /** Timeout for git commands in ms (default: 10000) */
  timeoutMs: number;
  /** Cache TTL in ms (default: 5000) */
  cacheTtlMs: number;
  /** Maximum diff lines before truncation (default: 5000) */
  maxDiffLines: number;
  /** File patterns to exclude from diff (default: ['*.md']) */
  excludePatterns: string[];
  /** Default base branch for diff (default: 'main') */
  defaultBaseBranch: string;
}

/**
 * Default configuration values
 */
export const DEFAULT_GIT_CONFIG: GitConfig = {
  timeoutMs: 10_000,
  cacheTtlMs: 5_000,
  maxDiffLines: 5000,
  excludePatterns: ['*.md'],
  defaultBaseBranch: 'main',
};

// ============================================================================
// Diff Types
// ============================================================================

/**
 * Type of change in a diff
 */
export type DiffChangeType = 'added' | 'modified' | 'deleted' | 'renamed';

/**
 * A hunk in a diff file
 */
export interface DiffHunk {
  /** Starting line in old file */
  oldStart: number;
  /** Number of lines in old file */
  oldCount: number;
  /** Starting line in new file */
  newStart: number;
  /** Number of lines in new file */
  newCount: number;
  /** Raw content of the hunk */
  content: string;
}

/**
 * A file in a diff
 */
export interface DiffFile {
  /** Path to the file */
  filePath: string;
  /** Old path (for renames) */
  oldFilePath?: string;
  /** Type of change */
  changeType: DiffChangeType;
  /** Hunks in the diff */
  hunks: DiffHunk[];
  /** Raw diff content for this file */
  rawDiff: string;
}

/**
 * Result of a diff operation
 */
export interface DiffResult {
  /** Files in the diff */
  files: DiffFile[];
  /** Whether the diff was truncated */
  truncated: boolean;
  /** Total lines in diff */
  totalLines: number;
}

// ============================================================================
// Status Types
// ============================================================================

/**
 * File status in working directory
 */
export type FileStatus = 'modified' | 'added' | 'deleted' | 'renamed' | 'copied' | 'untracked';

/**
 * A file with its status
 */
export interface StatusFile {
  /** Path to the file */
  path: string;
  /** Status of the file */
  status: FileStatus;
}

/**
 * Result of a status operation
 */
export interface StatusResult {
  /** Current branch name (null if detached) */
  branch: string | null;
  /** Upstream branch name */
  upstream: string | null;
  /** Whether HEAD is detached */
  detached: boolean;
  /** Files staged for commit */
  staged: StatusFile[];
  /** Files with unstaged changes */
  unstaged: StatusFile[];
  /** Untracked files */
  untracked: string[];
  /** Whether working directory is clean */
  clean: boolean;
  /** Commits ahead of upstream */
  ahead: number;
  /** Commits behind upstream */
  behind: number;
}

// ============================================================================
// Branch Types
// ============================================================================

/**
 * A commit in the branch history
 */
export interface CommitInfo {
  /** Short commit hash */
  hash: string;
  /** Commit message (first line) */
  message: string;
  /** Commit date */
  date: Date;
}

/**
 * Result of a branch info operation
 */
export interface BranchInfo {
  /** Branch name */
  name: string;
  /** Remote tracking branch (null if none) */
  remote: string | null;
  /** Whether this is the main/master branch */
  isMainBranch: boolean;
  /** Recent commits */
  recentCommits: CommitInfo[];
}

// ============================================================================
// Commit/Push Types
// ============================================================================

/**
 * Result of a commit operation
 */
export interface CommitResult {
  /** Short commit hash */
  hash: string;
  /** Commit message */
  message: string;
}

/**
 * Result of a push operation
 */
export interface PushResult {
  /** Branch that was pushed */
  branch: string;
  /** Raw output from git push */
  output: string;
}

// ============================================================================
// Error Classes
// ============================================================================

/**
 * Base error class for git errors
 */
export class GitError extends Error {
  constructor(
    message: string,
    public readonly code: string
  ) {
    super(message);
    this.name = 'GitError';
    Object.setPrototypeOf(this, new.target.prototype);
  }
}

/**
 * Error thrown when directory is not a git repository
 */
export class NotAGitRepositoryError extends GitError {
  constructor(public readonly path: string) {
    super(`Not a git repository: ${path}`, 'NOT_A_GIT_REPOSITORY');
    this.name = 'NotAGitRepositoryError';
  }
}

/**
 * Error thrown when a git command fails
 */
export class GitCommandError extends GitError {
  constructor(
    public readonly command: string,
    public readonly exitCode: number,
    public readonly stderr: string
  ) {
    super(`Git command failed: ${command} (exit code ${exitCode})`, 'GIT_COMMAND_FAILED');
    this.name = 'GitCommandError';
  }
}

/**
 * Error thrown when a git command times out
 */
export class GitTimeoutError extends GitError {
  constructor(
    public readonly command: string,
    public readonly timeoutMs: number
  ) {
    super(`Git command timed out after ${timeoutMs}ms: ${command}`, 'GIT_TIMEOUT');
    this.name = 'GitTimeoutError';
  }
}

// ============================================================================
// Parser Functions
// ============================================================================

/**
 * Parse unified diff output into structured format
 */
export function parseDiff(diffOutput: string): DiffFile[] {
  if (!diffOutput.trim()) {
    return [];
  }

  const files: DiffFile[] = [];
  // Split on diff headers
  const fileDiffs = diffOutput.split(/(?=^diff --git )/m).filter((s) => s.trim());

  for (const fileDiff of fileDiffs) {
    const lines = fileDiff.split('\n');
    const headerLine = lines[0];
    if (!headerLine) continue;

    // Parse file paths from header: diff --git a/path b/path
    const headerMatch = headerLine.match(/^diff --git a\/(.+?) b\/(.+?)$/);
    if (!headerMatch?.[2]) continue;

    const newPath = headerMatch[2];

    // Detect change type
    let changeType: DiffChangeType = 'modified';
    let oldFilePath: string | undefined;

    if (fileDiff.includes('new file mode')) {
      changeType = 'added';
    } else if (fileDiff.includes('deleted file mode')) {
      changeType = 'deleted';
    } else if (fileDiff.includes('rename from') && fileDiff.includes('rename to')) {
      changeType = 'renamed';
      const renameFromMatch = fileDiff.match(/rename from (.+)/);
      if (renameFromMatch) {
        oldFilePath = renameFromMatch[1];
      }
    }

    // Parse hunks - find all hunk headers first
    const hunks: DiffHunk[] = [];
    const hunkHeaderRegex = /@@ -(\d+)(?:,(\d+))? \+(\d+)(?:,(\d+))? @@/g;
    const hunkMatches: Array<{ match: RegExpExecArray; index: number }> = [];

    let match;
    while ((match = hunkHeaderRegex.exec(fileDiff)) !== null) {
      hunkMatches.push({ match, index: match.index });
    }

    // Process each hunk
    for (let i = 0; i < hunkMatches.length; i++) {
      const hunkEntry = hunkMatches[i];
      if (!hunkEntry) continue;
      const { match: hunkMatch, index: hunkIndex } = hunkEntry;
      const oldStart = parseInt(hunkMatch[1] ?? '1', 10);
      const oldCount = hunkMatch[2] ? parseInt(hunkMatch[2], 10) : 1;
      const newStart = parseInt(hunkMatch[3] ?? '1', 10);
      const newCount = hunkMatch[4] ? parseInt(hunkMatch[4], 10) : 1;

      // Find hunk content (until next hunk or end of file diff)
      const contentStart = hunkIndex + hunkMatch[0].length;
      const nextHunk = hunkMatches[i + 1];
      const contentEnd = nextHunk ? nextHunk.index : fileDiff.length;
      const content = fileDiff.slice(contentStart, contentEnd).trim();

      hunks.push({
        oldStart,
        oldCount,
        newStart,
        newCount,
        content,
      });
    }

    const file: DiffFile = {
      filePath: newPath,
      changeType,
      hunks,
      rawDiff: fileDiff,
    };

    if (oldFilePath) {
      file.oldFilePath = oldFilePath;
    }

    files.push(file);
  }

  return files;
}

/**
 * Parse git status --porcelain=v1 -b output
 */
export function parseStatus(statusOutput: string): StatusResult {
  const lines = statusOutput.split('\n').filter((l) => l);
  const result: StatusResult = {
    branch: null,
    upstream: null,
    detached: false,
    staged: [],
    unstaged: [],
    untracked: [],
    clean: true,
    ahead: 0,
    behind: 0,
  };

  for (const line of lines) {
    // Branch line: ## branch...upstream [ahead N, behind M]
    if (line.startsWith('## ')) {
      const branchPart = line.slice(3);

      // Check for detached HEAD
      if (branchPart.includes('HEAD (no branch)')) {
        result.detached = true;
        continue;
      }

      // Parse branch and upstream
      const aheadBehindMatch = branchPart.match(/\[ahead (\d+)(?:, behind (\d+))?\]/);
      if (aheadBehindMatch?.[1]) {
        result.ahead = parseInt(aheadBehindMatch[1], 10);
        if (aheadBehindMatch[2]) {
          result.behind = parseInt(aheadBehindMatch[2], 10);
        }
      }

      const branchUpstreamMatch = branchPart.match(/^([^.[]+)(?:\.\.\.([^\s[]+))?/);
      if (branchUpstreamMatch?.[1]) {
        result.branch = branchUpstreamMatch[1];
        if (branchUpstreamMatch[2]) {
          result.upstream = branchUpstreamMatch[2];
        }
      }

      continue;
    }

    // Status lines: XY path (need at least 3 chars)
    if (line.length < 3) continue;
    const x = line[0]!; // Staged status
    const y = line[1]!; // Unstaged status
    const path = line.slice(3);

    // Untracked files
    if (x === '?' && y === '?') {
      result.untracked.push(path);
      result.clean = false;
      continue;
    }

    // Staged changes (first column)
    if (x !== ' ' && x !== '?') {
      result.staged.push({
        path,
        status: parseStatusCode(x),
      });
      result.clean = false;
    }

    // Unstaged changes (second column)
    if (y !== ' ' && y !== '?') {
      result.unstaged.push({
        path,
        status: parseStatusCode(y),
      });
      result.clean = false;
    }
  }

  return result;
}

/**
 * Convert status code to FileStatus
 */
function parseStatusCode(code: string): FileStatus {
  switch (code) {
    case 'M':
      return 'modified';
    case 'A':
      return 'added';
    case 'D':
      return 'deleted';
    case 'R':
      return 'renamed';
    case 'C':
      return 'copied';
    default:
      return 'modified';
  }
}
