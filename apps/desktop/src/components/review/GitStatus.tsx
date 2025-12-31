/**
 * GitStatus Component
 * Displays git repository status and branch info
 */

import type { GitStatus as GitStatusType, BranchInfo } from '../../types/api';
import {
  GitBranch,
  GitCommit,
  Check,
  FileEdit,
  FilePlus,
  ArrowUp,
  ArrowDown,
} from 'lucide-react';

interface GitStatusProps {
  status: GitStatusType;
  branch?: BranchInfo;
}

const statusIcons: Record<string, typeof FileEdit> = {
  M: FileEdit,
  A: FilePlus,
  D: FilePlus,
  R: FileEdit,
  '?': FilePlus,
};

export function GitStatusDisplay({ status, branch }: GitStatusProps) {
  const hasChanges = !status.clean;
  const hasStaged = status.staged.length > 0;
  const hasUnstaged = status.unstaged.length > 0;
  const hasUntracked = status.untracked.length > 0;

  return (
    <div className="space-y-4">
      {/* Branch Info */}
      <div className="rounded-lg border border-line bg-surface-secondary p-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <GitBranch className="h-5 w-5 text-content-muted" />
            <div>
              <p className="font-medium font-mono text-content-primary">
                {status.branch || 'Detached HEAD'}
              </p>
              {status.upstream && (
                <p className="text-sm text-content-secondary">
                  Tracking: {status.upstream}
                </p>
              )}
            </div>
          </div>
          <div className="flex items-center gap-3">
            {status.ahead > 0 && (
              <span className="flex items-center gap-1 text-sm text-green-400">
                <ArrowUp className="h-4 w-4" />
                {status.ahead} ahead
              </span>
            )}
            {status.behind > 0 && (
              <span className="flex items-center gap-1 text-sm text-red-400">
                <ArrowDown className="h-4 w-4" />
                {status.behind} behind
              </span>
            )}
            {status.clean && (
              <span className="flex items-center gap-1 text-sm text-green-400">
                <Check className="h-4 w-4" />
                Clean
              </span>
            )}
          </div>
        </div>

        {/* Recent Commits */}
        {branch?.recent_commits && branch.recent_commits.length > 0 && (
          <div className="mt-4 pt-4 border-t border-line">
            <p className="text-sm font-medium text-content-primary mb-2">Recent Commits</p>
            <div className="space-y-2">
              {branch.recent_commits.slice(0, 3).map((commit) => (
                <div key={commit.hash} className="flex items-start gap-2 text-sm">
                  <GitCommit className="h-4 w-4 text-content-muted flex-shrink-0 mt-0.5" />
                  <div className="flex-1 min-w-0">
                    <p className="truncate text-content-primary">{commit.message}</p>
                    <p className="text-xs text-content-muted">
                      <span className="font-mono">{commit.hash.slice(0, 7)}</span>
                      {' • '}
                      {new Date(commit.date).toLocaleDateString()}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Changes Summary */}
      {hasChanges && (
        <div className="space-y-3">
          {/* Staged Changes */}
          {hasStaged && (
            <div className="rounded-lg border border-green-500/30 bg-green-500/5">
              <div className="px-4 py-2 border-b border-green-500/30 bg-green-500/10">
                <p className="text-sm font-medium text-green-400">
                  Staged Changes ({status.staged.length})
                </p>
              </div>
              <div className="p-2">
                {status.staged.map((file) => {
                  const Icon = statusIcons[file.status] || FileEdit;
                  return (
                    <div
                      key={file.path}
                      className="flex items-center gap-2 px-2 py-1 text-sm font-mono"
                    >
                      <span className="text-green-400 font-bold w-4">{file.status}</span>
                      <Icon className="h-4 w-4 text-green-400" />
                      <span className="truncate text-content-primary">{file.path}</span>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* Unstaged Changes */}
          {hasUnstaged && (
            <div className="rounded-lg border border-yellow-500/30 bg-yellow-500/5">
              <div className="px-4 py-2 border-b border-yellow-500/30 bg-yellow-500/10">
                <p className="text-sm font-medium text-yellow-400">
                  Unstaged Changes ({status.unstaged.length})
                </p>
              </div>
              <div className="p-2">
                {status.unstaged.map((file) => {
                  const Icon = statusIcons[file.status] || FileEdit;
                  return (
                    <div
                      key={file.path}
                      className="flex items-center gap-2 px-2 py-1 text-sm font-mono"
                    >
                      <span className="text-yellow-400 font-bold w-4">{file.status}</span>
                      <Icon className="h-4 w-4 text-yellow-400" />
                      <span className="truncate text-content-primary">{file.path}</span>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* Untracked Files */}
          {hasUntracked && (
            <div className="rounded-lg border border-line bg-surface-secondary">
              <div className="px-4 py-2 border-b border-line bg-surface-tertiary">
                <p className="text-sm font-medium text-content-secondary">
                  Untracked Files ({status.untracked.length})
                </p>
              </div>
              <div className="p-2">
                {status.untracked.slice(0, 10).map((file) => (
                  <div
                    key={file}
                    className="flex items-center gap-2 px-2 py-1 text-sm font-mono"
                  >
                    <span className="text-content-muted font-bold w-4">?</span>
                    <FilePlus className="h-4 w-4 text-content-muted" />
                    <span className="truncate text-content-primary">{file}</span>
                  </div>
                ))}
                {status.untracked.length > 10 && (
                  <p className="px-2 py-1 text-sm text-content-muted">
                    ...and {status.untracked.length - 10} more
                  </p>
                )}
              </div>
            </div>
          )}
        </div>
      )}

      {/* Clean State */}
      {!hasChanges && (
        <div className="rounded-lg border border-green-500/30 bg-green-500/5 p-6 text-center">
          <Check className="h-8 w-8 mx-auto text-green-400 mb-2" />
          <p className="text-green-400 font-medium">Working directory clean</p>
          <p className="text-sm text-content-muted mt-1">No uncommitted changes</p>
        </div>
      )}
    </div>
  );
}
