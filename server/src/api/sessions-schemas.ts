/**
 * Sessions API Zod Schemas
 * Validation schemas for session-related API endpoints
 */

import { z } from 'zod';
import type { SessionType, SessionStatus } from '../generated/prisma/index.js';

// ============================================================================
// Input Schemas
// ============================================================================

/**
 * Schema for session ID parameter
 */
export const sessionIdSchema = z.object({
  id: z.string().uuid('Invalid session ID format'),
});

/**
 * Schema for project ID parameter (for starting sessions)
 */
export const projectIdSchema = z.object({
  id: z.string().uuid('Invalid project ID format'),
});

/**
 * Schema for starting an ad-hoc session
 */
export const startSessionSchema = z.object({
  initial_prompt: z.string().min(1).max(10000).optional(),
  cwd: z.string().max(500).optional(),
});

/**
 * Schema for starting a ticket session
 */
export const startTicketSessionSchema = z.object({
  ticket_id: z.string().uuid('Invalid ticket ID format'),
  initial_prompt: z.string().min(1).max(10000).optional(),
  cwd: z.string().max(500).optional(),
});

/**
 * Schema for sending input to a session
 */
export const sendInputSchema = z.object({
  input: z.string().min(1).max(100000, 'Input too long'),
});

/**
 * Schema for sending tmux keys to a session (for mobile scroll controls, etc.)
 */
export const sendKeysSchema = z.object({
  keys: z.string().min(1).max(100, 'Keys string too long'),
});

/**
 * Schema for stop session options
 */
export const stopSessionSchema = z.object({
  force: z.boolean().optional().default(false),
});

/**
 * Schema for output query parameters
 */
export const outputQuerySchema = z.object({
  lines: z.coerce.number().int().min(1).max(10000).optional().default(100),
});

// ============================================================================
// Input Types
// ============================================================================

export type SessionIdInput = z.infer<typeof sessionIdSchema>;
export type ProjectIdInput = z.infer<typeof projectIdSchema>;
export type StartSessionInput = z.infer<typeof startSessionSchema>;
export type StartTicketSessionInput = z.infer<typeof startTicketSessionSchema>;
export type SendInputInput = z.infer<typeof sendInputSchema>;
export type SendKeysInput = z.infer<typeof sendKeysSchema>;
export type StopSessionInput = z.infer<typeof stopSessionSchema>;
export type OutputQueryInput = z.infer<typeof outputQuerySchema>;

// ============================================================================
// Response Types
// ============================================================================

/**
 * Session response format (snake_case for JSON)
 */
export interface SessionResponse {
  id: string;
  project_id: string;
  ticket_id: string | null;
  type: SessionType;
  status: SessionStatus;
  context_percent: number;
  pane_id: string;
  started_at: string | null;
  ended_at: string | null;
  created_at: string;
  updated_at: string;
}

/**
 * Session output response
 */
export interface SessionOutputResponse {
  session_id: string;
  lines: string[];
  total_lines: number;
}

/**
 * Error response format
 */
export interface ErrorResponse {
  error: string;
  details?: Record<string, string[]>;
}

/**
 * Success message response
 */
export interface MessageResponse {
  message: string;
}
