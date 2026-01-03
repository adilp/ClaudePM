/**
 * Adhoc Tickets API Zod Schemas
 * Validation schemas for adhoc ticket-related API endpoints
 */

import { z } from 'zod';
import type { TicketState } from '../generated/prisma/index.js';

// ============================================================================
// Input Schemas
// ============================================================================

/**
 * Schema for project ID parameter
 */
export const projectIdSchema = z.object({
  projectId: z.string().uuid('Invalid project ID format'),
});

/**
 * Schema for ticket ID parameter
 */
export const ticketIdSchema = z.object({
  ticketId: z.string().uuid('Invalid ticket ID format'),
});

/**
 * Schema for creating an adhoc ticket
 * - title: 3-100 characters
 * - slug: lowercase alphanumeric + hyphens, 3-50 characters
 */
export const createAdhocTicketSchema = z.object({
  title: z
    .string()
    .min(3, 'Title must be at least 3 characters')
    .max(100, 'Title must be at most 100 characters'),
  slug: z
    .string()
    .min(3, 'Slug must be at least 3 characters')
    .max(50, 'Slug must be at most 50 characters')
    .regex(
      /^[a-z0-9]+(?:-[a-z0-9]+)*$/,
      'Slug must be lowercase alphanumeric with hyphens (e.g., my-feature-name)'
    ),
  isExplore: z.boolean().optional().default(false),
});

/**
 * Schema for updating ticket content
 * - content: max 100000 characters
 */
export const updateTicketContentSchema = z.object({
  content: z
    .string()
    .max(100000, 'Content must be at most 100000 characters'),
});

/**
 * Schema for updating ticket title
 * - title: 3-100 characters
 */
export const updateTicketTitleSchema = z.object({
  title: z
    .string()
    .min(3, 'Title must be at least 3 characters')
    .max(100, 'Title must be at most 100 characters'),
});

// ============================================================================
// Input Types
// ============================================================================

export type ProjectIdInput = z.infer<typeof projectIdSchema>;
export type TicketIdInput = z.infer<typeof ticketIdSchema>;
export type CreateAdhocTicketInput = z.infer<typeof createAdhocTicketSchema>;
export type UpdateTicketContentInput = z.infer<typeof updateTicketContentSchema>;
export type UpdateTicketTitleInput = z.infer<typeof updateTicketTitleSchema>;

// ============================================================================
// Response Types
// ============================================================================

/**
 * Adhoc ticket response format (snake_case for JSON)
 */
export interface AdhocTicketResponse {
  id: string;
  project_id: string;
  external_id: string | null;
  title: string;
  state: TicketState;
  file_path: string;
  prefix: string;
  is_adhoc: boolean;
  is_explore: boolean;
  rejection_feedback: string | null;
  started_at: string | null;
  completed_at: string | null;
  created_at: string;
  updated_at: string;
}

/**
 * Ticket content response format
 */
export interface TicketContentResponse {
  ticket_id: string;
  file_path: string;
  content: string;
}

/**
 * Error response format
 */
export interface ErrorResponse {
  error: string;
  details?: Record<string, string[]>;
}

