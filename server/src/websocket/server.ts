/**
 * WebSocket Server
 * Real-time communication for Claude Session Manager
 */

import { WebSocketServer, WebSocket, RawData } from 'ws';
import type { Server as HttpServer } from 'http';
import { v4 as uuid } from 'uuid';
import { ZodError } from 'zod';
import {
  clientMessageSchema,
  type ClientMessage,
  type ServerMessage,
  type ConnectionInfo,
  type SessionOutputMessage,
  type SessionStatusMessage,
  type SessionWaitingMessage,
  type TicketStateMessage,
  type TicketTransitionTrigger,
  type TicketTransitionReason,
  type ErrorMessage,
  type SubscribedMessage,
  type UnsubscribedMessage,
  type PongMessage,
  type WebSocketServerConfig,
  DEFAULT_WS_CONFIG,
  WS_ERROR_CODES,
} from './types.js';
import {
  sessionSupervisor,
  SessionNotFoundError,
  SessionInputError,
  type SessionOutputEvent,
  type SessionStateChangeEvent,
} from '../services/session-supervisor.js';
import { waitingDetector, type WaitingStateEvent } from '../services/waiting-detector.js';
import {
  ticketStateMachine,
  type TicketStateChangeEvent,
} from '../services/ticket-state-machine.js';

// ============================================================================
// Extended WebSocket Type
// ============================================================================

/**
 * Extended WebSocket with connection metadata
 */
interface ExtendedWebSocket extends WebSocket {
  connectionInfo: ConnectionInfo;
  rateLimitCounter: number;
  rateLimitWindowStart: number;
}

// ============================================================================
// WebSocket Manager Class
// ============================================================================

/**
 * Manages WebSocket connections and message routing
 */
export class WebSocketManager {
  /** Underlying WebSocket server */
  private wss: WebSocketServer | null = null;

  /** Map of session ID to subscribed connections */
  private sessionSubscriptions: Map<string, Set<ExtendedWebSocket>> = new Map();

  /** Map of connection ID to WebSocket */
  private connections: Map<string, ExtendedWebSocket> = new Map();

  /** Ping interval handle */
  private pingInterval: ReturnType<typeof setInterval> | null = null;

  /** Configuration */
  private config: WebSocketServerConfig;

  constructor(config: Partial<WebSocketServerConfig> = {}) {
    this.config = { ...DEFAULT_WS_CONFIG, ...config };
  }

  // ==========================================================================
  // Lifecycle Methods
  // ==========================================================================

  /**
   * Attach WebSocket server to an HTTP server
   */
  attach(httpServer: HttpServer): WebSocketServer {
    this.wss = new WebSocketServer({
      server: httpServer,
      maxPayload: this.config.maxMessageSize,
    });

    this.setupServer();
    this.setupSessionSupervisorListeners();
    this.startPingInterval();

    return this.wss;
  }

  /**
   * Close the WebSocket server
   */
  close(): void {
    if (this.pingInterval) {
      clearInterval(this.pingInterval);
      this.pingInterval = null;
    }

    // Remove session supervisor and waiting detector listeners
    sessionSupervisor.removeListener('session:output', this.handleSessionOutput);
    sessionSupervisor.removeListener('session:stateChange', this.handleSessionStateChange);
    waitingDetector.removeListener('waiting:stateChange', this.handleWaitingStateChange);
    ticketStateMachine.removeListener('ticket:stateChange', this.handleTicketStateChange);

    // Close all connections
    for (const ws of this.connections.values()) {
      ws.close(1001, 'Server shutting down');
    }

    this.connections.clear();
    this.sessionSubscriptions.clear();

    if (this.wss) {
      this.wss.close();
      this.wss = null;
    }
  }

  /**
   * Get connection count
   */
  getConnectionCount(): number {
    return this.connections.size;
  }

  /**
   * Get subscriber count for a session
   */
  getSessionSubscriberCount(sessionId: string): number {
    return this.sessionSubscriptions.get(sessionId)?.size ?? 0;
  }

  // ==========================================================================
  // Server Setup
  // ==========================================================================

  /**
   * Setup WebSocket server event handlers
   */
  private setupServer(): void {
    if (!this.wss) return;

    this.wss.on('connection', (ws: WebSocket) => {
      this.handleConnection(ws as ExtendedWebSocket);
    });

    this.wss.on('error', (error: Error) => {
      console.error('WebSocket server error:', error);
    });
  }

  /**
   * Setup listeners for session supervisor events
   */
  private setupSessionSupervisorListeners(): void {
    // Bind handlers to preserve 'this' context
    this.handleSessionOutput = this.handleSessionOutput.bind(this);
    this.handleSessionStateChange = this.handleSessionStateChange.bind(this);
    this.handleWaitingStateChange = this.handleWaitingStateChange.bind(this);
    this.handleTicketStateChange = this.handleTicketStateChange.bind(this);

    sessionSupervisor.on('session:output', this.handleSessionOutput);
    sessionSupervisor.on('session:stateChange', this.handleSessionStateChange);
    waitingDetector.on('waiting:stateChange', this.handleWaitingStateChange);
    ticketStateMachine.on('ticket:stateChange', this.handleTicketStateChange);
  }

  /**
   * Start ping/pong interval for connection health
   */
  private startPingInterval(): void {
    this.pingInterval = setInterval(() => {
      for (const ws of this.connections.values()) {
        if (!ws.connectionInfo.isAlive) {
          // Connection failed to respond to ping
          ws.terminate();
          this.handleDisconnect(ws);
          continue;
        }

        ws.connectionInfo.isAlive = false;
        ws.ping();
      }
    }, this.config.pingInterval);
  }

  // ==========================================================================
  // Connection Handling
  // ==========================================================================

  /**
   * Handle new connection
   */
  private handleConnection(ws: ExtendedWebSocket): void {
    const connectionId = uuid();

    // Initialize connection metadata
    ws.connectionInfo = {
      id: connectionId,
      subscribedSessions: new Set(),
      lastActivity: new Date(),
      isAlive: true,
    };
    ws.rateLimitCounter = 0;
    ws.rateLimitWindowStart = Date.now();

    // Store connection
    this.connections.set(connectionId, ws);

    // Setup event handlers
    ws.on('message', (data: RawData) => {
      this.handleMessage(ws, data);
    });

    ws.on('close', () => {
      this.handleDisconnect(ws);
    });

    ws.on('error', (error: Error) => {
      console.error(`WebSocket error for connection ${connectionId}:`, error);
    });

    ws.on('pong', () => {
      ws.connectionInfo.isAlive = true;
      ws.connectionInfo.lastActivity = new Date();
    });

    console.log(`WebSocket connection established: ${connectionId}`);
  }

  /**
   * Handle connection disconnect
   */
  private handleDisconnect(ws: ExtendedWebSocket): void {
    const { id, subscribedSessions } = ws.connectionInfo;

    // Remove from all session subscriptions
    for (const sessionId of subscribedSessions) {
      const subscribers = this.sessionSubscriptions.get(sessionId);
      if (subscribers) {
        subscribers.delete(ws);
        if (subscribers.size === 0) {
          this.sessionSubscriptions.delete(sessionId);
        }
      }
    }

    // Remove from connections
    this.connections.delete(id);

    console.log(`WebSocket connection closed: ${id}`);
  }

  // ==========================================================================
  // Message Handling
  // ==========================================================================

  /**
   * Handle incoming message
   */
  private handleMessage(ws: ExtendedWebSocket, data: RawData): void {
    // Update activity
    ws.connectionInfo.lastActivity = new Date();
    ws.connectionInfo.isAlive = true;

    // Rate limiting
    if (!this.checkRateLimit(ws)) {
      this.sendError(ws, WS_ERROR_CODES.RATE_LIMITED, 'Too many messages, please slow down');
      return;
    }

    // Parse message
    let message: ClientMessage;
    try {
      const raw = JSON.parse(data.toString()) as unknown;
      message = clientMessageSchema.parse(raw);
    } catch (error) {
      if (error instanceof ZodError) {
        this.sendError(ws, WS_ERROR_CODES.INVALID_MESSAGE, 'Invalid message format', {
          issues: error.issues,
        });
      } else if (error instanceof SyntaxError) {
        this.sendError(ws, WS_ERROR_CODES.PARSE_ERROR, 'Invalid JSON');
      } else {
        this.sendError(ws, WS_ERROR_CODES.INTERNAL_ERROR, 'Failed to process message');
      }
      return;
    }

    // Route message to handler
    switch (message.type) {
      case 'session:subscribe':
        this.handleSubscribe(ws, message.payload.sessionId);
        break;
      case 'session:unsubscribe':
        this.handleUnsubscribe(ws, message.payload.sessionId);
        break;
      case 'session:input':
        this.handleInput(ws, message.payload.sessionId, message.payload.text);
        break;
      case 'ping':
        this.handlePing(ws);
        break;
    }
  }

  /**
   * Check rate limit for connection
   */
  private checkRateLimit(ws: ExtendedWebSocket): boolean {
    const now = Date.now();

    // Reset window if expired
    if (now - ws.rateLimitWindowStart > this.config.rateLimitWindow) {
      ws.rateLimitCounter = 0;
      ws.rateLimitWindowStart = now;
    }

    ws.rateLimitCounter++;

    return ws.rateLimitCounter <= this.config.rateLimitMaxMessages;
  }

  /**
   * Handle subscribe to session
   */
  private handleSubscribe(ws: ExtendedWebSocket, sessionId: string): void {
    // Check if session exists
    const activeSession = sessionSupervisor.getActiveSession(sessionId);
    if (!activeSession) {
      this.sendError(ws, WS_ERROR_CODES.SESSION_NOT_FOUND, `Session not found: ${sessionId}`);
      return;
    }

    // Add to subscriptions
    if (!this.sessionSubscriptions.has(sessionId)) {
      this.sessionSubscriptions.set(sessionId, new Set());
    }
    this.sessionSubscriptions.get(sessionId)!.add(ws);
    ws.connectionInfo.subscribedSessions.add(sessionId);

    // Get buffered output
    let bufferLines: string[] = [];
    try {
      bufferLines = sessionSupervisor.getSessionOutput(sessionId, this.config.outputBufferLines);
    } catch {
      // Ignore errors - session might have ended
    }

    // Send confirmation with buffered output
    const response: SubscribedMessage = {
      type: 'subscribed',
      payload: {
        sessionId,
        bufferLines,
      },
    };
    this.send(ws, response);

    console.log(`Connection ${ws.connectionInfo.id} subscribed to session ${sessionId}`);
  }

  /**
   * Handle unsubscribe from session
   */
  private handleUnsubscribe(ws: ExtendedWebSocket, sessionId: string): void {
    // Remove from subscriptions
    const subscribers = this.sessionSubscriptions.get(sessionId);
    if (subscribers) {
      subscribers.delete(ws);
      if (subscribers.size === 0) {
        this.sessionSubscriptions.delete(sessionId);
      }
    }
    ws.connectionInfo.subscribedSessions.delete(sessionId);

    // Send confirmation
    const response: UnsubscribedMessage = {
      type: 'unsubscribed',
      payload: { sessionId },
    };
    this.send(ws, response);

    console.log(`Connection ${ws.connectionInfo.id} unsubscribed from session ${sessionId}`);
  }

  /**
   * Handle input to session
   */
  private handleInput(ws: ExtendedWebSocket, sessionId: string, text: string): void {
    // Check if subscribed
    if (!ws.connectionInfo.subscribedSessions.has(sessionId)) {
      this.sendError(ws, WS_ERROR_CODES.NOT_SUBSCRIBED, 'Not subscribed to this session');
      return;
    }

    // Send input to session
    sessionSupervisor
      .sendInput(sessionId, text)
      .then(() => {
        // Input sent successfully - no response needed
      })
      .catch((error: unknown) => {
        if (error instanceof SessionNotFoundError) {
          this.sendError(ws, WS_ERROR_CODES.SESSION_NOT_FOUND, error.message);
        } else if (error instanceof SessionInputError) {
          this.sendError(ws, WS_ERROR_CODES.INPUT_FAILED, error.message);
        } else {
          this.sendError(ws, WS_ERROR_CODES.INTERNAL_ERROR, 'Failed to send input');
        }
      });
  }

  /**
   * Handle ping message
   */
  private handlePing(ws: ExtendedWebSocket): void {
    const response: PongMessage = {
      type: 'pong',
      payload: {
        timestamp: new Date().toISOString(),
      },
    };
    this.send(ws, response);
  }

  // ==========================================================================
  // Session Supervisor Event Handlers
  // ==========================================================================

  /**
   * Handle session output event
   */
  private handleSessionOutput(event: SessionOutputEvent): void {
    const message: SessionOutputMessage = {
      type: 'session:output',
      payload: {
        sessionId: event.sessionId,
        lines: event.lines,
        raw: event.raw,
      },
    };

    this.broadcastToSession(event.sessionId, message);
  }

  /**
   * Handle session state change event
   */
  private handleSessionStateChange(event: SessionStateChangeEvent): void {
    const message: SessionStatusMessage = {
      type: 'session:status',
      payload: {
        sessionId: event.sessionId,
        previousStatus: event.previousStatus,
        newStatus: event.newStatus,
        timestamp: event.timestamp.toISOString(),
      },
    };

    if (event.error !== undefined) {
      message.payload.error = event.error;
    }

    this.broadcastToSession(event.sessionId, message);
  }

  /**
   * Handle waiting state change event from WaitingDetector
   */
  private handleWaitingStateChange(event: WaitingStateEvent): void {
    const payload: SessionWaitingMessage['payload'] = {
      sessionId: event.sessionId,
      waiting: event.waiting,
      timestamp: event.timestamp.toISOString(),
    };
    if (event.reason) {
      payload.reason = event.reason;
    }
    if (event.detectedBy) {
      payload.detectedBy = event.detectedBy;
    }

    const message: SessionWaitingMessage = {
      type: 'session:waiting',
      payload,
    };

    this.broadcastToSession(event.sessionId, message);
  }

  /**
   * Handle ticket state change event from TicketStateMachine
   */
  private handleTicketStateChange(event: TicketStateChangeEvent): void {
    const payload: TicketStateMessage['payload'] = {
      ticketId: event.ticketId,
      previousState: event.fromState,
      newState: event.toState,
      trigger: event.trigger as TicketTransitionTrigger,
      reason: event.reason as TicketTransitionReason,
      timestamp: event.timestamp.toISOString(),
    };

    if (event.feedback) {
      payload.feedback = event.feedback;
    }

    if (event.triggeredBy) {
      payload.triggeredBy = event.triggeredBy;
    }

    const message: TicketStateMessage = {
      type: 'ticket:state',
      payload,
    };

    this.broadcast(message);
  }

  // ==========================================================================
  // Sending Methods
  // ==========================================================================

  /**
   * Send a message to a connection
   */
  private send(ws: ExtendedWebSocket, message: ServerMessage): void {
    if (ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify(message));
    }
  }

  /**
   * Send an error message to a connection
   */
  private sendError(
    ws: ExtendedWebSocket,
    code: string,
    message: string,
    details?: Record<string, unknown>
  ): void {
    const errorMessage: ErrorMessage = {
      type: 'error',
      payload: { code, message },
    };
    if (details !== undefined) {
      errorMessage.payload.details = details;
    }
    this.send(ws, errorMessage);
  }

  /**
   * Broadcast a message to all subscribers of a session
   */
  private broadcastToSession(sessionId: string, message: ServerMessage): void {
    const subscribers = this.sessionSubscriptions.get(sessionId);
    if (!subscribers) return;

    const data = JSON.stringify(message);

    for (const ws of subscribers) {
      if (ws.readyState === WebSocket.OPEN) {
        ws.send(data);
      }
    }
  }

  /**
   * Broadcast a message to all connections
   */
  broadcast(message: ServerMessage): void {
    const data = JSON.stringify(message);

    for (const ws of this.connections.values()) {
      if (ws.readyState === WebSocket.OPEN) {
        ws.send(data);
      }
    }
  }

  /**
   * Send a notification to all connections
   */
  sendNotification(id: string, title: string, body: string): void {
    this.broadcast({
      type: 'notification',
      payload: {
        id,
        title,
        body,
        timestamp: new Date().toISOString(),
      },
    });
  }

  /**
   * Send a ticket state change to all connections
   */
  sendTicketStateChange(
    ticketId: string,
    previousState: string,
    newState: string,
    trigger: TicketTransitionTrigger,
    reason: TicketTransitionReason,
    options?: {
      feedback?: string;
      triggeredBy?: string;
    }
  ): void {
    const payload: TicketStateMessage['payload'] = {
      ticketId,
      previousState,
      newState,
      trigger,
      reason,
      timestamp: new Date().toISOString(),
    };

    if (options?.feedback) {
      payload.feedback = options.feedback;
    }

    if (options?.triggeredBy) {
      payload.triggeredBy = options.triggeredBy;
    }

    this.broadcast({
      type: 'ticket:state',
      payload,
    });
  }
}

// ============================================================================
// Singleton Instance
// ============================================================================

/** Default WebSocket manager instance */
export const wsManager = new WebSocketManager();

// ============================================================================
// Helper Function
// ============================================================================

/**
 * Attach WebSocket server to HTTP server (convenience function)
 */
export function attachWebSocket(httpServer: HttpServer): WebSocketServer {
  return wsManager.attach(httpServer);
}
