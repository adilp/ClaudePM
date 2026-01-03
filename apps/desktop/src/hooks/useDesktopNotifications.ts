/**
 * Desktop Notifications Hook
 * Sends macOS notifications for session events (completion, input required, errors)
 * Uses WebSocket messages directly for immediate notification delivery
 */

import { useEffect, useRef } from 'react';
import {
  isPermissionGranted,
  requestPermission,
  sendNotification,
} from '@tauri-apps/plugin-notification';
import { useWebSocket, isSessionStatusMessage, isSessionWaitingMessage } from './useWebSocket';
import { useSessionStore } from '../stores/sessionStore';
import { getNotificationsEnabled } from '../services/api';
import type { IncomingMessage } from '../types/api';

/**
 * Ensure notification permission is granted
 * Returns true if permission is granted, false otherwise
 */
export async function ensureNotificationPermission(): Promise<boolean> {
  try {
    let granted = await isPermissionGranted();
    if (!granted) {
      const permission = await requestPermission();
      granted = permission === 'granted';
    }
    return granted;
  } catch (error) {
    console.warn('Failed to check notification permission:', error);
    return false;
  }
}

/**
 * Send a desktop notification if enabled and permitted
 */
async function sendDesktopNotification(
  title: string,
  body: string
): Promise<void> {
  try {
    console.log('[DesktopNotif] Attempting to send:', { title, body });

    const enabled = await getNotificationsEnabled();
    console.log('[DesktopNotif] Notifications enabled:', enabled);
    if (!enabled) {
      return;
    }

    const granted = await ensureNotificationPermission();
    console.log('[DesktopNotif] Permission granted:', granted);
    if (granted) {
      console.log('[DesktopNotif] Sending notification now...');
      await sendNotification({ title, body });
      console.log('[DesktopNotif] Notification sent successfully');
    }
  } catch (error) {
    console.warn('Failed to send notification:', error);
  }
}

/**
 * Get session name from store by ID
 */
function getSessionDisplayName(sessionId: string, sessions: ReturnType<typeof useSessionStore.getState>['sessions']): string {
  const session = sessions.find((s) => s.id === sessionId);
  if (!session) {
    return `Session ${sessionId.slice(0, 8)}`;
  }
  if (session.ticket?.title) {
    return session.ticket.title;
  }
  if (session.project?.name) {
    return `${session.project.name} session`;
  }
  return `Session ${sessionId.slice(0, 8)}`;
}

/**
 * Process incoming WebSocket message and send appropriate notification
 */
async function processMessage(
  msg: IncomingMessage,
  sessions: ReturnType<typeof useSessionStore.getState>['sessions']
): Promise<void> {
  // Handle session:status messages
  if (isSessionStatusMessage(msg)) {
    const { sessionId, newStatus, error } = msg.payload;
    const displayName = getSessionDisplayName(sessionId, sessions);

    switch (newStatus) {
      case 'completed':
        await sendDesktopNotification(
          `Session Complete: ${displayName}`,
          'Finished successfully'
        );
        break;

      case 'error':
        await sendDesktopNotification(
          `Session Error: ${displayName}`,
          error || 'Encountered an error'
        );
        break;
    }
  }

  // Handle session:waiting messages
  if (isSessionWaitingMessage(msg)) {
    const { sessionId, waiting, reason } = msg.payload;

    if (waiting) {
      const displayName = getSessionDisplayName(sessionId, sessions);
      await sendDesktopNotification(
        `Input Required: ${displayName}`,
        reason || 'Waiting for input'
      );
    }
  }
}

/**
 * Hook that monitors WebSocket messages and sends desktop notifications
 * for session completion, waiting for input, and errors.
 *
 * Uses the WebSocket lastMessage directly for immediate notification delivery.
 */
export function useDesktopNotifications() {
  const { lastMessage } = useWebSocket();
  const sessions = useSessionStore((state) => state.sessions);

  // Track processed message IDs to avoid duplicates
  const processedRef = useRef<Set<string>>(new Set());

  useEffect(() => {
    if (!lastMessage) {
      return;
    }

    console.log('[DesktopNotif] Received WebSocket message:', lastMessage.type, lastMessage);

    // Create a unique key for this message to avoid duplicate notifications
    const messageKey = JSON.stringify(lastMessage);

    // Skip if we've already processed this exact message
    if (processedRef.current.has(messageKey)) {
      console.log('[DesktopNotif] Skipping duplicate message');
      return;
    }

    // Mark as processed
    processedRef.current.add(messageKey);

    // Limit the size of the processed set to prevent memory leaks
    if (processedRef.current.size > 100) {
      const keysArray = Array.from(processedRef.current);
      keysArray.slice(0, 50).forEach((key) => processedRef.current.delete(key));
    }

    // Process the message
    console.log('[DesktopNotif] Processing message...');
    processMessage(lastMessage, sessions);
  }, [lastMessage, sessions]);
}
