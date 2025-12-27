/**
 * tmux Hooks
 * React Query hooks for tmux session discovery
 */

import { useQuery } from '@tanstack/react-query';
import { api } from '@/services/api';

// Query keys
export const tmuxKeys = {
  all: ['tmux'] as const,
  sessions: () => [...tmuxKeys.all, 'sessions'] as const,
  session: (name: string) => [...tmuxKeys.all, 'session', name] as const,
};

// Hooks
export function useTmuxSessions() {
  return useQuery({
    queryKey: tmuxKeys.sessions(),
    queryFn: () => api.getTmuxSessions(),
    staleTime: 10000, // 10 seconds
  });
}

export function useTmuxSessionDetail(name: string) {
  return useQuery({
    queryKey: tmuxKeys.session(name),
    queryFn: () => api.getTmuxSessionDetail(name),
    enabled: !!name,
  });
}
