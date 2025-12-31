/**
 * Server Notifications Hook
 * Listens to WebSocket for real-time notifications and shows desktop alerts
 * Also invalidates React Query cache for instant UI updates
 */

import { useEffect, useRef } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { sendNotification } from '@tauri-apps/plugin-notification';
import { getNotificationsEnabled } from '../services/api';
import { ensureNotificationPermission } from './useDesktopNotifications';
import { notificationKeys } from './useNotifications';
import type { IncomingMessage, NotificationWsMessage } from '../types/api';

/**
 * Type guard for notification messages
 */
function isNotificationMessage(msg: IncomingMessage): msg is NotificationWsMessage {
  return msg.type === 'notification';
}

interface UseServerNotificationsProps {
  lastMessage: IncomingMessage | null;
}

/**
 * Hook that listens to WebSocket notifications and:
 * 1. Shows desktop notifications via Tauri
 * 2. Invalidates React Query cache for instant UI updates
 */
export function useServerNotifications({ lastMessage }: UseServerNotificationsProps) {
  const queryClient = useQueryClient();
  // Track which notification IDs we've already shown to prevent duplicates
  const shownIdsRef = useRef<Set<string>>(new Set());

  useEffect(() => {
    if (!lastMessage || !isNotificationMessage(lastMessage)) {
      return;
    }

    const { id, title, body } = lastMessage.payload;

    // Invalidate React Query cache for instant UI updates
    queryClient.invalidateQueries({ queryKey: notificationKeys.all });

    // Skip if we've already shown this notification
    if (shownIdsRef.current.has(id)) {
      return;
    }

    // Show desktop notification
    (async () => {
      try {
        const enabled = await getNotificationsEnabled();
        if (!enabled) {
          return;
        }

        const granted = await ensureNotificationPermission();
        if (!granted) {
          return;
        }

        shownIdsRef.current.add(id);

        await sendNotification({
          title,
          body,
        });

        console.log('[ServerNotif] Notification shown:', id, title);

        // Limit the size of shown IDs set to prevent memory growth
        if (shownIdsRef.current.size > 500) {
          const idsArray = Array.from(shownIdsRef.current);
          shownIdsRef.current = new Set(idsArray.slice(-250));
        }
      } catch (error) {
        console.debug('[ServerNotifications] Failed to show notification:', error);
      }
    })();
  }, [lastMessage, queryClient]);
}
