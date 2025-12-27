/**
 * GitStatus Component
 * Displays git repository status and branch info
 */

import type { GitStatus as GitStatusType, BranchInfo } from '@/types/api';
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
      <div className="rounded-lg border bg-card p-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <GitBranch className="h-5 w-5 text-muted-foreground" />
            <div>
              <p className="font-medium font-mono">{status.branch || 'Detached HEAD'}</p>
              {status.upstream && (
                <p className="text-sm text-muted-foreground">
                  Tracking: {status.upstream}
                </p>
              )}
            </div>
          </div>
          <div className="flex items-center gap-3">
            {status.ahead > 0 && (
              <span className="flex items-center gap-1 text-sm text-green-600">
                <ArrowUp className="h-4 w-4" />
                {status.ahead} ahead
              </span>
            )}
            {status.behind > 0 && (
              <span className="flex items-center gap-1 text-sm text-red-600">
                <ArrowDown className="h-4 w-4" />
                {status.behind} behind
              </span>
            )}
            {status.clean && (
              <span className="flex items-center gap-1 text-sm text-green-600">
                <Check className="h-4 w-4" />
                Clean
              </span>
            )}
          </div>
        </div>

        {/* Recent Commits */}
        {branch?.recent_commits && branch.recent_commits.length > 0 && (
          <div className="mt-4 pt-4 border-t">
            <p className="text-sm font-medium mb-2">Recent Commits</p>
            <div className="space-y-2">
              {branch.recent_commits.slice(0, 3).map((commit) => (
                <div key={commit.hash} className="flex items-start gap-2 text-sm">
                  <GitCommit className="h-4 w-4 text-muted-foreground flex-shrink-0 mt-0.5" />
                  <div className="flex-1 min-w-0">
                    <p className="truncate">{commit.message}</p>
                    <p className="text-xs text-muted-foreground">
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
            <div className="rounded-lg border bg-green-50 dark:bg-green-950/20">
              <div className="px-4 py-2 border-b bg-green-100 dark:bg-green-950/40">
                <p className="text-sm font-medium text-green-700 dark:text-green-400">
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
                      <span className="text-green-600 font-bold w-4">{file.status}</span>
                      <Icon className="h-4 w-4 text-green-600" />
                      <span className="truncate">{file.path}</span>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* Unstaged Changes */}
          {hasUnstaged && (
            <div className="rounded-lg border bg-yellow-50 dark:bg-yellow-950/20">
              <div className="px-4 py-2 border-b bg-yellow-100 dark:bg-yellow-950/40">
                <p className="text-sm font-medium text-yellow-700 dark:text-yellow-400">
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
                      <span className="text-yellow-600 font-bold w-4">{file.status}</span>
                      <Icon className="h-4 w-4 text-yellow-600" />
                      <span className="truncate">{file.path}</span>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* Untracked Files */}
          {hasUntracked && (
            <div className="rounded-lg border bg-gray-50 dark:bg-gray-950/20">
              <div className="px-4 py-2 border-b bg-gray-100 dark:bg-gray-950/40">
                <p className="text-sm font-medium text-gray-700 dark:text-gray-400">
                  Untracked Files ({status.untracked.length})
                </p>
              </div>
              <div className="p-2">
                {status.untracked.slice(0, 10).map((file) => (
                  <div
                    key={file}
                    className="flex items-center gap-2 px-2 py-1 text-sm font-mono"
                  >
                    <span className="text-gray-600 font-bold w-4">?</span>
                    <FilePlus className="h-4 w-4 text-gray-500" />
                    <span className="truncate">{file}</span>
                  </div>
                ))}
                {status.untracked.length > 10 && (
                  <p className="px-2 py-1 text-sm text-muted-foreground">
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
        <div className="rounded-lg border bg-green-50 dark:bg-green-950/20 p-6 text-center">
          <Check className="h-8 w-8 mx-auto text-green-600 mb-2" />
          <p className="text-green-700 dark:text-green-400 font-medium">
            Working directory clean
          </p>
          <p className="text-sm text-muted-foreground mt-1">
            No uncommitted changes
          </p>
        </div>
      )}
    </div>
  );
}
