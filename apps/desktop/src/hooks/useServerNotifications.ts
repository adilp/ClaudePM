/**
 * Server Notifications Hook
 * Polls the server for notifications and shows desktop alerts for new ones
 * Handles: review_ready, context_low, handoff_complete, error, waiting_input
 */

import { useEffect, useRef, useCallback } from 'react';
import { sendNotification } from '@tauri-apps/plugin-notification';
import { getApiUrl, getApiKey, getNotificationsEnabled } from '../services/api';
import { ensureNotificationPermission } from './useDesktopNotifications';

interface ServerNotification {
  id: string;
  type: 'review_ready' | 'context_low' | 'handoff_complete' | 'error' | 'waiting_input';
  title: string;
  message: string;
  session_id?: string;
  ticket_id?: string;
  created_at: string;
  read: boolean;
}

const POLL_INTERVAL = 15000; // 15 seconds

/**
 * Map notification type to display title
 */
function getNotificationTitle(type: ServerNotification['type']): string {
  switch (type) {
    case 'review_ready':
      return 'Ready for Review';
    case 'context_low':
      return 'Context Running Low';
    case 'handoff_complete':
      return 'Handoff Complete';
    case 'error':
      return 'Session Error';
    case 'waiting_input':
      return 'Input Required';
    default:
      return 'Notification';
  }
}

/**
 * Fetch notifications from server
 */
async function fetchNotifications(): Promise<ServerNotification[]> {
  const apiUrl = await getApiUrl();
  const apiKey = await getApiKey();

  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
  };

  if (apiKey) {
    headers['X-API-Key'] = apiKey;
  }

  const response = await fetch(`${apiUrl}/api/notifications`, { headers });

  if (!response.ok) {
    throw new Error(`Failed to fetch notifications: ${response.status}`);
  }

  return response.json();
}

/**
 * Hook that polls for server notifications and shows desktop alerts
 */
export function useServerNotifications() {
  // Track which notification IDs we've already shown
  const shownIdsRef = useRef<Set<string>>(new Set());
  const pollIntervalRef = useRef<number | null>(null);

  const checkNotifications = useCallback(async () => {
    try {
      const enabled = await getNotificationsEnabled();
      if (!enabled) {
        return;
      }

      const notifications = await fetchNotifications();

      // Filter to unread notifications we haven't shown yet
      const newNotifications = notifications.filter(
        (n) => !n.read && !shownIdsRef.current.has(n.id)
      );

      if (newNotifications.length === 0) {
        return;
      }

      const granted = await ensureNotificationPermission();
      if (!granted) {
        return;
      }

      // Show desktop notification for each new one
      for (const notif of newNotifications) {
        shownIdsRef.current.add(notif.id);

        sendNotification({
          title: getNotificationTitle(notif.type),
          body: notif.message || notif.title,
        });
      }

      // Limit the size of shown IDs set to prevent memory growth
      if (shownIdsRef.current.size > 500) {
        const idsArray = Array.from(shownIdsRef.current);
        shownIdsRef.current = new Set(idsArray.slice(-250));
      }
    } catch (error) {
      // Silently fail - server might not be available
      console.debug('[ServerNotifications] Poll failed:', error);
    }
  }, []);

  useEffect(() => {
    // Initial check
    checkNotifications();

    // Set up polling
    pollIntervalRef.current = window.setInterval(checkNotifications, POLL_INTERVAL);

    return () => {
      if (pollIntervalRef.current) {
        clearInterval(pollIntervalRef.current);
      }
    };
  }, [checkNotifications]);
}
