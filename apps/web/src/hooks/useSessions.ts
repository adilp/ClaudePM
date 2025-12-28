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
  // Analysis keys
  analysis: () => [...sessionKeys.all, 'analysis'] as const,
  summary: (id: string) => [...sessionKeys.analysis(), 'summary', id] as const,
  reviewReport: (id: string) => [...sessionKeys.analysis(), 'review', id] as const,
  activity: (id: string) => [...sessionKeys.analysis(), 'activity', id] as const,
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

// ============================================================================
// Session Analysis Hooks (Claude SDK-powered)
// ============================================================================

/**
 * Fetch AI-generated session summary
 * Provides headline, description, actions taken, and files changed
 */
export function useSessionSummary(sessionId: string, enabled = true) {
  return useQuery({
    queryKey: sessionKeys.summary(sessionId),
    queryFn: () => api.getSessionSummary(sessionId),
    enabled: !!sessionId && enabled,
    staleTime: 30_000, // Cache for 30s since analysis is expensive
    retry: 1,
  });
}

/**
 * Fetch AI-generated review report for a session
 * Provides completion status, accomplishments, concerns, and suggested commit/PR
 */
export function useSessionReviewReport(sessionId: string, enabled = true) {
  return useQuery({
    queryKey: sessionKeys.reviewReport(sessionId),
    queryFn: () => api.getSessionReviewReport(sessionId),
    enabled: !!sessionId && enabled,
    staleTime: 30_000,
    retry: 1,
  });
}

/**
 * Fetch parsed activity events from session output
 * Provides structured tool usage events
 */
export function useSessionActivity(sessionId: string, lines = 100) {
  return useQuery({
    queryKey: sessionKeys.activity(sessionId),
    queryFn: () => api.getSessionActivity(sessionId, lines),
    enabled: !!sessionId,
    staleTime: 5_000, // Shorter cache since activity updates frequently
  });
}

/**
 * Generate commit message for session's changes
 */
export function useGenerateCommitMessage() {
  const addNotification = useUIStore((state) => state.addNotification);

  return useMutation({
    mutationFn: (sessionId: string) => api.generateCommitMessage(sessionId),
    onSuccess: (result) => {
      addNotification({
        type: 'success',
        title: 'Commit message generated',
        message: result.message.split('\n')[0], // Show first line
      });
    },
    onError: (error) => {
      addNotification({
        type: 'error',
        title: 'Failed to generate commit message',
        message: error instanceof Error ? error.message : 'Unknown error',
      });
    },
  });
}

/**
 * Generate PR description for session's work
 */
export function useGeneratePrDescription() {
  const addNotification = useUIStore((state) => state.addNotification);

  return useMutation({
    mutationFn: ({ sessionId, baseBranch }: { sessionId: string; baseBranch?: string }) =>
      api.generatePrDescription(sessionId, baseBranch),
    onSuccess: (result) => {
      addNotification({
        type: 'success',
        title: 'PR description generated',
        message: result.title,
      });
    },
    onError: (error) => {
      addNotification({
        type: 'error',
        title: 'Failed to generate PR description',
        message: error instanceof Error ? error.message : 'Unknown error',
      });
    },
  });
}
