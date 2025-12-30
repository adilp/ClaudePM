/**
 * tmux Hooks
 * React Query hooks for tmux session discovery
 */

import { useQuery } from '@tanstack/react-query';
import * as api from '../services/api';
import { queryKeys } from './query-keys';

// ============================================================================
// Query Hooks
// ============================================================================

export function useTmuxSessions() {
  return useQuery({
    queryKey: queryKeys.tmux.sessions(),
    queryFn: () => api.getTmuxSessions(),
    staleTime: 10000, // 10 seconds
  });
}

export function useTmuxSessionDetail(name: string) {
  return useQuery({
    queryKey: queryKeys.tmux.session(name),
    queryFn: () => api.getTmuxSessionDetail(name),
    enabled: !!name,
  });
}
