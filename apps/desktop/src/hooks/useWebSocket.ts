/**
 * WebSocket Hook
 * Handles real-time updates from the server
 * Uses singleton pattern to share connection across all components (matching web app)
 */

import { useEffect, useCallback, useState, useSyncExternalStore, useRef } from 'react';
import { getApiUrl, getApiKey } from '../services/api';
import { useSessionStore } from '../stores/sessionStore';
import { toast } from './use-toast';
import type {
  IncomingMessage,
  SessionStatusMessage,
  SessionWaitingMessage,
  SessionStatus,
} from '../types/api';

// ============================================================================
// Types
// ============================================================================

export type ConnectionState = 'connecting' | 'connected' | 'disconnected' | 'error';

export interface UseWebSocketReturn {
  connectionState: ConnectionState;
  lastMessage: IncomingMessage | null;
  connect: () => void;
  disconnect: () => void;
}

// ============================================================================
// Type Guards
// ============================================================================

/**
 * Type guard for session:status messages
 */
export function isSessionStatusMessage(msg: IncomingMessage): msg is SessionStatusMessage {
  return msg.type === 'session:status';
}

/**
 * Type guard for session:waiting messages
 */
export function isSessionWaitingMessage(msg: IncomingMessage): msg is SessionWaitingMessage {
  return msg.type === 'session:waiting';
}

// ============================================================================
// Singleton WebSocket Manager
// ============================================================================

type MessageListener = (message: IncomingMessage) => void;
type StateListener = () => void;
type ErrorListener = (error: WebSocketError) => void;

export interface WebSocketError {
  type: 'connection_failed' | 'max_reconnects' | 'reconnecting';
  message: string;
  attempt?: number;
  maxAttempts?: number;
}

const RECONNECT_DELAY = 3000;
const MAX_RECONNECT_ATTEMPTS = 10;

class WebSocketManager {
  private ws: WebSocket | null = null;
  private connectionState: ConnectionState = 'disconnected';
  private lastMessage: IncomingMessage | null = null;
  private messageListeners = new Set<MessageListener>();
  private stateListeners = new Set<StateListener>();
  private errorListeners = new Set<ErrorListener>();
  private reconnectTimeout: number | null = null;
  private reconnectAttempts = 0;
  private isConnecting = false;
  private wasConnected = false; // Track if we were previously connected

  // Cached connection params
  private cachedUrl: string | null = null;
  private cachedApiKey: string | null = null;

  async connect(): Promise<void> {
    // Prevent multiple simultaneous connection attempts
    if (this.isConnecting || this.ws?.readyState === WebSocket.OPEN) {
      console.log('[WebSocketManager] Already connected or connecting');
      return;
    }

    this.isConnecting = true;
    this.setConnectionState('connecting');

    try {
      // Get API URL and key (cache them for reconnects)
      if (!this.cachedUrl) {
        const apiUrl = await getApiUrl();
        this.cachedUrl = apiUrl.replace(/^http/, 'ws');
      }
      if (this.cachedApiKey === null) {
        this.cachedApiKey = await getApiKey() || '';
      }

      const url = this.cachedApiKey
        ? `${this.cachedUrl}?apiKey=${this.cachedApiKey}`
        : this.cachedUrl;

      console.log('[WebSocketManager] Creating new WebSocket connection');
      const ws = new WebSocket(url);
      this.ws = ws;

      ws.onopen = () => {
        console.log('[WebSocketManager] Connection opened');
        const wasReconnect = this.wasConnected && this.reconnectAttempts > 0;
        this.isConnecting = false;
        this.setConnectionState('connected');
        this.reconnectAttempts = 0;
        this.wasConnected = true;

        // Notify about successful reconnection
        if (wasReconnect) {
          this.notifyError({
            type: 'reconnecting',
            message: 'Connection restored',
          });
        }
      };

      ws.onmessage = (event) => {
        try {
          const message = JSON.parse(event.data as string) as IncomingMessage;
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
        if (this.reconnectAttempts < MAX_RECONNECT_ATTEMPTS) {
          this.reconnectAttempts++;
          console.log(`[WebSocketManager] Scheduling reconnect attempt ${this.reconnectAttempts}`);

          // Notify about reconnect attempt (only on first attempt to avoid spam)
          if (this.reconnectAttempts === 1 && this.wasConnected) {
            this.notifyError({
              type: 'reconnecting',
              message: 'Connection lost. Reconnecting...',
              attempt: this.reconnectAttempts,
              maxAttempts: MAX_RECONNECT_ATTEMPTS,
            });
          }

          this.reconnectTimeout = window.setTimeout(() => {
            void this.connect();
          }, RECONNECT_DELAY);
        } else {
          console.log('[WebSocketManager] Max reconnect attempts reached');
          this.notifyError({
            type: 'max_reconnects',
            message: 'Unable to connect to server. Please check your connection and server settings.',
            attempt: this.reconnectAttempts,
            maxAttempts: MAX_RECONNECT_ATTEMPTS,
          });
        }
      };

      ws.onerror = (error) => {
        console.error('[WebSocketManager] Connection error:', error);
        this.isConnecting = false;
        this.setConnectionState('error');

        // Only notify on first error (not during reconnect attempts)
        if (this.reconnectAttempts === 0 && !this.wasConnected) {
          this.notifyError({
            type: 'connection_failed',
            message: 'Failed to connect to server. Please check your server URL in Settings.',
          });
        }
      };
    } catch (err) {
      console.error('[WebSocketManager] Failed to create WebSocket:', err);
      this.isConnecting = false;
      this.setConnectionState('error');

      // Notify about connection failure
      if (this.reconnectAttempts === 0) {
        this.notifyError({
          type: 'connection_failed',
          message: 'Failed to connect to server. Please check your server URL in Settings.',
        });
      }

      // Retry connection
      if (this.reconnectAttempts < MAX_RECONNECT_ATTEMPTS) {
        this.reconnectAttempts++;
        this.reconnectTimeout = window.setTimeout(() => {
          void this.connect();
        }, RECONNECT_DELAY);
      }
    }
  }

  disconnect(): void {
    if (this.reconnectTimeout) {
      clearTimeout(this.reconnectTimeout);
      this.reconnectTimeout = null;
    }

    if (this.ws) {
      this.ws.close();
      this.ws = null;
    }

    this.isConnecting = false;
    this.reconnectAttempts = 0;
    this.setConnectionState('disconnected');
  }

  private setConnectionState(state: ConnectionState): void {
    this.connectionState = state;
    this.notifyStateListeners();
  }

  private notifyStateListeners(): void {
    this.stateListeners.forEach((listener) => listener());
  }

  private notifyError(error: WebSocketError): void {
    this.errorListeners.forEach((listener) => listener(error));
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

  getReconnectAttempts(): number {
    return this.reconnectAttempts;
  }

  // Subscribe to state changes (for useSyncExternalStore)
  subscribeToState(listener: StateListener): () => void {
    this.stateListeners.add(listener);

    // Auto-connect when first subscriber
    if (this.stateListeners.size === 1 && !this.ws && !this.isConnecting) {
      void this.connect();
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

  // Subscribe to errors
  subscribeToErrors(listener: ErrorListener): () => void {
    this.errorListeners.add(listener);
    return () => {
      this.errorListeners.delete(listener);
    };
  }

  // Clear cached URL/key (useful if settings change)
  clearCache(): void {
    this.cachedUrl = null;
    this.cachedApiKey = null;
  }

  // Reset connection state (useful after changing settings)
  reset(): void {
    this.disconnect();
    this.clearCache();
    this.wasConnected = false;
    this.reconnectAttempts = 0;
  }
}

// Create singleton instance
const wsManager = new WebSocketManager();

// ============================================================================
// Hook Implementation
// ============================================================================

export function useWebSocket(): UseWebSocketReturn {
  const updateStatus = useSessionStore((state) => state.updateStatus);
  const hasShownReconnectToast = useRef(false);

  // Use useSyncExternalStore for connection state (no re-render loops)
  const connectionState = useSyncExternalStore(
    (callback) => wsManager.subscribeToState(callback),
    () => wsManager.getConnectionState(),
    () => 'disconnected' as ConnectionState // Server snapshot
  );

  // Track last message with local state
  const [lastMessage, setLastMessage] = useState<IncomingMessage | null>(null);

  // Subscribe to error events and show toasts
  useEffect(() => {
    return wsManager.subscribeToErrors((error) => {
      switch (error.type) {
        case 'connection_failed':
          toast.error('Connection Failed', error.message);
          break;
        case 'max_reconnects':
          toast.error('Connection Lost', error.message);
          hasShownReconnectToast.current = false;
          break;
        case 'reconnecting':
          if (error.message === 'Connection restored') {
            toast.success('Connected', 'Connection to server restored');
            hasShownReconnectToast.current = false;
          } else if (!hasShownReconnectToast.current) {
            toast.warning('Reconnecting', error.message);
            hasShownReconnectToast.current = true;
          }
          break;
      }
    });
  }, []);

  // Subscribe to messages and update store
  useEffect(() => {
    return wsManager.subscribeToMessages((message) => {
      setLastMessage(message);

      // Handle session:status - update store with new status
      if (isSessionStatusMessage(message)) {
        const { sessionId, newStatus } = message.payload;
        updateStatus(sessionId, newStatus as SessionStatus);
      }

      // Handle session:waiting - update store to paused status when waiting
      if (isSessionWaitingMessage(message)) {
        const { sessionId, waiting } = message.payload;
        if (waiting) {
          updateStatus(sessionId, 'paused');
        }
      }
    });
  }, [updateStatus]);

  // Stable callbacks that delegate to the manager
  const connect = useCallback(() => {
    void wsManager.connect();
  }, []);

  const disconnect = useCallback(() => {
    wsManager.disconnect();
  }, []);

  return { connectionState, lastMessage, connect, disconnect };
}

// Export manager for direct access if needed (e.g., clearing cache on settings change)
export { wsManager };
