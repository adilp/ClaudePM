/**
 * useReviewResults Hook
 * Fetches review history and listens for real-time review result updates via WebSocket
 */

import { useEffect, useCallback } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '@/services/api';
import { useWebSocket, type ReviewResultMessage } from './useWebSocket';
import type { ReviewResultEntry, ReviewHistoryResponse } from '@/types/api';

// Query keys
export const reviewResultKeys = {
  all: ['reviewResults'] as const,
  history: (ticketId: string) => [...reviewResultKeys.all, 'history', ticketId] as const,
};

/**
 * Hook to fetch and subscribe to review results for a ticket
 */
export function useReviewResults(ticketId: string | undefined) {
  const queryClient = useQueryClient();
  const { lastMessage } = useWebSocket();

  // Fetch review history from API
  const query = useQuery({
    queryKey: reviewResultKeys.history(ticketId!),
    queryFn: () => api.getTicketReviewHistory(ticketId!),
    enabled: !!ticketId,
  });

  // Handle WebSocket messages for real-time updates
  useEffect(() => {
    if (!lastMessage || lastMessage.type !== 'review:result') return;

    const msg = lastMessage as ReviewResultMessage;

    // Only process messages for this ticket
    if (msg.payload.ticketId !== ticketId) return;

    // Add the new result to the cache
    queryClient.setQueryData<ReviewHistoryResponse>(
      reviewResultKeys.history(ticketId!),
      (old) => {
        if (!old) {
          return {
            ticketId: ticketId!,
            results: [{
              id: `ws-${Date.now()}`, // Temporary ID until refetch
              session_id: msg.payload.sessionId,
              trigger: msg.payload.trigger,
              decision: msg.payload.decision,
              reasoning: msg.payload.reasoning,
              created_at: msg.payload.timestamp,
            }],
          };
        }

        // Prepend the new result (most recent first)
        const newResult: ReviewResultEntry = {
          id: `ws-${Date.now()}`,
          session_id: msg.payload.sessionId,
          trigger: msg.payload.trigger,
          decision: msg.payload.decision,
          reasoning: msg.payload.reasoning,
          created_at: msg.payload.timestamp,
        };

        return {
          ...old,
          results: [newResult, ...old.results],
        };
      }
    );

    // Refetch to get the proper ID and any other data
    queryClient.invalidateQueries({ queryKey: reviewResultKeys.history(ticketId!) });
  }, [lastMessage, ticketId, queryClient]);

  // Get the latest review result
  const latestResult = query.data?.results?.[0] ?? null;

  // Refresh function
  const refresh = useCallback(() => {
    if (ticketId) {
      queryClient.invalidateQueries({ queryKey: reviewResultKeys.history(ticketId) });
    }
  }, [ticketId, queryClient]);

  return {
    // Latest review result (for banner)
    latestResult,
    // All review results (for history panel)
    results: query.data?.results ?? [],
    // Query state
    isLoading: query.isLoading,
    isError: query.isError,
    error: query.error,
    // Actions
    refresh,
  };
}

/**
 * Hook to manually trigger a review for a session
 */
export function useTriggerReview(ticketId: string | undefined) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (sessionId: string) => api.triggerReview(sessionId),
    onSuccess: () => {
      // Invalidate review results to show the new result
      if (ticketId) {
        queryClient.invalidateQueries({ queryKey: reviewResultKeys.history(ticketId) });
      }
    },
  });
}
