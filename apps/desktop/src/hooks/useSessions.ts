/**
 * Session Hooks
 * React Query hooks for session data
 */

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import * as api from '../services/api';
import { queryKeys } from './query-keys';

// ============================================================================
// Query Hooks
// ============================================================================

export function useSessions(projectId?: string) {
  return useQuery({
    queryKey: queryKeys.sessions.list(projectId),
    queryFn: () => api.getSessions(projectId),
  });
}

export function useSession(sessionId: string) {
  return useQuery({
    queryKey: queryKeys.sessions.detail(sessionId),
    queryFn: () => api.getSession(sessionId),
    enabled: !!sessionId,
  });
}

// ============================================================================
// Mutation Hooks
// ============================================================================

export function useStartSession() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (data: { project_id: string; ticket_id?: string }) =>
      api.startSession(data),
    onSuccess: (session) => {
      queryClient.invalidateQueries({ queryKey: queryKeys.sessions.lists() });
      queryClient.setQueryData(queryKeys.sessions.detail(session.id), session);
    },
  });
}

export function useStopSession() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (sessionId: string) => api.stopSession(sessionId),
    onSuccess: (_, sessionId) => {
      queryClient.invalidateQueries({ queryKey: queryKeys.sessions.lists() });
      queryClient.invalidateQueries({
        queryKey: queryKeys.sessions.detail(sessionId),
      });
    },
  });
}

export function useSendInput() {
  return useMutation({
    mutationFn: ({ sessionId, text }: { sessionId: string; text: string }) =>
      api.sendInput(sessionId, text),
  });
}

export function useSyncSessions() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (projectId?: string) => api.syncSessions(projectId),
    onSuccess: () => {
      // Invalidate all session queries to refresh the data
      queryClient.invalidateQueries({ queryKey: queryKeys.sessions.all });
    },
  });
}

export function useSyncProject() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (projectId: string) => {
      // Run both syncs in parallel
      const [ticketsResult, sessionsResult] = await Promise.all([
        api.syncTickets(projectId),
        api.syncSessions(projectId),
      ]);
      return { tickets: ticketsResult, sessions: sessionsResult };
    },
    onSuccess: (_, projectId) => {
      // Invalidate both ticket and session queries
      queryClient.invalidateQueries({
        queryKey: queryKeys.tickets.list(projectId),
      });
      queryClient.invalidateQueries({ queryKey: queryKeys.sessions.all });
    },
  });
}
