/**
 * Notification Hooks
 * React Query hooks for notification data
 */

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import * as api from '../services/api';

// Query keys
export const notificationKeys = {
  all: ['notifications'] as const,
  list: () => [...notificationKeys.all, 'list'] as const,
  count: () => [...notificationKeys.all, 'count'] as const,
};

// Hooks
export function useNotifications() {
  return useQuery({
    queryKey: notificationKeys.list(),
    queryFn: () => api.getNotifications(),
    refetchInterval: 30000, // Refetch every 30 seconds
  });
}

export function useNotificationCount() {
  return useQuery({
    queryKey: notificationKeys.count(),
    queryFn: () => api.getNotificationCount(),
    refetchInterval: 15000, // Refetch every 15 seconds
  });
}

export function useDismissNotification() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (id: string) => api.dismissNotification(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: notificationKeys.all });
    },
  });
}

export function useDismissAllNotifications() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: () => api.dismissAllNotifications(),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: notificationKeys.all });
    },
  });
}
