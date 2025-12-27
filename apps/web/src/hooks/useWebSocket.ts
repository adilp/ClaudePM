/**
 * WebSocket Hook
 * Manages WebSocket connection with auto-reconnect and subscriptions
 */

import { useEffect, useRef, useCallback, useState } from 'react';

// ============================================================================
// Types
// ============================================================================

export type ConnectionState = 'connecting' | 'connected' | 'disconnected' | 'error';

export interface WebSocketMessage {
  type: string;
  payload: unknown;
}

export interface SessionOutputMessage {
  type: 'session:output';
  payload: {
    session_id: string;
    output: string;
    timestamp: string;
  };
}

export interface SessionStateMessage {
  type: 'session:stateChange';
  payload: {
    session_id: string;
    status: string;
    context_percent: number | null;
  };
}

export interface SessionWaitingMessage {
  type: 'session:waiting';
  payload: {
    session_id: string;
    waiting: boolean;
    reason?: string;
    detected_by?: string;
  };
}

export interface TicketStateMessage {
  type: 'ticket:stateChange';
  payload: {
    ticket_id: string;
    old_state: string;
    new_state: string;
  };
}

export type IncomingMessage =
  | SessionOutputMessage
  | SessionStateMessage
  | SessionWaitingMessage
  | TicketStateMessage
  | WebSocketMessage;

interface UseWebSocketOptions {
  url?: string;
  reconnectInterval?: number;
  maxReconnectAttempts?: number;
}

interface UseWebSocketReturn {
  connectionState: ConnectionState;
  subscribe: (sessionId: string) => void;
  unsubscribe: (sessionId: string) => void;
  lastMessage: IncomingMessage | null;
  sendMessage: (message: WebSocketMessage) => void;
}

// ============================================================================
// Hook Implementation
// ============================================================================

export function useWebSocket(options: UseWebSocketOptions = {}): UseWebSocketReturn {
  const {
    // Use /ws path which Vite proxies to the backend WebSocket server
    url = `${window.location.protocol === 'https:' ? 'wss:' : 'ws:'}//${window.location.host}/ws`,
    reconnectInterval = 3000,
    maxReconnectAttempts = 10,
  } = options;

  const wsRef = useRef<WebSocket | null>(null);
  const reconnectAttemptsRef = useRef(0);
  const reconnectTimeoutRef = useRef<number | null>(null);
  const subscribedSessionsRef = useRef<Set<string>>(new Set());

  const [connectionState, setConnectionState] = useState<ConnectionState>('disconnected');
  const [lastMessage, setLastMessage] = useState<IncomingMessage | null>(null);

  const connect = useCallback(() => {
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      return;
    }

    setConnectionState('connecting');

    try {
      const ws = new WebSocket(url);
      wsRef.current = ws;

      ws.onopen = () => {
        setConnectionState('connected');
        reconnectAttemptsRef.current = 0;

        // Resubscribe to any sessions
        subscribedSessionsRef.current.forEach((sessionId) => {
          ws.send(JSON.stringify({ type: 'subscribe', sessionId }));
        });
      };

      ws.onmessage = (event) => {
        try {
          const message = JSON.parse(event.data) as IncomingMessage;
          setLastMessage(message);
        } catch (err) {
          console.error('Failed to parse WebSocket message:', err);
        }
      };

      ws.onclose = () => {
        setConnectionState('disconnected');
        wsRef.current = null;

        // Attempt reconnect
        if (reconnectAttemptsRef.current < maxReconnectAttempts) {
          reconnectAttemptsRef.current++;
          reconnectTimeoutRef.current = window.setTimeout(() => {
            connect();
          }, reconnectInterval);
        }
      };

      ws.onerror = () => {
        setConnectionState('error');
      };
    } catch (err) {
      console.error('Failed to create WebSocket:', err);
      setConnectionState('error');
    }
  }, [url, reconnectInterval, maxReconnectAttempts]);

  const disconnect = useCallback(() => {
    if (reconnectTimeoutRef.current) {
      clearTimeout(reconnectTimeoutRef.current);
      reconnectTimeoutRef.current = null;
    }
    reconnectAttemptsRef.current = maxReconnectAttempts; // Prevent reconnect
    wsRef.current?.close();
    wsRef.current = null;
    setConnectionState('disconnected');
  }, [maxReconnectAttempts]);

  const subscribe = useCallback((sessionId: string) => {
    subscribedSessionsRef.current.add(sessionId);
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify({ type: 'subscribe', sessionId }));
    }
  }, []);

  const unsubscribe = useCallback((sessionId: string) => {
    subscribedSessionsRef.current.delete(sessionId);
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify({ type: 'unsubscribe', sessionId }));
    }
  }, []);

  const sendMessage = useCallback((message: WebSocketMessage) => {
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify(message));
    } else {
      console.warn('WebSocket not connected, message not sent:', message);
    }
  }, []);

  // Connect on mount, disconnect on unmount
  useEffect(() => {
    connect();
    return () => disconnect();
  }, [connect, disconnect]);

  return {
    connectionState,
    subscribe,
    unsubscribe,
    lastMessage,
    sendMessage,
  };
}
