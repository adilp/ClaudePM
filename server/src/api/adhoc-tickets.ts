/**
 * Adhoc Tickets API Router
 * Endpoints for creating and managing adhoc tickets with file-based content
 */

import { Router, Request, Response, NextFunction } from 'express';
import { ZodError } from 'zod';
import {
  projectIdSchema,
  ticketIdSchema,
  createAdhocTicketSchema,
  updateTicketContentSchema,
  updateTicketTitleSchema,
  type AdhocTicketResponse,
  type TicketContentResponse,
  type ErrorResponse,
} from './adhoc-tickets-schemas.js';
import {
  adhocTicketsService,
  AdhocTicketError,
  SlugExistsError,
  ProjectNotFoundError,
  TicketNotFoundError,
  FileOperationError,
  TicketCannotBeDeletedError,
} from '../services/adhoc-tickets.js';
import type { Ticket } from '../generated/prisma/index.js';

const router = Router();

// ============================================================================
// Helpers
// ============================================================================

/**
 * Convert Ticket to API response format
 */
function toAdhocTicketResponse(ticket: Ticket): AdhocTicketResponse {
  return {
    id: ticket.id,
    project_id: ticket.projectId,
    external_id: ticket.externalId,
    title: ticket.title,
    state: ticket.state,
    file_path: ticket.filePath,
    is_adhoc: ticket.isAdhoc,
    is_explore: ticket.isExplore,
    rejection_feedback: ticket.rejectionFeedback,
    started_at: ticket.startedAt?.toISOString() ?? null,
    completed_at: ticket.completedAt?.toISOString() ?? null,
    created_at: ticket.createdAt.toISOString(),
    updated_at: ticket.updatedAt.toISOString(),
  };
}

/**
 * Format Zod validation errors
 */
function formatZodError(error: ZodError): ErrorResponse {
  const details: Record<string, string[]> = {};
  for (const issue of error.issues) {
    const path = issue.path.join('.');
    details[path] ??= [];
    details[path].push(issue.message);
  }
  return {
    error: 'Validation error',
    details,
  };
}

/**
 * Error handler for adhoc ticket routes
 */
function handleAdhocTicketError(err: Error, res: Response<ErrorResponse>): void {
  if (err instanceof ZodError) {
    res.status(400).json(formatZodError(err));
    return;
  }

  if (err instanceof ProjectNotFoundError) {
    res.status(404).json({ error: err.message });
    return;
  }

  if (err instanceof TicketNotFoundError) {
    res.status(404).json({ error: err.message });
    return;
  }

  if (err instanceof SlugExistsError) {
    res.status(409).json({ error: err.message });
    return;
  }

  if (err instanceof TicketCannotBeDeletedError) {
    res.status(409).json({ error: err.message });
    return;
  }

  if (err instanceof FileOperationError) {
    res.status(500).json({ error: err.message });
    return;
  }

  if (err instanceof AdhocTicketError) {
    res.status(400).json({ error: err.message });
    return;
  }

  // Log unexpected errors
  console.error('Unexpected error in adhoc tickets API:', err);
  res.status(500).json({ error: 'Internal server error' });
}

/**
 * Async handler wrapper
 */
function asyncHandler<T>(
  fn: (req: Request, res: Response<T>, next: NextFunction) => Promise<void>
) {
  return (req: Request, res: Response<T>, next: NextFunction): void => {
    Promise.resolve(fn(req, res, next)).catch((err) => {
      handleAdhocTicketError(err as Error, res as Response<ErrorResponse>);
    });
  };
}

// ============================================================================
// Routes
// ============================================================================

/**
 * POST /api/projects/:projectId/adhoc-tickets
 * Create a new adhoc ticket for a project
 *
 * Body:
 * - title: Ticket title (3-100 chars)
 * - slug: URL-friendly identifier (3-50 chars, lowercase alphanumeric + hyphens)
 */
router.post(
  '/projects/:projectId/adhoc-tickets',
  asyncHandler<AdhocTicketResponse | ErrorResponse>(async (req, res) => {
    const { projectId } = projectIdSchema.parse(req.params);
    const { title, slug, isExplore } = createAdhocTicketSchema.parse(req.body);

    const ticket = await adhocTicketsService.createAdhocTicket(projectId, title, slug, isExplore);

    res.status(201).json(toAdhocTicketResponse(ticket));
  })
);

/**
 * GET /api/tickets/:ticketId/content
 * Get the markdown content of a ticket
 */
router.get(
  '/tickets/:ticketId/content',
  asyncHandler<TicketContentResponse | ErrorResponse>(async (req, res) => {
    const { ticketId } = ticketIdSchema.parse(req.params);

    const { ticket, content } = await adhocTicketsService.getTicketContent(ticketId);

    res.json({
      ticket_id: ticket.id,
      file_path: ticket.filePath,
      content,
    });
  })
);

/**
 * PUT /api/tickets/:ticketId/content
 * Update the markdown content of a ticket
 *
 * Body:
 * - content: New file content (max 100000 chars)
 */
router.put(
  '/tickets/:ticketId/content',
  asyncHandler<TicketContentResponse | ErrorResponse>(async (req, res) => {
    const { ticketId } = ticketIdSchema.parse(req.params);
    const { content } = updateTicketContentSchema.parse(req.body);

    const ticket = await adhocTicketsService.updateTicketContent(ticketId, content);

    res.json({
      ticket_id: ticket.id,
      file_path: ticket.filePath,
      content,
    });
  })
);

/**
 * PATCH /api/tickets/:ticketId/title
 * Update the title of an adhoc ticket
 * Also renames the file to match the new slug
 *
 * Body:
 * - title: New title (3-100 chars)
 */
router.patch(
  '/tickets/:ticketId/title',
  asyncHandler<AdhocTicketResponse | ErrorResponse>(async (req, res) => {
    const { ticketId } = ticketIdSchema.parse(req.params);
    const { title } = updateTicketTitleSchema.parse(req.body);

    const ticket = await adhocTicketsService.updateTicketTitle(ticketId, title);

    res.json(toAdhocTicketResponse(ticket));
  })
);

/**
 * DELETE /api/tickets/:ticketId
 * Delete a ticket (both database record and file)
 * Will fail if ticket has a running session
 */
router.delete(
  '/tickets/:ticketId',
  asyncHandler<{ message: string } | ErrorResponse>(async (req, res) => {
    const { ticketId } = ticketIdSchema.parse(req.params);

    await adhocTicketsService.deleteTicket(ticketId);

    res.json({ message: 'Ticket deleted successfully' });
  })
);

export default router;
