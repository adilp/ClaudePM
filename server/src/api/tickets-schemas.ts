import { z } from 'zod';

// Ticket state enum matching Prisma schema
export const ticketStateEnum = z.enum(['backlog', 'in_progress', 'review', 'done']);

// Request schemas

export const projectIdParamSchema = z.object({
  id: z.string().uuid('Invalid project ID'),
});

export const ticketIdParamSchema = z.object({
  id: z.string().uuid('Invalid ticket ID'),
});

// Custom boolean coercion that handles string "false" correctly
const booleanFromString = z
  .union([z.boolean(), z.string()])
  .transform((val) => {
    if (typeof val === 'boolean') return val;
    return val.toLowerCase() !== 'false' && val !== '0' && val !== '';
  });

export const listTicketsQuerySchema = z.object({
  page: z.coerce.number().int().positive().default(1),
  limit: z.coerce.number().int().positive().max(100).default(20),
  state: ticketStateEnum.optional(),
  sync: booleanFromString.default(true), // Whether to sync from filesystem first
  prefixes: z
    .string()
    .optional()
    .transform((val) => (val ? val.split(',').filter(Boolean) : undefined)), // Comma-separated list of prefixes
});

// Response for prefixes endpoint
export interface PrefixesResponse {
  data: string[];
}

export const updateTicketSchema = z.object({
  state: ticketStateEnum.optional(),
});

// Reject request schema - requires feedback
export const rejectTicketSchema = z.object({
  feedback: z.string().min(1, 'Feedback is required').max(5000),
});

// Transition trigger enum
export const transitionTriggerEnum = z.enum(['auto', 'manual']);

// Transition reason enum
export const transitionReasonEnum = z.enum([
  'session_started',
  'completion_detected',
  'user_approved',
  'user_rejected',
]);

// Types derived from schemas
export type ListTicketsQuery = z.infer<typeof listTicketsQuerySchema>;
export type UpdateTicketInput = z.infer<typeof updateTicketSchema>;
export type TicketState = z.infer<typeof ticketStateEnum>;
export type RejectTicketInput = z.infer<typeof rejectTicketSchema>;
export type TransitionTrigger = z.infer<typeof transitionTriggerEnum>;
export type TransitionReason = z.infer<typeof transitionReasonEnum>;

// Response types

export interface TicketSummaryResponse {
  id: string;
  external_id: string | null;
  title: string;
  state: TicketState;
  file_path: string;
  is_adhoc: boolean;
  started_at: string | null;
  completed_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface TicketDetailResponse extends TicketSummaryResponse {
  content: string;
  project_id: string;
}

export interface PaginatedResponse<T> {
  data: T[];
  pagination: {
    page: number;
    limit: number;
    total: number;
    total_pages: number;
  };
}

export interface SyncResult {
  created: number;
  updated: number;
  deleted: number;
  errors: string[];
}

export interface SyncResponse {
  message: string;
  result: SyncResult;
}

export interface ErrorResponse {
  error: string;
  details?: Record<string, string[]>;
}

// State history entry response
export interface StateHistoryEntryResponse {
  id: string;
  ticket_id: string;
  from_state: TicketState;
  to_state: TicketState;
  trigger: TransitionTrigger;
  reason: TransitionReason;
  feedback?: string;
  triggered_by?: string;
  created_at: string;
}

// Transition result response
export interface TransitionResultResponse {
  ticket_id: string;
  from_state: TicketState;
  to_state: TicketState;
  trigger: TransitionTrigger;
  reason: TransitionReason;
  timestamp: string;
  history_entry_id: string;
}

// History list response
export interface HistoryResponse {
  data: StateHistoryEntryResponse[];
}

// Review decision type
export type ReviewDecision = 'complete' | 'not_complete' | 'needs_clarification';

// Review result response
export interface ReviewResultResponse {
  decision: ReviewDecision;
  reasoning: string;
  timestamp: string;
}

// Start ticket response - combines ticket state transition with session creation
export interface StartTicketResponse {
  ticket: TicketSummaryResponse;
  session: {
    id: string;
    project_id: string;
    ticket_id: string;
    type: 'ticket';
    status: 'running';
    pane_id: string;
    started_at: string;
    created_at: string;
  };
}
