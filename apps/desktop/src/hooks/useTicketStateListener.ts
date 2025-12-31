/**
 * Ticket State Listener Hook
 * Listens to WebSocket for real-time ticket state changes
 * Invalidates React Query cache and triggers highlight animation
 */

import { useEffect } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { useUIStore } from '../stores/uiStore';
import { queryKeys } from './query-keys';
import type { IncomingMessage, TicketStateMessage } from '../types/api';

/**
 * Type guard for ticket:state messages
 */
export function isTicketStateMessage(msg: IncomingMessage): msg is TicketStateMessage {
  return msg.type === 'ticket:state';
}

interface UseTicketStateListenerProps {
  lastMessage: IncomingMessage | null;
}

/**
 * Hook that listens to WebSocket ticket state changes and:
 * 1. Invalidates React Query cache for instant kanban board updates
 * 2. Sets highlighted ticket for visual feedback animation
 */
export function useTicketStateListener({ lastMessage }: UseTicketStateListenerProps) {
  const queryClient = useQueryClient();
  const setHighlightedTicket = useUIStore((state) => state.setHighlightedTicket);

  useEffect(() => {
    if (!lastMessage) {
      return;
    }

    // Debug: log all incoming messages to verify WebSocket is working
    console.log('[TicketStateListener] Received message:', lastMessage.type);

    if (!isTicketStateMessage(lastMessage)) {
      return;
    }

    const { ticketId, previousState, newState, trigger } = lastMessage.payload;

    console.log(
      `[TicketState] Ticket ${ticketId} moved from ${previousState} to ${newState} (${trigger})`
    );

    // Invalidate React Query cache to trigger refetch
    // This updates the kanban board with fresh data
    queryClient.invalidateQueries({ queryKey: queryKeys.tickets.all });

    // Also invalidate project details (ticket counts may have changed)
    queryClient.invalidateQueries({ queryKey: queryKeys.projects.details() });

    // Set highlighted ticket for visual feedback
    setHighlightedTicket(ticketId);
  }, [lastMessage, queryClient, setHighlightedTicket]);
}
