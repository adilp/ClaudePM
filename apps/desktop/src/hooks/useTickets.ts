/**
 * Ticket Hooks
 * React Query hooks for ticket data
 */

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import * as api from '../services/api';
import { queryKeys } from './query-keys';
import type { TicketState } from '../types/api';

// ============================================================================
// Query Hooks
// ============================================================================

export function useTickets(projectId: string) {
  return useQuery({
    queryKey: queryKeys.tickets.list(projectId),
    queryFn: () => api.getTickets(projectId),
    enabled: !!projectId,
  });
}

export function useTicket(projectId: string, ticketId: string) {
  return useQuery({
    queryKey: queryKeys.tickets.detail(projectId, ticketId),
    queryFn: () => api.getTicket(projectId, ticketId),
    enabled: !!projectId && !!ticketId,
  });
}

export function useTicketContent(ticketId: string) {
  return useQuery({
    queryKey: queryKeys.tickets.content(ticketId),
    queryFn: () => api.getTicketContent(ticketId),
    enabled: !!ticketId,
  });
}

export function useTicketHistory(ticketId: string) {
  return useQuery({
    queryKey: queryKeys.tickets.history(ticketId),
    queryFn: () => api.getTicketHistory(ticketId),
    enabled: !!ticketId,
  });
}

// ============================================================================
// Mutation Hooks
// ============================================================================

export function useSyncTickets() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (projectId: string) => api.syncTickets(projectId),
    onSuccess: (_, projectId) => {
      queryClient.invalidateQueries({ queryKey: queryKeys.tickets.list(projectId) });
    },
  });
}

export function useUpdateTicketState() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({
      ticketId,
      state,
    }: {
      ticketId: string;
      state: TicketState;
    }) => api.updateTicket(ticketId, { state }),
    onSuccess: () => {
      // Invalidate all ticket queries to refresh state
      queryClient.invalidateQueries({ queryKey: queryKeys.tickets.all });
    },
  });
}

export function useApproveTicket() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (ticketId: string) => api.approveTicket(ticketId),
    onSuccess: () => {
      // Invalidate all ticket queries to refresh state
      queryClient.invalidateQueries({ queryKey: queryKeys.tickets.all });
    },
  });
}

export function useRejectTicket() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({
      ticketId,
      feedback,
    }: {
      ticketId: string;
      feedback: string;
    }) => api.rejectTicket(ticketId, feedback),
    onSuccess: () => {
      // Invalidate all ticket queries to refresh state
      queryClient.invalidateQueries({ queryKey: queryKeys.tickets.all });
    },
  });
}

export function useCreateAdhocTicket() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({
      projectId,
      data,
    }: {
      projectId: string;
      data: { title: string; slug: string; isExplore?: boolean };
    }) => api.createAdhocTicket(projectId, data),
    onSuccess: (_, { projectId }) => {
      // Invalidate ticket list to show the new adhoc ticket
      queryClient.invalidateQueries({ queryKey: queryKeys.tickets.list(projectId) });
    },
  });
}

export function useUpdateTicketContent() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({
      ticketId,
      content,
    }: {
      ticketId: string;
      content: string;
    }) => api.updateTicketContent(ticketId, content),
    onSuccess: (_, { ticketId }) => {
      // Invalidate ticket content and detail queries
      queryClient.invalidateQueries({
        queryKey: queryKeys.tickets.content(ticketId),
      });
      queryClient.invalidateQueries({ queryKey: queryKeys.tickets.details() });
    },
  });
}

export function useUpdateTicketTitle() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ ticketId, title }: { ticketId: string; title: string }) =>
      api.updateTicketTitle(ticketId, title),
    onSuccess: () => {
      // Invalidate all ticket queries to refresh data
      queryClient.invalidateQueries({ queryKey: queryKeys.tickets.all });
    },
  });
}

export function useStartTicket() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (ticketId: string) => api.startTicket(ticketId),
    onSuccess: (result) => {
      // Invalidate ticket queries (state changed to in_progress)
      queryClient.invalidateQueries({ queryKey: queryKeys.tickets.all });
      // Invalidate session queries (new session created)
      queryClient.invalidateQueries({ queryKey: queryKeys.sessions.all });
      // Cache the new session
      queryClient.setQueryData(
        queryKeys.sessions.detail(result.session.id),
        result.session
      );
    },
  });
}

export function useDeleteTicket() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (ticketId: string) => api.deleteTicket(ticketId),
    onSuccess: (_data, ticketId) => {
      // Remove the deleted ticket's queries from cache (don't refetch them)
      queryClient.removeQueries({
        queryKey: queryKeys.tickets.detail('', ticketId),
      });
      // Invalidate list queries to refresh the ticket list
      queryClient.invalidateQueries({ queryKey: queryKeys.tickets.lists() });
    },
  });
}
