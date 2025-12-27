/**
 * Git Hooks
 * React Query hooks for git data
 */

import { useQuery } from '@tanstack/react-query';
import { api } from '@/services/api';

// Query keys
export const gitKeys = {
  all: ['git'] as const,
  diff: (projectId: string, baseBranch?: string) =>
    [...gitKeys.all, 'diff', projectId, baseBranch] as const,
  status: (projectId: string) => [...gitKeys.all, 'status', projectId] as const,
  branch: (projectId: string) => [...gitKeys.all, 'branch', projectId] as const,
};

// Hooks
export function useGitDiff(projectId: string, baseBranch?: string) {
  return useQuery({
    queryKey: gitKeys.diff(projectId, baseBranch),
    queryFn: () => api.getDiff(projectId, baseBranch),
    enabled: !!projectId,
    staleTime: 10000, // 10 seconds - diffs can be expensive
  });
}

export function useGitStatus(projectId: string) {
  return useQuery({
    queryKey: gitKeys.status(projectId),
    queryFn: () => api.getGitStatus(projectId),
    enabled: !!projectId,
    staleTime: 5000, // 5 seconds
  });
}

export function useBranchInfo(projectId: string) {
  return useQuery({
    queryKey: gitKeys.branch(projectId),
    queryFn: () => api.getBranchInfo(projectId),
    enabled: !!projectId,
    staleTime: 30000, // 30 seconds - branch info changes less often
  });
}
