/**
 * Session Hooks
 * React Query hooks for session data
 */

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '@/services/api';
import { useUIStore } from '@/store/ui';

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

export function useSyncSessions() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (projectId?: string) => api.syncSessions(projectId),
    onSuccess: () => {
      // Invalidate all session queries to refresh the data
      queryClient.invalidateQueries({ queryKey: sessionKeys.all });
    },
  });
}

export function useSyncProject() {
  const queryClient = useQueryClient();
  const addNotification = useUIStore((state) => state.addNotification);

  return useMutation({
    mutationFn: async (projectId: string) => {
      // Run both syncs in parallel
      const [ticketsResult, sessionsResult] = await Promise.all([
        api.syncTickets(projectId),
        api.syncSessions(projectId),
      ]);
      return { tickets: ticketsResult, sessions: sessionsResult };
    },
    onSuccess: (result, projectId) => {
      // Invalidate both ticket and session queries
      queryClient.invalidateQueries({ queryKey: ['tickets', 'list', projectId] });
      queryClient.invalidateQueries({ queryKey: sessionKeys.all });

      // Show success toast with details
      const ticketStats = result.tickets.result;
      const sessionStats = result.sessions;

      const ticketMessage = `Tickets: ${ticketStats.created} created, ${ticketStats.updated} updated`;
      const sessionMessage = `Sessions: ${sessionStats.alive_sessions.length} alive, ${sessionStats.orphaned_sessions.length} orphaned`;

      addNotification({
        type: 'success',
        title: 'Sync completed',
        message: `${ticketMessage}. ${sessionMessage}`,
      });
    },
    onError: (error) => {
      addNotification({
        type: 'error',
        title: 'Sync failed',
        message: error instanceof Error ? error.message : 'An unexpected error occurred',
      });
    },
  });
}
