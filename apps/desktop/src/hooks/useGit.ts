/**
 * Git Hooks
 * React Query hooks for git data
 */

import { useQuery } from '@tanstack/react-query';
import * as api from '../services/api';
import { queryKeys } from './query-keys';

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
