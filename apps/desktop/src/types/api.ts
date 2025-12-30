/**
 * API Types for Desktop App
 * Types matching the server API responses
 */

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

export interface WebSocketMessage {
  type: string;
  payload: unknown;
}

export interface SessionStatusPayload {
  session_id: string;
  status: SessionStatus;
  context_percent?: number;
}
