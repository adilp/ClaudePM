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

export function useFocusSession() {
  return useMutation({
    mutationFn: (sessionId: string) => api.focusSession(sessionId),
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

// ============================================================================
// Session Analysis Hooks (Claude SDK-powered)
// ============================================================================

/**
 * Fetch AI-generated review report for a session
 * Provides completion status, accomplishments, concerns, and suggested commit/PR
 */
export function useSessionReviewReport(sessionId: string, enabled = false) {
  return useQuery({
    queryKey: queryKeys.sessions.reviewReport(sessionId),
    queryFn: () => api.getSessionReviewReport(sessionId),
    enabled: !!sessionId && enabled,
    staleTime: Infinity, // Never mark as stale - reports are cached in DB
    retry: 1,
  });
}

/**
 * Regenerate review report (forces new AI generation)
 */
export function useRegenerateReviewReport() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (sessionId: string) => api.getSessionReviewReport(sessionId, true),
    onSuccess: (report, sessionId) => {
      queryClient.setQueryData(queryKeys.sessions.reviewReport(sessionId), report);
    },
  });
}

/**
 * Generate commit message for session's changes
 */
export function useGenerateCommitMessage() {
  return useMutation({
    mutationFn: (sessionId: string) => api.generateCommitMessage(sessionId),
  });
}

/**
 * Generate PR description for session's work
 */
export function useGeneratePrDescription() {
  return useMutation({
    mutationFn: ({ sessionId, baseBranch }: { sessionId: string; baseBranch?: string }) =>
      api.generatePrDescription(sessionId, baseBranch),
  });
}

/**
 * Fetch session activity events (parsed tool usage timeline)
 */
export function useSessionActivity(sessionId: string, lines = 100) {
  return useQuery({
    queryKey: queryKeys.sessions.activity(sessionId),
    queryFn: () => api.getSessionActivity(sessionId, lines),
    enabled: !!sessionId,
    staleTime: 30 * 1000, // 30 seconds
  });
}
