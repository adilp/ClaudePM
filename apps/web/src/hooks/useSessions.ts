/**
 * Session Hooks
 * React Query hooks for session data
 */

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '@/services/api';

// Query keys
export const sessionKeys = {
  all: ['sessions'] as const,
  lists: () => [...sessionKeys.all, 'list'] as const,
  list: (projectId?: string) => [...sessionKeys.lists(), { projectId }] as const,
  details: () => [...sessionKeys.all, 'detail'] as const,
  detail: (id: string) => [...sessionKeys.details(), id] as const,
};

// Hooks
export function useSessions(projectId?: string) {
  return useQuery({
    queryKey: sessionKeys.list(projectId),
    queryFn: () => api.getSessions(projectId),
  });
}

export function useSession(sessionId: string) {
  return useQuery({
    queryKey: sessionKeys.detail(sessionId),
    queryFn: () => api.getSession(sessionId),
    enabled: !!sessionId,
  });
}

export function useStartSession() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (data: { project_id: string; ticket_id?: string }) =>
      api.startSession(data),
    onSuccess: (session) => {
      queryClient.invalidateQueries({ queryKey: sessionKeys.lists() });
      queryClient.setQueryData(sessionKeys.detail(session.id), session);
    },
  });
}

export function useStopSession() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (sessionId: string) => api.stopSession(sessionId),
    onSuccess: (_, sessionId) => {
      queryClient.invalidateQueries({ queryKey: sessionKeys.lists() });
      queryClient.invalidateQueries({ queryKey: sessionKeys.detail(sessionId) });
    },
  });
}

export function useSendInput() {
  return useMutation({
    mutationFn: ({ sessionId, text }: { sessionId: string; text: string }) =>
      api.sendInput(sessionId, text),
  });
}
