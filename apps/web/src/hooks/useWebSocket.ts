/**
 * WebSocket Hook
 * Manages WebSocket connection with auto-reconnect and subscriptions
 * Uses a singleton pattern to share connection across all components
 */

import { useEffect, useCallback, useState, useSyncExternalStore } from 'react';

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
    sessionId: string;
    lines: string[];
    raw: boolean;
  };
}

export interface SessionStatusMessage {
  type: 'session:status';
  payload: {
    sessionId: string;
    previousStatus: string;
    newStatus: string;
    timestamp: string;
    error?: string;
  };
}

export interface SessionWaitingMessage {
  type: 'session:waiting';
  payload: {
    sessionId: string;
    waiting: boolean;
    reason?: string;
    detectedBy?: string;
    timestamp: string;
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

// PTY Message Types
export interface PtyAttachedMessage {
  type: 'pty:attached';
  payload: {
    sessionId: string;
    cols: number;
    rows: number;
  };
}

export interface PtyDetachedMessage {
  type: 'pty:detached';
  payload: {
    sessionId: string;
  };
}

export interface PtyOutputMessage {
  type: 'pty:output';
  payload: {
    sessionId: string;
    data: string;
  };
}

export interface PtyExitMessage {
  type: 'pty:exit';
  payload: {
    sessionId: string;
    exitCode: number;
  };
}

export type AiAnalysisType = 'summary' | 'review_report';
export type AiAnalysisStatus = 'generating' | 'completed' | 'failed';

export interface AiAnalysisStatusMessage {
  type: 'ai:analysis_status';
  payload: {
    sessionId: string;
    ticketId?: string;
    analysisType: AiAnalysisType;
    status: AiAnalysisStatus;
    timestamp: string;
    error?: string;
  };
}

export type IncomingMessage =
  | SessionOutputMessage
  | SessionStatusMessage
  | SessionWaitingMessage
  | TicketStateMessage
  | AiAnalysisStatusMessage
  | PtyAttachedMessage
  | PtyDetachedMessage
  | PtyOutputMessage
  | PtyExitMessage
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
  // PTY methods for true terminal emulation
  ptyAttach: (sessionId: string, cols?: number, rows?: number) => void;
  ptyDetach: (sessionId: string) => void;
  ptyWrite: (sessionId: string, data: string) => void;
  ptyResize: (sessionId: string, cols: number, rows: number) => void;
}

// ============================================================================
// Singleton WebSocket Manager
// ============================================================================

type MessageListener = (message: IncomingMessage) => void;
type StateListener = () => void;

class WebSocketManager {
  private ws: WebSocket | null = null;
  private connectionState: ConnectionState = 'disconnected';
  private lastMessage: IncomingMessage | null = null;
  private subscribedSessions = new Set<string>();
  private messageListeners = new Set<MessageListener>();
  private stateListeners = new Set<StateListener>();
  private reconnectTimeout: number | null = null;
  private reconnectAttempts = 0;
  private isConnecting = false;

  private url: string;
  private reconnectInterval: number;
  private maxReconnectAttempts: number;

  constructor(
    url: string = `${window.location.protocol === 'https:' ? 'wss:' : 'ws:'}//${window.location.host}/ws`,
    reconnectInterval: number = 3000,
    maxReconnectAttempts: number = 10
  ) {
    this.url = url;
    this.reconnectInterval = reconnectInterval;
    this.maxReconnectAttempts = maxReconnectAttempts;
  }

  connect(): void {
    // Prevent multiple simultaneous connection attempts
    if (this.isConnecting || this.ws?.readyState === WebSocket.OPEN) {
      console.log('[WebSocketManager] Already connected or connecting');
      return;
    }

    this.isConnecting = true;
    this.setConnectionState('connecting');

    try {
      console.log('[WebSocketManager] Creating new WebSocket connection');
      const ws = new WebSocket(this.url);
      this.ws = ws;

      ws.onopen = () => {
        console.log('[WebSocketManager] Connection opened');
        this.isConnecting = false;
        this.setConnectionState('connected');
        this.reconnectAttempts = 0;

        // Resubscribe to any sessions
        this.subscribedSessions.forEach((sessionId) => {
          console.log('[WebSocketManager] Resubscribing to session:', sessionId);
          ws.send(JSON.stringify({ type: 'session:subscribe', payload: { sessionId } }));
        });
      };

      ws.onmessage = (event) => {
        try {
          const message = JSON.parse(event.data) as IncomingMessage;
          this.lastMessage = message;
          this.notifyStateListeners();
          this.messageListeners.forEach((listener) => listener(message));
        } catch (err) {
          console.error('[WebSocketManager] Failed to parse message:', err);
        }
      };

      ws.onclose = () => {
        console.log('[WebSocketManager] Connection closed');
        this.isConnecting = false;
        this.ws = null;
        this.setConnectionState('disconnected');

        // Attempt reconnect
        if (this.reconnectAttempts < this.maxReconnectAttempts) {
          this.reconnectAttempts++;
          console.log(`[WebSocketManager] Scheduling reconnect attempt ${this.reconnectAttempts}`);
          this.reconnectTimeout = window.setTimeout(() => {
            this.connect();
          }, this.reconnectInterval);
        }
      };

      ws.onerror = (error) => {
        console.error('[WebSocketManager] Connection error:', error);
        this.isConnecting = false;
        this.setConnectionState('error');
      };
    } catch (err) {
      console.error('[WebSocketManager] Failed to create WebSocket:', err);
      this.isConnecting = false;
      this.setConnectionState('error');
    }
  }

  private setConnectionState(state: ConnectionState): void {
    this.connectionState = state;
    this.notifyStateListeners();
  }

  private notifyStateListeners(): void {
    this.stateListeners.forEach((listener) => listener());
  }

  getConnectionState(): ConnectionState {
    return this.connectionState;
  }

  getLastMessage(): IncomingMessage | null {
    return this.lastMessage;
  }

  isConnected(): boolean {
    return this.ws?.readyState === WebSocket.OPEN;
  }

  // Subscribe to state changes (for useSyncExternalStore)
  subscribeToState(listener: StateListener): () => void {
    this.stateListeners.add(listener);

    // Auto-connect when first subscriber
    if (this.stateListeners.size === 1 && !this.ws && !this.isConnecting) {
      this.connect();
    }

    return () => {
      this.stateListeners.delete(listener);
    };
  }

  // Subscribe to messages
  subscribeToMessages(listener: MessageListener): () => void {
    this.messageListeners.add(listener);
    return () => {
      this.messageListeners.delete(listener);
    };
  }

  // Session subscription
  subscribeToSession(sessionId: string): void {
    console.log('[WebSocketManager] subscribeToSession:', sessionId, 'isConnected:', this.isConnected());
    this.subscribedSessions.add(sessionId);
    if (this.isConnected()) {
      const msg = JSON.stringify({ type: 'session:subscribe', payload: { sessionId } });
      console.log('[WebSocketManager] Sending:', msg);
      this.ws!.send(msg);
    }
  }

  unsubscribeFromSession(sessionId: string): void {
    this.subscribedSessions.delete(sessionId);
    if (this.isConnected()) {
      this.ws!.send(JSON.stringify({ type: 'session:unsubscribe', payload: { sessionId } }));
    }
  }

  send(message: WebSocketMessage): void {
    if (this.isConnected()) {
      this.ws!.send(JSON.stringify(message));
    } else {
      console.warn('[WebSocketManager] Not connected, message not sent:', message);
    }
  }

  // PTY methods
  ptyAttach(sessionId: string, cols?: number, rows?: number): void {
    console.log('[WebSocketManager] ptyAttach:', { sessionId, cols, rows, isConnected: this.isConnected() });
    if (this.isConnected()) {
      const payload: { sessionId: string; cols?: number; rows?: number } = { sessionId };
      if (cols !== undefined) payload.cols = cols;
      if (rows !== undefined) payload.rows = rows;
      const msg = JSON.stringify({ type: 'pty:attach', payload });
      console.log('[WebSocketManager] Sending:', msg);
      this.ws!.send(msg);
    } else {
      console.warn('[WebSocketManager] Not connected, cannot send pty:attach');
    }
  }

  ptyDetach(sessionId: string): void {
    if (this.isConnected()) {
      this.ws!.send(JSON.stringify({ type: 'pty:detach', payload: { sessionId } }));
    }
  }

  ptyWrite(sessionId: string, data: string): void {
    if (this.isConnected()) {
      this.ws!.send(JSON.stringify({ type: 'pty:data', payload: { sessionId, data } }));
    }
  }

  ptyResize(sessionId: string, cols: number, rows: number): void {
    if (this.isConnected()) {
      this.ws!.send(JSON.stringify({ type: 'pty:resize', payload: { sessionId, cols, rows } }));
    }
  }
}

// Create singleton instance
const wsManager = new WebSocketManager();

// ============================================================================
// Hook Implementation
// ============================================================================

export function useWebSocket(_options: UseWebSocketOptions = {}): UseWebSocketReturn {
  // Use useSyncExternalStore for connection state
  const connectionState = useSyncExternalStore(
    (callback) => wsManager.subscribeToState(callback),
    () => wsManager.getConnectionState(),
    () => 'disconnected' as ConnectionState // Server snapshot
  );

  // Track last message with local state (since it changes frequently)
  const [lastMessage, setLastMessage] = useState<IncomingMessage | null>(null);

  // Subscribe to messages
  useEffect(() => {
    return wsManager.subscribeToMessages((message) => {
      setLastMessage(message);
    });
  }, []);

  // Stable callbacks that delegate to the manager
  const subscribe = useCallback((sessionId: string) => {
    wsManager.subscribeToSession(sessionId);
  }, []);

  const unsubscribe = useCallback((sessionId: string) => {
    wsManager.unsubscribeFromSession(sessionId);
  }, []);

  const sendMessage = useCallback((message: WebSocketMessage) => {
    wsManager.send(message);
  }, []);

  const ptyAttach = useCallback((sessionId: string, cols?: number, rows?: number) => {
    wsManager.ptyAttach(sessionId, cols, rows);
  }, []);

  const ptyDetach = useCallback((sessionId: string) => {
    wsManager.ptyDetach(sessionId);
  }, []);

  const ptyWrite = useCallback((sessionId: string, data: string) => {
    wsManager.ptyWrite(sessionId, data);
  }, []);

  const ptyResize = useCallback((sessionId: string, cols: number, rows: number) => {
    wsManager.ptyResize(sessionId, cols, rows);
  }, []);

  return {
    connectionState,
    subscribe,
    unsubscribe,
    lastMessage,
    sendMessage,
    ptyAttach,
    ptyDetach,
    ptyWrite,
    ptyResize,
  };
}
