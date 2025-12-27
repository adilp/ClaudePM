/**
 * Git Service
 * Service for git operations: diff, status, branch info
 */

import { exec } from 'child_process';
import { promisify } from 'util';
import {
  GitConfig,
  DEFAULT_GIT_CONFIG,
  DiffResult,
  StatusResult,
  BranchInfo,
  CommitInfo,
  parseDiff,
  parseStatus,
  NotAGitRepositoryError,
  GitCommandError,
  GitTimeoutError,
} from './git-types.js';

const execAsync = promisify(exec);

// ============================================================================
// Cache Types
// ============================================================================

interface CacheEntry<T> {
  data: T;
  expiresAt: number;
}

// ============================================================================
// GitService Class
// ============================================================================

/**
 * Service for executing git commands and parsing output
 */
export class GitService {
  private config: GitConfig;
  private diffCache: Map<string, CacheEntry<DiffResult>> = new Map();

  constructor(config: Partial<GitConfig> = {}) {
    this.config = { ...DEFAULT_GIT_CONFIG, ...config };
  }

  /**
   * Get diff for a repository
   */
  async getDiff(
    repoPath: string,
    options: { baseBranch?: string; excludePatterns?: string[] } = {}
  ): Promise<DiffResult> {
    const baseBranch = options.baseBranch ?? this.config.defaultBaseBranch;
    const excludePatterns = options.excludePatterns ?? this.config.excludePatterns;

    // Check cache
    const cacheKey = `${repoPath}:${baseBranch}:${excludePatterns.join(',')}`;
    const cached = this.diffCache.get(cacheKey);
    if (cached && cached.expiresAt > Date.now()) {
      return cached.data;
    }

    // Build exclude path specs
    const excludeSpecs = excludePatterns.map((p) => `':!${p}'`).join(' ');

    // Run git diff
    const command = `git diff ${baseBranch} --no-color -- . ${excludeSpecs}`;
    const output = await this.runGitCommand(command, repoPath);

    // Parse diff
    const files = parseDiff(output);

    // Count total lines
    const totalLines = output.split('\n').length;
    const truncated = totalLines > this.config.maxDiffLines;

    const result: DiffResult = {
      files,
      truncated,
      totalLines,
    };

    // Cache result
    this.diffCache.set(cacheKey, {
      data: result,
      expiresAt: Date.now() + this.config.cacheTtlMs,
    });

    return result;
  }

  /**
   * Get status for a repository
   */
  async getStatus(repoPath: string): Promise<StatusResult> {
    const output = await this.runGitCommand('git status --porcelain=v1 -b', repoPath);
    return parseStatus(output);
  }

  /**
   * Get branch info for a repository
   */
  async getBranchInfo(repoPath: string): Promise<BranchInfo> {
    // Get current branch name
    const branchName = (
      await this.runGitCommand('git rev-parse --abbrev-ref HEAD', repoPath)
    ).trim();

    // Get remote tracking branch
    let remote: string | null = null;
    try {
      remote = (
        await this.runGitCommand(`git rev-parse --abbrev-ref ${branchName}@{upstream}`, repoPath)
      ).trim();
    } catch {
      // No upstream set
    }

    // Get recent commits
    const recentCommits: CommitInfo[] = [];
    try {
      const commitOutput = await this.runGitCommand(
        'git log -10 --format="%h|%s|%aI"',
        repoPath
      );

      for (const line of commitOutput.split('\n').filter((l) => l.trim())) {
        const [hash, message, dateStr] = line.split('|');
        if (hash && message && dateStr) {
          recentCommits.push({
            hash,
            message,
            date: new Date(dateStr),
          });
        }
      }
    } catch {
      // No commits or error
    }

    // Check if main branch
    const isMainBranch = branchName === 'main' || branchName === 'master';

    return {
      name: branchName,
      remote,
      isMainBranch,
      recentCommits,
    };
  }

  /**
   * Clear the diff cache
   */
  clearCache(): void {
    this.diffCache.clear();
  }

  /**
   * Run a git command in the specified directory
   */
  private async runGitCommand(command: string, cwd: string): Promise<string> {
    try {
      const { stdout } = await execAsync(command, {
        cwd,
        timeout: this.config.timeoutMs,
        maxBuffer: 10 * 1024 * 1024, // 10MB buffer for large diffs
      });
      return stdout;
    } catch (error) {
      const err = error as Error & {
        code?: number;
        stderr?: string;
        killed?: boolean;
      };

      // Check for timeout
      if (err.killed) {
        throw new GitTimeoutError(command, this.config.timeoutMs);
      }

      // Check for not a git repository
      if (err.stderr?.includes('not a git repository')) {
        throw new NotAGitRepositoryError(cwd);
      }

      // Generic git command error
      throw new GitCommandError(command, err.code ?? 1, err.stderr ?? err.message);
    }
  }
}

// ============================================================================
// Singleton Export
// ============================================================================

/**
 * Singleton instance of the git service
 */
export const gitService = new GitService();
