/**
 * API Types for Desktop App
 * Types matching the server API responses and web app conventions
 */

// ============================================================================
// Project Types
// ============================================================================

export interface Project {
  id: string;
  name: string;
  repo_path: string;
  tickets_path: string | null;
  handoff_path: string | null;
  tmux_session: string;
  tmux_window: string | null;
  created_at: string;
  updated_at: string;
}

// ============================================================================
// Pagination Types
// ============================================================================

export interface PaginatedResponse<T> {
  data: T[];
  pagination: {
    page: number;
    limit: number;
    total: number;
    total_pages: number;
  };
}

// ============================================================================
// Session Types
// ============================================================================

export type SessionStatus = 'running' | 'paused' | 'completed' | 'error';
export type SessionType = 'ticket' | 'adhoc';

export interface Session {
  id: string;
  project_id: string;
  ticket_id: string | null;
  type: SessionType;
  status: SessionStatus;
  context_percent: number | null;
  pane_id: string;
  started_at: string | null;
  ended_at: string | null;
  created_at: string;
  updated_at: string;
  project?: {
    id: string;
    name: string;
  } | null;
  ticket?: {
    id: string;
    external_id: string | null;
    title: string;
  } | null;
}

// ============================================================================
// WebSocket Message Types (aligned with web app)
// ============================================================================

export interface WebSocketMessage {
  type: string;
  payload: unknown;
}

/** Session status changed (running → completed, etc) */
export interface SessionStatusMessage {
  type: 'session:status';
  payload: {
    sessionId: string;
    previousStatus: string;
    newStatus: SessionStatus;
    timestamp: string;
    error?: string;
  };
}

/** Session waiting for user input */
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

/** Legacy status payload format (for backwards compatibility) */
export interface SessionStatusPayload {
  session_id: string;
  status: SessionStatus;
  context_percent?: number;
}

/** Union of all incoming WebSocket message types */
export type IncomingMessage =
  | SessionStatusMessage
  | SessionWaitingMessage
  | WebSocketMessage;
