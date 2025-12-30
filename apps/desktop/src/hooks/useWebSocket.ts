/**
 * WebSocket Hook
 * Handles real-time updates from the server
 */

import { useEffect, useRef, useCallback } from 'react';
import { getApiUrl, getApiKey } from '../services/api';
import { useSessionStore } from '../stores/sessionStore';
import type { SessionStatusPayload } from '../types/api';

const RECONNECT_DELAY = 3000;

export function useWebSocket() {
  const wsRef = useRef<WebSocket | null>(null);
  const reconnectTimeoutRef = useRef<number | null>(null);
  const updateStatus = useSessionStore((state) => state.updateStatus);

  const connect = useCallback(async () => {
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      return;
    }

    try {
      const apiUrl = await getApiUrl();
      const apiKey = await getApiKey();

      // Convert HTTP URL to WebSocket URL
      const wsUrl = apiUrl.replace(/^http/, 'ws');
      const url = apiKey ? `${wsUrl}?apiKey=${apiKey}` : wsUrl;

      const ws = new WebSocket(url);

      ws.onopen = () => {
        console.log('WebSocket connected');
      };

      ws.onmessage = (event) => {
        try {
          const msg = JSON.parse(event.data);

          if (msg.type === 'session:status') {
            const payload = msg.payload as SessionStatusPayload;
            updateStatus(payload.session_id, payload.status, payload.context_percent);
          }
        } catch {
          console.warn('Failed to parse WebSocket message');
        }
      };

      ws.onerror = (error) => {
        console.error('WebSocket error:', error);
      };

      ws.onclose = () => {
        console.log('WebSocket disconnected, reconnecting...');
        wsRef.current = null;

        // Reconnect after delay
        reconnectTimeoutRef.current = window.setTimeout(() => {
          connect();
        }, RECONNECT_DELAY);
      };

      wsRef.current = ws;
    } catch (error) {
      console.error('Failed to connect WebSocket:', error);

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
  }, []);

  useEffect(() => {
    connect();

    return () => {
      disconnect();
    };
  }, [connect, disconnect]);

  return { connect, disconnect };
}
