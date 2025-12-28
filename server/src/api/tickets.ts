import { Router, Request, Response, NextFunction } from 'express';
import { ZodError } from 'zod';
import {
  projectIdParamSchema,
  ticketIdParamSchema,
  listTicketsQuerySchema,
  updateTicketSchema,
  rejectTicketSchema,
  type TicketSummaryResponse,
  type TicketDetailResponse,
  type PaginatedResponse,
  type SyncResponse,
  type ErrorResponse,
  type TicketState,
  type TransitionResultResponse,
  type StateHistoryEntryResponse,
  type HistoryResponse,
  type ReviewResultResponse,
  type StartTicketResponse,
} from './tickets-schemas.js';
import {
  syncTicketsFromFilesystem,
  listTickets,
  getTicketById,
  syncSingleTicket,
  updateTicket,
  TicketNotFoundError,
  ProjectNotFoundError,
} from '../services/tickets.js';
import {
  ticketStateMachine,
  InvalidTransitionError,
  MissingFeedbackError,
  TicketNotFoundError as StateMachineTicketNotFoundError,
  type TransitionResult,
  type StateHistoryEntry,
} from '../services/ticket-state-machine.js';
import {
  reviewerSubagent,
  ReviewerError,
  ReviewTicketNotFoundError,
} from '../services/reviewer-subagent.js';
import {
  sessionSupervisor,
  SessionAlreadyRunningError,
} from '../services/session-supervisor.js';
import { prisma } from '../config/db.js';
import type { Ticket } from '../generated/prisma/index.js';

const router = Router();

// Helper to convert Prisma Ticket to API response format
function toTicketSummaryResponse(ticket: Ticket): TicketSummaryResponse {
  return {
    id: ticket.id,
    external_id: ticket.externalId,
    title: ticket.title,
    state: ticket.state as TicketState,
    file_path: ticket.filePath,
    is_adhoc: ticket.isAdhoc,
    started_at: ticket.startedAt?.toISOString() ?? null,
    completed_at: ticket.completedAt?.toISOString() ?? null,
    created_at: ticket.createdAt.toISOString(),
    updated_at: ticket.updatedAt.toISOString(),
  };
}

// Helper to format Zod errors
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

// Helper to convert TransitionResult to API response format
function toTransitionResultResponse(result: TransitionResult): TransitionResultResponse {
  return {
    ticket_id: result.ticketId,
    from_state: result.fromState as TicketState,
    to_state: result.toState as TicketState,
    trigger: result.trigger,
    reason: result.reason,
    timestamp: result.timestamp.toISOString(),
    history_entry_id: result.historyEntryId,
  };
}

// Helper to convert StateHistoryEntry to API response format
function toHistoryEntryResponse(entry: StateHistoryEntry): StateHistoryEntryResponse {
  const response: StateHistoryEntryResponse = {
    id: entry.id,
    ticket_id: entry.ticketId,
    from_state: entry.fromState as TicketState,
    to_state: entry.toState as TicketState,
    trigger: entry.trigger,
    reason: entry.reason,
    created_at: entry.createdAt.toISOString(),
  };

  if (entry.feedback) {
    response.feedback = entry.feedback;
  }

  if (entry.triggeredBy) {
    response.triggered_by = entry.triggeredBy;
  }

  return response;
}

// Error handler for ticket routes
function handleTicketError(
  err: Error,
  res: Response<ErrorResponse>
): void {
  if (err instanceof ZodError) {
    res.status(400).json(formatZodError(err));
    return;
  }

  if (err instanceof TicketNotFoundError || err instanceof StateMachineTicketNotFoundError) {
    res.status(404).json({ error: err.message });
    return;
  }

  if (err instanceof ProjectNotFoundError) {
    res.status(404).json({ error: err.message });
    return;
  }

  if (err instanceof InvalidTransitionError) {
    res.status(400).json({ error: err.message });
    return;
  }

  if (err instanceof MissingFeedbackError) {
    res.status(400).json({ error: err.message });
    return;
  }

  if (err instanceof ReviewTicketNotFoundError) {
    res.status(404).json({ error: err.message });
    return;
  }

  if (err instanceof ReviewerError) {
    res.status(400).json({ error: err.message });
    return;
  }

  if (err instanceof SessionAlreadyRunningError) {
    res.status(409).json({ error: err.message });
    return;
  }

  // Log unexpected errors
  console.error('Unexpected error in tickets API:', err);
  res.status(500).json({ error: 'Internal server error' });
}

// Async handler wrapper
function asyncHandler<T>(
  fn: (req: Request, res: Response<T>, next: NextFunction) => Promise<void>
) {
  return (req: Request, res: Response<T>, next: NextFunction): void => {
    Promise.resolve(fn(req, res, next)).catch((err) => {
      handleTicketError(err as Error, res as Response<ErrorResponse>);
    });
  };
}

/**
 * GET /api/projects/:id/tickets
 * List tickets for a project with optional sync
 */
router.get(
  '/projects/:id/tickets',
  asyncHandler<PaginatedResponse<TicketSummaryResponse> | ErrorResponse>(async (req, res) => {
    const { id } = projectIdParamSchema.parse(req.params);
    const query = listTicketsQuerySchema.parse(req.query);

    const options: { page: number; limit: number; state?: typeof query.state } = {
      page: query.page,
      limit: query.limit,
    };
    if (query.state !== undefined) {
      options.state = query.state;
    }

    const result = await listTickets(id, options, query.sync);

    res.json({
      data: result.tickets.map(toTicketSummaryResponse),
      pagination: {
        page: result.page,
        limit: result.limit,
        total: result.total,
        total_pages: result.totalPages,
      },
    });
  })
);

/**
 * POST /api/projects/:id/sync-tickets
 * Force sync tickets from filesystem for a project
 */
router.post(
  '/projects/:id/sync-tickets',
  asyncHandler<SyncResponse | ErrorResponse>(async (req, res) => {
    const { id } = projectIdParamSchema.parse(req.params);

    const result = await syncTicketsFromFilesystem(id);

    res.json({
      message: 'Sync completed',
      result: {
        created: result.created,
        updated: result.updated,
        deleted: result.deleted,
        errors: result.errors,
      },
    });
  })
);

/**
 * GET /api/tickets/:id
 * Get single ticket details with content
 */
router.get(
  '/tickets/:id',
  asyncHandler<TicketDetailResponse | ErrorResponse>(async (req, res) => {
    const { id } = ticketIdParamSchema.parse(req.params);

    const ticket = await getTicketById(id);

    res.json({
      id: ticket.id,
      external_id: ticket.externalId,
      title: ticket.title,
      state: ticket.state as TicketState,
      file_path: ticket.filePath,
      is_adhoc: ticket.isAdhoc,
      content: ticket.content,
      project_id: ticket.projectId,
      started_at: ticket.startedAt?.toISOString() ?? null,
      completed_at: ticket.completedAt?.toISOString() ?? null,
      created_at: ticket.createdAt.toISOString(),
      updated_at: ticket.updatedAt.toISOString(),
    });
  })
);

/**
 * POST /api/tickets/:id/sync
 * Force re-sync a single ticket from its file
 */
router.post(
  '/tickets/:id/sync',
  asyncHandler<TicketSummaryResponse | ErrorResponse>(async (req, res) => {
    const { id } = ticketIdParamSchema.parse(req.params);

    const ticket = await syncSingleTicket(id);

    res.json(toTicketSummaryResponse(ticket));
  })
);

/**
 * PATCH /api/tickets/:id
 * Update ticket state
 */
router.patch(
  '/tickets/:id',
  asyncHandler<TicketSummaryResponse | ErrorResponse>(async (req, res) => {
    const { id } = ticketIdParamSchema.parse(req.params);
    const input = updateTicketSchema.parse(req.body);

    const updateData: { state?: typeof input.state } = {};
    if (input.state !== undefined) {
      updateData.state = input.state;
    }

    const ticket = await updateTicket(id, updateData);

    res.json(toTicketSummaryResponse(ticket));
  })
);

/**
 * POST /api/tickets/:id/approve
 * Approve a ticket (review → done)
 */
router.post(
  '/tickets/:id/approve',
  asyncHandler<TransitionResultResponse | ErrorResponse>(async (req, res) => {
    const { id } = ticketIdParamSchema.parse(req.params);

    const result = await ticketStateMachine.approve(id);

    res.json(toTransitionResultResponse(result));
  })
);

/**
 * POST /api/tickets/:id/reject
 * Reject a ticket with feedback (review → in_progress)
 * Also sends the feedback to the running session if one exists
 */
router.post(
  '/tickets/:id/reject',
  asyncHandler<TransitionResultResponse | ErrorResponse>(async (req, res) => {
    const { id } = ticketIdParamSchema.parse(req.params);
    const { feedback } = rejectTicketSchema.parse(req.body);

    const result = await ticketStateMachine.reject(id, feedback);

    // Find running session for this ticket and send the feedback
    const sessions = sessionSupervisor.listActiveSessions();
    const ticketSession = sessions.find(
      (s) => s.ticketId === id && s.status === 'running'
    );

    if (ticketSession) {
      const feedbackMessage = `

The reviewer has requested changes:

${feedback}

Please address the feedback above and continue working on the ticket.
`;
      try {
        await sessionSupervisor.sendInput(ticketSession.id, feedbackMessage);
      } catch (err) {
        console.error('[Reject] Failed to send feedback to session:', err);
      }
    }

    res.json(toTransitionResultResponse(result));
  })
);

/**
 * GET /api/tickets/:id/history
 * Get state transition history for a ticket
 */
router.get(
  '/tickets/:id/history',
  asyncHandler<HistoryResponse | ErrorResponse>(async (req, res) => {
    const { id } = ticketIdParamSchema.parse(req.params);

    const history = await ticketStateMachine.getHistory(id);

    res.json({
      data: history.map(toHistoryEntryResponse),
    });
  })
);

/**
 * POST /api/tickets/:id/review
 * Trigger a manual review for a ticket
 * Requires an active session working on the ticket
 */
router.post(
  '/tickets/:id/review',
  asyncHandler<ReviewResultResponse | ErrorResponse>(async (req, res) => {
    const { id } = ticketIdParamSchema.parse(req.params);

    // Find the ticket and its active session
    const ticket = await prisma.ticket.findUnique({
      where: { id },
      include: {
        sessions: {
          where: { status: 'running' },
          orderBy: { createdAt: 'desc' },
          take: 1,
        },
      },
    });

    if (!ticket) {
      res.status(404).json({ error: `Ticket not found: ${id}` });
      return;
    }

    const activeSession = ticket.sessions[0];
    if (!activeSession) {
      res.status(400).json({ error: 'No active session found for this ticket' });
      return;
    }

    const result = await reviewerSubagent.review({
      sessionId: activeSession.id,
      ticketId: id,
      trigger: 'manual',
    });

    res.json({
      decision: result.decision,
      reasoning: result.reasoning,
      timestamp: result.timestamp.toISOString(),
    });
  })
);

/**
 * POST /api/tickets/:id/start
 * Start working on a ticket - moves to in_progress and creates a session
 * Returns 409 if ticket already has a running session
 */
router.post(
  '/tickets/:id/start',
  asyncHandler<StartTicketResponse | ErrorResponse>(async (req, res) => {
    const { id } = ticketIdParamSchema.parse(req.params);

    // Find the ticket with its project info
    const ticket = await prisma.ticket.findUnique({
      where: { id },
      include: {
        project: true,
        sessions: {
          where: { status: 'running' },
          take: 1,
        },
      },
    });

    if (!ticket) {
      res.status(404).json({ error: `Ticket not found: ${id}` });
      return;
    }

    // Check if ticket already has a running session
    const runningSession = ticket.sessions[0];
    if (runningSession) {
      res.status(409).json({
        error: `Ticket already has a running session: ${runningSession.id}`,
      });
      return;
    }

    // If ticket is in backlog, transition to in_progress
    if (ticket.state === 'backlog') {
      await ticketStateMachine.transition({
        ticketId: id,
        targetState: 'in_progress',
        trigger: 'auto',
        reason: 'session_started',
      });
    }

    // Start a session for the ticket
    const session = await sessionSupervisor.startTicketSession({
      projectId: ticket.projectId,
      ticketId: id,
    });

    // Refetch the updated ticket
    const updatedTicket = await prisma.ticket.findUniqueOrThrow({
      where: { id },
    });

    res.json({
      ticket: toTicketSummaryResponse(updatedTicket),
      session: {
        id: session.id,
        project_id: session.projectId,
        ticket_id: session.ticketId!,
        type: 'ticket' as const,
        status: 'running' as const,
        pane_id: session.tmuxPaneId,
        started_at: session.startedAt?.toISOString() ?? new Date().toISOString(),
        created_at: session.createdAt.toISOString(),
      },
    });
  })
);

export default router;
