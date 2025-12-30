/**
 * WebSocket Hook
 * Handles real-time updates from the server
 * Aligned with web app's message types and patterns
 */

import { useEffect, useRef, useCallback, useState } from 'react';
import { getApiUrl, getApiKey } from '../services/api';
import { useSessionStore } from '../stores/sessionStore';
import type {
  IncomingMessage,
  SessionStatusMessage,
  SessionWaitingMessage,
  SessionStatus,
} from '../types/api';

const RECONNECT_DELAY = 3000;

export type ConnectionState = 'connecting' | 'connected' | 'disconnected' | 'error';

export interface UseWebSocketReturn {
  connectionState: ConnectionState;
  lastMessage: IncomingMessage | null;
  connect: () => void;
  disconnect: () => void;
}

/**
 * Type guard for session:status messages
 */
function isSessionStatusMessage(msg: IncomingMessage): msg is SessionStatusMessage {
  return msg.type === 'session:status';
}

/**
 * Type guard for session:waiting messages
 */
function isSessionWaitingMessage(msg: IncomingMessage): msg is SessionWaitingMessage {
  return msg.type === 'session:waiting';
}

export function useWebSocket(): UseWebSocketReturn {
  const wsRef = useRef<WebSocket | null>(null);
  const reconnectTimeoutRef = useRef<number | null>(null);
  const updateStatus = useSessionStore((state) => state.updateStatus);

  const [connectionState, setConnectionState] = useState<ConnectionState>('disconnected');
  const [lastMessage, setLastMessage] = useState<IncomingMessage | null>(null);

  const connect = useCallback(async () => {
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      return;
    }

    setConnectionState('connecting');

    try {
      const apiUrl = await getApiUrl();
      const apiKey = await getApiKey();

      // Convert HTTP URL to WebSocket URL
      const wsUrl = apiUrl.replace(/^http/, 'ws');
      const url = apiKey ? `${wsUrl}?apiKey=${apiKey}` : wsUrl;

      const ws = new WebSocket(url);

      ws.onopen = () => {
        console.log('[WebSocket] Connected');
        setConnectionState('connected');
      };

      ws.onmessage = (event) => {
        try {
          const msg = JSON.parse(event.data) as IncomingMessage;

          // Update last message for notification hook to consume
          setLastMessage(msg);

          // Handle session:status - update store with new status
          if (isSessionStatusMessage(msg)) {
            const { sessionId, newStatus } = msg.payload;
            updateStatus(sessionId, newStatus as SessionStatus);
          }

          // Handle session:waiting - update store to paused status when waiting
          if (isSessionWaitingMessage(msg)) {
            const { sessionId, waiting } = msg.payload;
            if (waiting) {
              updateStatus(sessionId, 'paused');
            }
          }
        } catch {
          console.warn('[WebSocket] Failed to parse message');
        }
      };

      ws.onerror = (error) => {
        console.error('[WebSocket] Error:', error);
        setConnectionState('error');
      };

      ws.onclose = () => {
        console.log('[WebSocket] Disconnected, reconnecting...');
        wsRef.current = null;
        setConnectionState('disconnected');

        // Reconnect after delay
        reconnectTimeoutRef.current = window.setTimeout(() => {
          connect();
        }, RECONNECT_DELAY);
      };

      wsRef.current = ws;
    } catch (error) {
      console.error('[WebSocket] Failed to connect:', error);
      setConnectionState('error');

      // Retry connection
      reconnectTimeoutRef.current = window.setTimeout(() => {
        connect();
      }, RECONNECT_DELAY);
    }
  }, [updateStatus]);

  const disconnect = useCallback(() => {
    if (reconnectTimeoutRef.current) {
      clearTimeout(reconnectTimeoutRef.current);
      reconnectTimeoutRef.current = null;
    }

    if (wsRef.current) {
      wsRef.current.close();
      wsRef.current = null;
    }

    setConnectionState('disconnected');
  }, []);

  useEffect(() => {
    connect();

    return () => {
      disconnect();
    };
  }, [connect, disconnect]);

  return { connectionState, lastMessage, connect, disconnect };
}

// Re-export type guards for use in other modules
export { isSessionStatusMessage, isSessionWaitingMessage };
