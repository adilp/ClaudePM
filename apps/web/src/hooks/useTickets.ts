/**
 * Ticket Hooks
 * React Query hooks for ticket data
 */

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '@/services/api';

// Query keys
export const ticketKeys = {
  all: ['tickets'] as const,
  lists: () => [...ticketKeys.all, 'list'] as const,
  list: (projectId: string) => [...ticketKeys.lists(), projectId] as const,
  details: () => [...ticketKeys.all, 'detail'] as const,
  detail: (projectId: string, ticketId: string) =>
    [...ticketKeys.details(), projectId, ticketId] as const,
};

// Hooks
export function useTickets(projectId: string) {
  return useQuery({
    queryKey: ticketKeys.list(projectId),
    queryFn: () => api.getTickets(projectId),
    enabled: !!projectId,
  });
}

export function useTicket(projectId: string, ticketId: string) {
  return useQuery({
    queryKey: ticketKeys.detail(projectId, ticketId),
    queryFn: () => api.getTicket(projectId, ticketId),
    enabled: !!projectId && !!ticketId,
  });
}

export function useSyncTickets() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (projectId: string) => api.syncTickets(projectId),
    onSuccess: (_, projectId) => {
      queryClient.invalidateQueries({ queryKey: ticketKeys.list(projectId) });
    },
  });
}

export function useUpdateTicketState() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ ticketId, state }: { ticketId: string; state: 'backlog' | 'in_progress' | 'review' | 'done' }) =>
      api.updateTicket(ticketId, { state }),
    onSuccess: () => {
      // Invalidate all ticket queries to refresh state
      queryClient.invalidateQueries({ queryKey: ticketKeys.all });
    },
  });
}

export function useApproveTicket() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (ticketId: string) => api.approveTicket(ticketId),
    onSuccess: () => {
      // Invalidate all ticket queries to refresh state
      queryClient.invalidateQueries({ queryKey: ticketKeys.all });
    },
  });
}

export function useRejectTicket() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ ticketId, feedback }: { ticketId: string; feedback: string }) =>
      api.rejectTicket(ticketId, feedback),
    onSuccess: () => {
      // Invalidate all ticket queries to refresh state
      queryClient.invalidateQueries({ queryKey: ticketKeys.all });
    },
  });
}

export function useTicketHistory(ticketId: string) {
  return useQuery({
    queryKey: [...ticketKeys.detail('', ticketId), 'history'],
    queryFn: () => api.getTicketHistory(ticketId),
    enabled: !!ticketId,
  });
}

export function useCreateAdhocTicket() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ projectId, data }: { projectId: string; data: { title: string; slug: string } }) =>
      api.createAdhocTicket(projectId, data),
    onSuccess: (_, { projectId }) => {
      // Invalidate ticket list to show the new adhoc ticket
      queryClient.invalidateQueries({ queryKey: ticketKeys.list(projectId) });
    },
  });
}

export function useTicketContent(ticketId: string) {
  return useQuery({
    queryKey: [...ticketKeys.detail('', ticketId), 'content'],
    queryFn: () => api.getTicketContent(ticketId),
    enabled: !!ticketId,
  });
}

export function useUpdateTicketContent() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ ticketId, content }: { ticketId: string; content: string }) =>
      api.updateTicketContent(ticketId, content),
    onSuccess: (_, { ticketId }) => {
      // Invalidate ticket content and detail queries
      queryClient.invalidateQueries({ queryKey: [...ticketKeys.detail('', ticketId), 'content'] });
      queryClient.invalidateQueries({ queryKey: ticketKeys.details() });
    },
  });
}

export function useStartTicket() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (ticketId: string) => api.startTicket(ticketId),
    onSuccess: (result) => {
      // Invalidate ticket queries (state changed to in_progress)
      queryClient.invalidateQueries({ queryKey: ticketKeys.all });
      // Invalidate session queries (new session created)
      queryClient.invalidateQueries({ queryKey: ['sessions'] });
      // Cache the new session
      queryClient.setQueryData(['sessions', 'detail', result.session.id], result.session);
    },
  });
}
