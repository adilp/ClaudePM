/**
 * Git Hooks
 * React Query hooks for git data and operations
 * Includes optimistic updates for instant UI feedback
 */

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import * as api from '../services/api';
import { queryKeys } from './query-keys';
import type { GitStatus } from '../types/api';

export function useGitDiff(projectId: string, baseBranch?: string) {
  return useQuery({
    queryKey: queryKeys.git.diff(projectId, baseBranch),
    queryFn: () => api.getGitDiff(projectId, baseBranch),
    enabled: !!projectId,
    staleTime: 10 * 1000, // 10 seconds - diffs can be expensive
  });
}

export function useGitStatus(projectId: string) {
  return useQuery({
    queryKey: queryKeys.git.status(projectId),
    queryFn: () => api.getGitStatus(projectId),
    enabled: !!projectId,
    staleTime: 5 * 1000, // 5 seconds
  });
}

export function useBranchInfo(projectId: string) {
  return useQuery({
    queryKey: queryKeys.git.branch(projectId),
    queryFn: () => api.getBranchInfo(projectId),
    enabled: !!projectId,
    staleTime: 30 * 1000, // 30 seconds - branch info changes less often
  });
}

// ============================================================================
// Git Staging Mutations with Optimistic Updates
// ============================================================================

export function useStageFiles(projectId: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (files: string[]) => api.stageFiles(projectId, files),

    // Optimistic update: immediately move files to staged
    onMutate: async (files) => {
      // Cancel outgoing refetches
      await queryClient.cancelQueries({ queryKey: queryKeys.git.status(projectId) });

      // Snapshot current state
      const previousStatus = queryClient.getQueryData<GitStatus>(queryKeys.git.status(projectId));

      // Optimistically update
      if (previousStatus) {
        const filesToStage = new Set(files);

        // Find files being staged from unstaged list
        const stagedFromUnstaged = previousStatus.unstaged.filter((f) =>
          filesToStage.has(f.path)
        );

        // Find files being staged from untracked list
        const stagedFromUntracked = previousStatus.untracked
          .filter((path) => filesToStage.has(path))
          .map((path) => ({ path, status: 'added' }));

        // Build new status
        const newStatus: GitStatus = {
          ...previousStatus,
          staged: [
            ...previousStatus.staged,
            ...stagedFromUnstaged,
            ...stagedFromUntracked,
          ],
          unstaged: previousStatus.unstaged.filter((f) => !filesToStage.has(f.path)),
          untracked: previousStatus.untracked.filter((path) => !filesToStage.has(path)),
          clean: false,
        };

        queryClient.setQueryData(queryKeys.git.status(projectId), newStatus);
      }

      return { previousStatus };
    },

    // Rollback on error
    onError: (_err, _files, context) => {
      if (context?.previousStatus) {
        queryClient.setQueryData(queryKeys.git.status(projectId), context.previousStatus);
      }
    },

    // Sync with server after mutation (optional - can remove for even faster UX)
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.git.status(projectId) });
    },
  });
}

export function useUnstageFiles(projectId: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (files: string[]) => api.unstageFiles(projectId, files),

    // Optimistic update: immediately move files to unstaged
    onMutate: async (files) => {
      await queryClient.cancelQueries({ queryKey: queryKeys.git.status(projectId) });

      const previousStatus = queryClient.getQueryData<GitStatus>(queryKeys.git.status(projectId));

      if (previousStatus) {
        const filesToUnstage = new Set(files);

        // Find files being unstaged
        const unstagedFiles = previousStatus.staged.filter((f) =>
          filesToUnstage.has(f.path)
        );

        // Build new status
        const newStatus: GitStatus = {
          ...previousStatus,
          staged: previousStatus.staged.filter((f) => !filesToUnstage.has(f.path)),
          unstaged: [...previousStatus.unstaged, ...unstagedFiles],
          clean: false,
        };

        queryClient.setQueryData(queryKeys.git.status(projectId), newStatus);
      }

      return { previousStatus };
    },

    onError: (_err, _files, context) => {
      if (context?.previousStatus) {
        queryClient.setQueryData(queryKeys.git.status(projectId), context.previousStatus);
      }
    },

    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.git.status(projectId) });
    },
  });
}

export function useStageAll(projectId: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: () => api.stageAllFiles(projectId),

    // Optimistic update: move all unstaged/untracked to staged
    onMutate: async () => {
      await queryClient.cancelQueries({ queryKey: queryKeys.git.status(projectId) });

      const previousStatus = queryClient.getQueryData<GitStatus>(queryKeys.git.status(projectId));

      if (previousStatus) {
        const untrackedAsStaged = previousStatus.untracked.map((path) => ({
          path,
          status: 'added',
        }));

        const newStatus: GitStatus = {
          ...previousStatus,
          staged: [...previousStatus.staged, ...previousStatus.unstaged, ...untrackedAsStaged],
          unstaged: [],
          untracked: [],
          clean: false,
        };

        queryClient.setQueryData(queryKeys.git.status(projectId), newStatus);
      }

      return { previousStatus };
    },

    onError: (_err, _vars, context) => {
      if (context?.previousStatus) {
        queryClient.setQueryData(queryKeys.git.status(projectId), context.previousStatus);
      }
    },

    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.git.status(projectId) });
    },
  });
}

export function useUnstageAll(projectId: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: () => api.unstageAllFiles(projectId),

    // Optimistic update: move all staged to unstaged
    onMutate: async () => {
      await queryClient.cancelQueries({ queryKey: queryKeys.git.status(projectId) });

      const previousStatus = queryClient.getQueryData<GitStatus>(queryKeys.git.status(projectId));

      if (previousStatus) {
        // Note: We can't perfectly know which files were "added" vs "modified"
        // For safety, move all staged to unstaged
        const newStatus: GitStatus = {
          ...previousStatus,
          staged: [],
          unstaged: [...previousStatus.unstaged, ...previousStatus.staged],
          clean: previousStatus.unstaged.length === 0 && previousStatus.staged.length === 0,
        };

        queryClient.setQueryData(queryKeys.git.status(projectId), newStatus);
      }

      return { previousStatus };
    },

    onError: (_err, _vars, context) => {
      if (context?.previousStatus) {
        queryClient.setQueryData(queryKeys.git.status(projectId), context.previousStatus);
      }
    },

    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.git.status(projectId) });
    },
  });
}

// ============================================================================
// Other Git Mutations (no optimistic updates needed)
// ============================================================================

export function useCommit(projectId: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (message: string) => api.commitChanges(projectId, message),
    onSuccess: () => {
      // Invalidate all git-related queries
      queryClient.invalidateQueries({ queryKey: queryKeys.git.status(projectId) });
      queryClient.invalidateQueries({ queryKey: queryKeys.git.branch(projectId) });
      queryClient.invalidateQueries({ queryKey: queryKeys.git.diff(projectId) });
    },
  });
}

export function usePush(projectId: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (setUpstream?: boolean) => api.pushChanges(projectId, setUpstream),
    onSuccess: () => {
      // Invalidate branch info to update ahead/behind counts
      queryClient.invalidateQueries({ queryKey: queryKeys.git.branch(projectId) });
      queryClient.invalidateQueries({ queryKey: queryKeys.git.status(projectId) });
    },
  });
}
