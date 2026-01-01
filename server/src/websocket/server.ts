/**
 * WebSocket Server
 * Real-time communication for Claude Session Manager
 */

import { WebSocketServer, WebSocket, RawData } from 'ws';
import type { Server as HttpServer, IncomingMessage } from 'http';
import { env } from '../config/env.js';
import { isLocalhostAddress } from '../middleware/api-key-auth.js';
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
  type AiAnalysisStatusMessage,
  type AiAnalysisType,
  type AiAnalysisStatus,
  type ReviewResultMessage,
  type ReviewDecisionType,
  type ReviewTriggerType,
  type ErrorMessage,
  type SubscribedMessage,
  type UnsubscribedMessage,
  type PongMessage,
  type PtyAttachedMessage,
  type PtyDetachedMessage,
  type PtyOutputMessage,
  type PtyExitMessage,
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
import { prisma } from '../config/db.js';
import { notificationService } from '../services/notification-service.js';
import {
  ptyManager,
  PtySessionNotFoundError,
  PtyInvalidPaneError,
  PtyAlreadyAttachedError,
  PtyNotAttachedError,
  type PtyDataEvent,
  type PtyExitEvent,
} from '../services/pty-manager.js';

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
    // eslint-disable-next-line @typescript-eslint/unbound-method
    sessionSupervisor.removeListener('session:output', this.handleSessionOutput);
    // eslint-disable-next-line @typescript-eslint/unbound-method
    sessionSupervisor.removeListener('session:stateChange', this.handleSessionStateChange);
    // eslint-disable-next-line @typescript-eslint/unbound-method
    waitingDetector.removeListener('waiting:stateChange', this.handleWaitingStateChange);
    // eslint-disable-next-line @typescript-eslint/unbound-method
    ticketStateMachine.removeListener('ticket:stateChange', this.handleTicketStateChange);
    // eslint-disable-next-line @typescript-eslint/unbound-method
    ptyManager.removeListener('pty:data', this.handlePtyData);
    // eslint-disable-next-line @typescript-eslint/unbound-method
    ptyManager.removeListener('pty:exit', this.handlePtyExit);

    // Detach all PTY connections
    ptyManager.detachAll();

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

    this.wss.on('connection', (ws: WebSocket, request: IncomingMessage) => {
      this.handleConnection(ws as ExtendedWebSocket, request);
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
    this.handlePtyData = this.handlePtyData.bind(this);
    this.handlePtyExit = this.handlePtyExit.bind(this);

    // eslint-disable-next-line @typescript-eslint/unbound-method
    sessionSupervisor.on('session:output', this.handleSessionOutput);
    // eslint-disable-next-line @typescript-eslint/unbound-method
    sessionSupervisor.on('session:stateChange', this.handleSessionStateChange);
    // eslint-disable-next-line @typescript-eslint/unbound-method
    waitingDetector.on('waiting:stateChange', this.handleWaitingStateChange);
    // eslint-disable-next-line @typescript-eslint/unbound-method
    ticketStateMachine.on('ticket:stateChange', this.handleTicketStateChange);
    // eslint-disable-next-line @typescript-eslint/unbound-method
    ptyManager.on('pty:data', this.handlePtyData);
    // eslint-disable-next-line @typescript-eslint/unbound-method
    ptyManager.on('pty:exit', this.handlePtyExit);
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
  private handleConnection(ws: ExtendedWebSocket, request: IncomingMessage): void {
    // Validate API key if configured (skip for localhost connections)
    if (env.API_KEY) {
      const remoteAddress = request.socket.remoteAddress;
      const isLocal = isLocalhostAddress(remoteAddress);

      if (!isLocal) {
        // eslint-disable-next-line no-undef
        const url = new URL(request.url ?? '', `http://${request.headers.host}`);
        const apiKey = url.searchParams.get('apiKey');

        if (!apiKey || apiKey !== env.API_KEY) {
          ws.close(4001, 'Unauthorized: Invalid or missing API key');
          return;
        }
      }
    }

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

    // Detach PTY if attached
    if (ptyManager.isAttached(id)) {
      ptyManager.detach(id);
    }

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
    console.log(`[WebSocket] handleMessage called, data length: ${Buffer.isBuffer(data) ? data.length : String(data).length}`);
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
      // Convert RawData (Buffer/ArrayBuffer) to string for JSON parsing
      // eslint-disable-next-line @typescript-eslint/no-base-to-string
      const dataStr = Buffer.isBuffer(data) ? data.toString('utf8') : String(data);
      const raw = JSON.parse(dataStr) as unknown;
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
    console.log(`[WebSocket] Received message type: ${message.type}`, message.payload);
    switch (message.type) {
      case 'session:subscribe':
        void this.handleSubscribe(ws, message.payload.sessionId);
        break;
      case 'session:unsubscribe':
        this.handleUnsubscribe(ws, message.payload.sessionId);
        break;
      case 'session:input':
        this.handleInput(ws, message.payload.sessionId, message.payload.text);
        break;
      case 'session:keys':
        this.handleKeys(ws, message.payload.sessionId, message.payload.keys);
        break;
      case 'ping':
        this.handlePing(ws);
        break;
      case 'pty:attach':
        this.handlePtyAttach(ws, message.payload.sessionId, message.payload.cols, message.payload.rows);
        break;
      case 'pty:detach':
        this.handlePtyDetach(ws, message.payload.sessionId);
        break;
      case 'pty:data':
        this.handlePtyInput(ws, message.payload.sessionId, message.payload.data);
        break;
      case 'pty:resize':
        this.handlePtyResize(ws, message.payload.sessionId, message.payload.cols, message.payload.rows);
        break;
      case 'pty:selectPane':
        this.handlePtySelectPane(ws, message.payload.sessionId);
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
  private async handleSubscribe(ws: ExtendedWebSocket, sessionId: string): Promise<void> {
    console.log(`[WebSocket] handleSubscribe called for session ${sessionId}`);
    // Check if session exists (in-memory or database)
    const activeSession = sessionSupervisor.getActiveSession(sessionId);
    console.log(`[WebSocket] Active session in memory: ${activeSession ? 'found' : 'not found'}`);
    if (!activeSession) {
      // Fall back to database check
      try {
        await sessionSupervisor.getSession(sessionId);
        console.log(`[WebSocket] Session found in database`);
      } catch (err) {
        console.error(`[WebSocket] Session not found in database:`, err);
        this.sendError(ws, WS_ERROR_CODES.SESSION_NOT_FOUND, `Session not found: ${sessionId}`);
        return;
      }
    }

    // Add to subscriptions
    if (!this.sessionSubscriptions.has(sessionId)) {
      this.sessionSubscriptions.set(sessionId, new Set());
    }
    this.sessionSubscriptions.get(sessionId)!.add(ws);
    ws.connectionInfo.subscribedSessions.add(sessionId);

    // Get current output from session buffer if available
    let bufferLines: string[] = [];
    if (activeSession) {
      try {
        bufferLines = sessionSupervisor.getSessionOutput(sessionId, 100);
      } catch {
        // Ignore - session might have ended
      }
    }

    // Send confirmation with current output
    const response: SubscribedMessage = {
      type: 'subscribed',
      payload: {
        sessionId,
        bufferLines,
      },
    };
    this.send(ws, response);

    // Also send as session:output so terminal displays it
    if (bufferLines.length > 0) {
      const outputMsg: SessionOutputMessage = {
        type: 'session:output',
        payload: {
          sessionId,
          lines: bufferLines,
          raw: true,
        },
      };
      this.send(ws, outputMsg);
    }

    console.log(`Connection ${ws.connectionInfo.id} subscribed to session ${sessionId}, sent ${bufferLines.length} buffered lines`);
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
   * Handle raw keys to session (for real-time terminal input)
   */
  private handleKeys(ws: ExtendedWebSocket, sessionId: string, keys: string): void {
    // Check if subscribed
    if (!ws.connectionInfo.subscribedSessions.has(sessionId)) {
      this.sendError(ws, WS_ERROR_CODES.NOT_SUBSCRIBED, 'Not subscribed to this session');
      return;
    }

    // Send raw keys to session (for terminal input)
    sessionSupervisor
      .sendRawKeys(sessionId, keys)
      .then(() => {
        // Keys sent successfully - no response needed
      })
      .catch((error: unknown) => {
        if (error instanceof SessionNotFoundError) {
          this.sendError(ws, WS_ERROR_CODES.SESSION_NOT_FOUND, error.message);
        } else if (error instanceof SessionInputError) {
          this.sendError(ws, WS_ERROR_CODES.INPUT_FAILED, error.message);
        } else {
          this.sendError(ws, WS_ERROR_CODES.INTERNAL_ERROR, 'Failed to send keys');
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
  // PTY Message Handlers
  // ==========================================================================

  /**
   * Handle PTY attach request
   */
  private handlePtyAttach(
    ws: ExtendedWebSocket,
    sessionId: string,
    cols?: number,
    rows?: number
  ): void {
    const connectionId = ws.connectionInfo.id;
    console.log(`[WebSocket] handlePtyAttach called: session=${sessionId}, cols=${cols}, rows=${rows}`);

    // Check if PTY is available on this system
    if (!ptyManager.isAvailable()) {
      console.log(`[WebSocket] PTY not available, reason: ${ptyManager.getUnavailableReason()}`);
      const reason = ptyManager.getUnavailableReason() ?? 'PTY not available';
      this.sendError(ws, WS_ERROR_CODES.PTY_ATTACH_FAILED,
        `PTY not available on this system: ${reason}. ` +
        'This often happens when Node.js runs under Rosetta on Apple Silicon. ' +
        'Please use ARM-native Node.js or use the legacy input method.'
      );
      return;
    }

    // Build options object conditionally for exactOptionalPropertyTypes
    const options: { cols?: number; rows?: number } = {};
    if (cols !== undefined) {
      options.cols = cols;
    }
    if (rows !== undefined) {
      options.rows = rows;
    }

    ptyManager
      .attach(connectionId, sessionId, options)
      .then((connection) => {
        // Also subscribe to session updates
        if (!this.sessionSubscriptions.has(sessionId)) {
          this.sessionSubscriptions.set(sessionId, new Set());
        }
        this.sessionSubscriptions.get(sessionId)!.add(ws);
        ws.connectionInfo.subscribedSessions.add(sessionId);

        // Send confirmation
        const response: PtyAttachedMessage = {
          type: 'pty:attached',
          payload: {
            sessionId,
            cols: connection.cols,
            rows: connection.rows,
          },
        };
        this.send(ws, response);

        console.log(`[WebSocket] PTY attached: connection ${connectionId} to session ${sessionId}`);
      })
      .catch((error: unknown) => {
        console.error(`[WebSocket] PTY attach failed for session ${sessionId}:`, error);
        if (error instanceof PtySessionNotFoundError) {
          this.sendError(ws, WS_ERROR_CODES.SESSION_NOT_FOUND, error.message);
        } else if (error instanceof PtyInvalidPaneError) {
          this.sendError(ws, WS_ERROR_CODES.PTY_INVALID_PANE, error.message);
        } else if (error instanceof PtyAlreadyAttachedError) {
          this.sendError(ws, WS_ERROR_CODES.PTY_ALREADY_ATTACHED, error.message);
        } else {
          const message = error instanceof Error ? error.message : 'Unknown error';
          this.sendError(ws, WS_ERROR_CODES.PTY_ATTACH_FAILED, `Failed to attach PTY: ${message}`);
        }
      });
  }

  /**
   * Handle PTY detach request
   */
  private handlePtyDetach(ws: ExtendedWebSocket, sessionId: string): void {
    const connectionId = ws.connectionInfo.id;

    // Detach from PTY
    ptyManager.detach(connectionId);

    // Send confirmation
    const response: PtyDetachedMessage = {
      type: 'pty:detached',
      payload: { sessionId },
    };
    this.send(ws, response);

    console.log(`[WebSocket] PTY detached: connection ${connectionId} from session ${sessionId}`);
  }

  /**
   * Handle PTY input (data from client terminal)
   */
  private handlePtyInput(ws: ExtendedWebSocket, sessionId: string, data: string): void {
    const connectionId = ws.connectionInfo.id;

    try {
      ptyManager.write(connectionId, data);
    } catch (error) {
      if (error instanceof PtyNotAttachedError) {
        this.sendError(ws, WS_ERROR_CODES.PTY_NOT_ATTACHED, error.message);
      } else {
        this.sendError(ws, WS_ERROR_CODES.INTERNAL_ERROR, 'Failed to send data to PTY');
      }
    }
  }

  /**
   * Handle PTY resize request
   * Resizes the node-pty process - tmux handles client sizing naturally
   */
  private handlePtyResize(
    ws: ExtendedWebSocket,
    sessionId: string,
    cols: number,
    rows: number
  ): void {
    const connectionId = ws.connectionInfo.id;

    try {
      ptyManager.resize(connectionId, cols, rows);
    } catch (error) {
      if (error instanceof PtyNotAttachedError) {
        this.sendError(ws, WS_ERROR_CODES.PTY_NOT_ATTACHED, error.message);
      } else {
        this.sendError(ws, WS_ERROR_CODES.INTERNAL_ERROR, 'Failed to resize PTY');
      }
    }
  }

  /**
   * Handle PTY select pane request - re-focus and zoom the session's tmux pane
   * Only zooms if not already zoomed (to avoid toggling off)
   */
  private handlePtySelectPane(ws: ExtendedWebSocket, sessionId: string): void {
    const connectionId = ws.connectionInfo.id;

    // Get the PTY connection to find the pane ID
    const connection = ptyManager.getConnection(connectionId);
    if (!connection) {
      this.sendError(ws, WS_ERROR_CODES.PTY_NOT_ATTACHED, 'Not attached to PTY');
      return;
    }

    const paneId = connection.paneId;
    const tmuxPath = process.env.TMUX_PATH ?? '/usr/local/bin/tmux';

    import('child_process').then(({ exec, execSync }) => {
      // First select the pane
      exec(`${tmuxPath} select-pane -t ${paneId}`, (selectError) => {
        if (selectError) {
          console.error(`[WebSocket] Failed to select pane ${paneId}:`, selectError);
          this.sendError(ws, WS_ERROR_CODES.INTERNAL_ERROR, 'Failed to select pane');
          return;
        }

        // Check if pane is already zoomed using window_zoomed_flag
        try {
          const zoomedFlag = execSync(
            `${tmuxPath} display-message -t ${paneId} -p '#{window_zoomed_flag}'`,
            { encoding: 'utf8', env: { ...process.env, TMUX: '' } }
          ).trim();

          // Only zoom if not already zoomed (flag is '0' when not zoomed)
          if (zoomedFlag !== '1') {
            exec(`${tmuxPath} resize-pane -Z -t ${paneId}`, (zoomError) => {
              if (zoomError) {
                console.error(`[WebSocket] Failed to zoom pane ${paneId}:`, zoomError);
              } else {
                console.log(`[WebSocket] Selected and zoomed pane ${paneId} for connection ${connectionId}`);
              }
            });
          } else {
            console.log(`[WebSocket] Selected pane ${paneId} (already zoomed) for connection ${connectionId}`);
          }
        } catch (checkError) {
          console.warn(`[WebSocket] Failed to check zoom state, zooming anyway:`, checkError);
          // Zoom anyway if we can't check the state
          exec(`${tmuxPath} resize-pane -Z -t ${paneId}`, () => {});
        }
      });
    }).catch((err) => {
      console.error('[WebSocket] Failed to import child_process:', err);
    });
  }

  // ==========================================================================
  // PTY Event Handlers
  // ==========================================================================

  /**
   * Handle PTY data event (output from terminal)
   */
  private handlePtyData(event: PtyDataEvent): void {
    const { connectionId, sessionId, data } = event;

    // Find the WebSocket connection
    const ws = this.connections.get(connectionId);
    if (!ws || ws.readyState !== WebSocket.OPEN) {
      return;
    }

    // Send PTY output to the client
    const message: PtyOutputMessage = {
      type: 'pty:output',
      payload: {
        sessionId,
        data,
      },
    };
    this.send(ws, message);
  }

  /**
   * Handle PTY exit event
   */
  private handlePtyExit(event: PtyExitEvent): void {
    const { connectionId, sessionId, exitCode } = event;

    // Find the WebSocket connection
    const ws = this.connections.get(connectionId);
    if (!ws || ws.readyState !== WebSocket.OPEN) {
      return;
    }

    // Send PTY exit notification
    const message: PtyExitMessage = {
      type: 'pty:exit',
      payload: {
        sessionId,
        exitCode,
      },
    };
    this.send(ws, message);
  }

  // ==========================================================================
  // Session Supervisor Event Handlers
  // ==========================================================================

  /**
   * Handle session output event
   * Note: PTY-attached connections receive pty:output instead, so we skip them here
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

    // Broadcast to session subscribers, but skip PTY-attached connections
    // (they get real-time output via pty:output instead)
    this.broadcastToSessionExceptPty(event.sessionId, message);
  }

  /**
   * Broadcast a message to session subscribers, excluding PTY-attached connections
   */
  private broadcastToSessionExceptPty(sessionId: string, message: ServerMessage): void {
    const subscribers = this.sessionSubscriptions.get(sessionId);
    if (!subscribers) {
      console.log(`[WebSocket] No subscribers for session ${sessionId}`);
      return;
    }

    const data = JSON.stringify(message);
    let sentCount = 0;
    let skippedPty = 0;

    for (const ws of subscribers) {
      // Skip connections that have PTY attached - they get pty:output instead
      if (ptyManager.isAttached(ws.connectionInfo.id)) {
        skippedPty++;
        continue;
      }
      if (ws.readyState === WebSocket.OPEN) {
        ws.send(data);
        sentCount++;
      }
    }

    if (skippedPty > 0) {
      console.log(`[WebSocket] Broadcast ${message.type} to ${sentCount} subscribers, skipped ${skippedPty} PTY connections`);
    }
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

    // Update notification state for this session
    this.updateSessionNotification(event).catch((err) => {
      console.error('Failed to update session notification:', err);
    });
  }

  /**
   * Update or remove notification for a session based on waiting state.
   * One notification per session - upsert when waiting, delete when working.
   */
  private async updateSessionNotification(event: WaitingStateEvent): Promise<void> {
    if (event.waiting) {
      // Session is waiting for input - upsert notification
      const reasonMap: Record<string, string> = {
        question: 'Claude asked a question',
        permission: 'Claude needs permission to proceed',
        prompt: 'Claude is waiting at a prompt',
        error: 'Claude encountered an error and needs guidance',
      };

      const reasonText = event.reason ? reasonMap[event.reason] || event.reason : 'User input required';

      await notificationService.notifyWaitingInput(event.sessionId, reasonText);
    } else {
      // Session is no longer waiting - remove the waiting_input notification
      await notificationService.deleteBySession(event.sessionId, 'waiting_input');
    }
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

    console.log(
      `[WebSocket] Broadcasting ticket:state - ${payload.ticketId} moved from ${payload.previousState} to ${payload.newState}`
    );
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
    if (!subscribers) {
      console.log(`[WebSocket] No subscribers for session ${sessionId}`);
      return;
    }

    const data = JSON.stringify(message);
    console.log(`[WebSocket] Broadcasting ${message.type} to ${subscribers.size} subscribers for session ${sessionId}`);

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

  /**
   * Send AI analysis status to all connections
   */
  sendAiAnalysisStatus(
    sessionId: string,
    analysisType: AiAnalysisType,
    status: AiAnalysisStatus,
    options?: {
      ticketId?: string;
      error?: string;
    }
  ): void {
    const payload: AiAnalysisStatusMessage['payload'] = {
      sessionId,
      analysisType,
      status,
      timestamp: new Date().toISOString(),
    };

    if (options?.ticketId) {
      payload.ticketId = options.ticketId;
    }

    if (options?.error) {
      payload.error = options.error;
    }

    this.broadcast({
      type: 'ai:analysis_status',
      payload,
    });
  }

  /**
   * Send review result to all connections
   */
  sendReviewResult(
    sessionId: string,
    ticketId: string,
    trigger: ReviewTriggerType,
    decision: ReviewDecisionType,
    reasoning: string
  ): void {
    const message: ReviewResultMessage = {
      type: 'review:result',
      payload: {
        sessionId,
        ticketId,
        trigger,
        decision,
        reasoning,
        timestamp: new Date().toISOString(),
      },
    };

    this.broadcast(message);
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
