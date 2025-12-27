/**
 * WebSocket Types
 * Type definitions for WebSocket messages and events
 */

import { z } from 'zod';
import type { SessionStatus } from '../generated/prisma/index.js';

// ============================================================================
// Message Schemas (Zod validation)
// ============================================================================

/**
 * Base WebSocket message schema
 */
export const baseMessageSchema = z.object({
  type: z.string(),
  payload: z.unknown(),
});

/**
 * Subscribe to a session's updates
 */
export const subscribeMessageSchema = z.object({
  type: z.literal('session:subscribe'),
  payload: z.object({
    sessionId: z.string().uuid(),
  }),
});

/**
 * Unsubscribe from a session's updates
 */
export const unsubscribeMessageSchema = z.object({
  type: z.literal('session:unsubscribe'),
  payload: z.object({
    sessionId: z.string().uuid(),
  }),
});

/**
 * Send input to a session
 */
export const inputMessageSchema = z.object({
  type: z.literal('session:input'),
  payload: z.object({
    sessionId: z.string().uuid(),
    text: z.string().max(10000),
  }),
});

/**
 * Ping message for heartbeat
 */
export const pingMessageSchema = z.object({
  type: z.literal('ping'),
  payload: z.object({}).optional(),
});

/**
 * Union of all valid client message schemas
 */
export const clientMessageSchema = z.discriminatedUnion('type', [
  subscribeMessageSchema,
  unsubscribeMessageSchema,
  inputMessageSchema,
  pingMessageSchema,
]);

// ============================================================================
// Client -> Server Message Types
// ============================================================================

export type SubscribeMessage = z.infer<typeof subscribeMessageSchema>;
export type UnsubscribeMessage = z.infer<typeof unsubscribeMessageSchema>;
export type InputMessage = z.infer<typeof inputMessageSchema>;
export type PingMessage = z.infer<typeof pingMessageSchema>;
export type ClientMessage = z.infer<typeof clientMessageSchema>;

// ============================================================================
// Server -> Client Message Types
// ============================================================================

/**
 * Session output message - chunked Claude output
 */
export interface SessionOutputMessage {
  type: 'session:output';
  payload: {
    sessionId: string;
    lines: string[];
    raw: boolean;
  };
}

/**
 * Session context update message
 */
export interface SessionContextMessage {
  type: 'session:context';
  payload: {
    sessionId: string;
    contextPercent: number;
  };
}

/**
 * Session status change message
 */
export interface SessionStatusMessage {
  type: 'session:status';
  payload: {
    sessionId: string;
    previousStatus: SessionStatus;
    newStatus: SessionStatus;
    timestamp: string;
    error?: string;
  };
}

/**
 * Why Claude is waiting for input
 */
export type WaitingReason =
  | 'permission_prompt'
  | 'idle_prompt'
  | 'question'
  | 'context_exhausted'
  | 'stopped'
  | 'unknown';

/**
 * Source layer that detected the waiting state
 */
export type DetectionLayer = 'hook' | 'jsonl' | 'output_pattern';

/**
 * Session waiting for input message
 */
export interface SessionWaitingMessage {
  type: 'session:waiting';
  payload: {
    sessionId: string;
    waiting: boolean;
    reason?: WaitingReason;
    detectedBy?: DetectionLayer;
    timestamp: string;
  };
}

/**
 * Trigger types for ticket state changes
 */
export type TicketTransitionTrigger = 'auto' | 'manual';

/**
 * Reason types for ticket state changes
 */
export type TicketTransitionReason =
  | 'session_started'
  | 'completion_detected'
  | 'user_approved'
  | 'user_rejected';

/**
 * Ticket state change message
 */
export interface TicketStateMessage {
  type: 'ticket:state';
  payload: {
    ticketId: string;
    previousState: string;
    newState: string;
    trigger: TicketTransitionTrigger;
    reason: TicketTransitionReason;
    timestamp: string;
    feedback?: string;
    triggeredBy?: string;
  };
}

/**
 * Notification message
 */
export interface NotificationMessage {
  type: 'notification';
  payload: {
    id: string;
    title: string;
    body: string;
    timestamp: string;
  };
}

/**
 * Pong response to ping
 */
export interface PongMessage {
  type: 'pong';
  payload: {
    timestamp: string;
  };
}

/**
 * Error message
 */
export interface ErrorMessage {
  type: 'error';
  payload: {
    code: string;
    message: string;
    details?: Record<string, unknown>;
  };
}

/**
 * Subscription confirmed message
 */
export interface SubscribedMessage {
  type: 'subscribed';
  payload: {
    sessionId: string;
    bufferLines: string[];
  };
}

/**
 * Unsubscription confirmed message
 */
export interface UnsubscribedMessage {
  type: 'unsubscribed';
  payload: {
    sessionId: string;
  };
}

/**
 * Union of all server messages
 */
export type ServerMessage =
  | SessionOutputMessage
  | SessionContextMessage
  | SessionStatusMessage
  | SessionWaitingMessage
  | TicketStateMessage
  | NotificationMessage
  | PongMessage
  | ErrorMessage
  | SubscribedMessage
  | UnsubscribedMessage;

// ============================================================================
// Connection Types
// ============================================================================

/**
 * WebSocket connection metadata
 */
export interface ConnectionInfo {
  /** Unique connection ID */
  id: string;
  /** Sessions this connection is subscribed to */
  subscribedSessions: Set<string>;
  /** Last activity timestamp */
  lastActivity: Date;
  /** Whether the connection is alive (ping/pong) */
  isAlive: boolean;
}

// ============================================================================
// Error Codes
// ============================================================================

export const WS_ERROR_CODES = {
  INVALID_MESSAGE: 'INVALID_MESSAGE',
  PARSE_ERROR: 'PARSE_ERROR',
  SESSION_NOT_FOUND: 'SESSION_NOT_FOUND',
  NOT_SUBSCRIBED: 'NOT_SUBSCRIBED',
  INPUT_FAILED: 'INPUT_FAILED',
  RATE_LIMITED: 'RATE_LIMITED',
  INTERNAL_ERROR: 'INTERNAL_ERROR',
} as const;

export type WsErrorCode = (typeof WS_ERROR_CODES)[keyof typeof WS_ERROR_CODES];

// ============================================================================
// Configuration
// ============================================================================

export interface WebSocketServerConfig {
  /** Ping interval in milliseconds (default: 30000) */
  pingInterval: number;
  /** Connection timeout in milliseconds (default: 60000) */
  connectionTimeout: number;
  /** Maximum message size in bytes (default: 65536) */
  maxMessageSize: number;
  /** Rate limit: max messages per window (default: 100) */
  rateLimitMaxMessages: number;
  /** Rate limit: window in milliseconds (default: 10000) */
  rateLimitWindow: number;
  /** Number of buffered output lines to send on subscribe (default: 100) */
  outputBufferLines: number;
}

export const DEFAULT_WS_CONFIG: WebSocketServerConfig = {
  pingInterval: 30_000,
  connectionTimeout: 60_000,
  maxMessageSize: 65_536,
  rateLimitMaxMessages: 100,
  rateLimitWindow: 10_000,
  outputBufferLines: 100,
};
