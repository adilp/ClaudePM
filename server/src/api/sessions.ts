/**
 * Sessions API Router
 * Endpoints for managing Claude Code sessions
 */

import { Router, Request, Response, NextFunction } from 'express';
import { ZodError } from 'zod';
import {
  sessionIdSchema,
  projectIdSchema,
  startSessionSchema,
  startTicketSessionSchema,
  sendInputSchema,
  stopSessionSchema,
  outputQuerySchema,
  type SessionResponse,
  type SessionOutputResponse,
  type ErrorResponse,
  type MessageResponse,
} from './sessions-schemas.js';
import {
  sessionSupervisor,
  SessionNotFoundError,
  SessionProjectNotFoundError,
  SessionTicketNotFoundError,
  SessionAlreadyRunningError,
  SessionNotRunningError,
  SessionCreationError,
  SessionInputError,
  type SessionInfo,
} from '../services/session-supervisor.js';
import type { Session } from '../generated/prisma/index.js';

const router = Router();

// ============================================================================
// Helpers
// ============================================================================

/**
 * Convert Session or SessionInfo to API response format
 */
function toSessionResponse(session: Session | SessionInfo): SessionResponse {
  return {
    id: session.id,
    project_id: session.projectId,
    ticket_id: session.ticketId,
    type: session.type,
    status: session.status,
    context_percent: session.contextPercent,
    pane_id: 'paneId' in session ? session.paneId : session.tmuxPaneId,
    started_at: session.startedAt?.toISOString() ?? null,
    ended_at: session.endedAt?.toISOString() ?? null,
    created_at: session.createdAt.toISOString(),
    updated_at: session.updatedAt.toISOString(),
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
 * Error handler for session routes
 */
function handleSessionError(err: Error, res: Response<ErrorResponse>): void {
  if (err instanceof ZodError) {
    res.status(400).json(formatZodError(err));
    return;
  }

  if (err instanceof SessionNotFoundError) {
    res.status(404).json({ error: err.message });
    return;
  }

  if (err instanceof SessionProjectNotFoundError) {
    res.status(404).json({ error: err.message });
    return;
  }

  if (err instanceof SessionTicketNotFoundError) {
    res.status(404).json({ error: err.message });
    return;
  }

  if (err instanceof SessionAlreadyRunningError) {
    res.status(409).json({ error: err.message });
    return;
  }

  if (err instanceof SessionNotRunningError) {
    res.status(400).json({ error: err.message });
    return;
  }

  if (err instanceof SessionCreationError) {
    res.status(500).json({ error: err.message });
    return;
  }

  if (err instanceof SessionInputError) {
    res.status(400).json({ error: err.message });
    return;
  }

  // Log unexpected errors
  console.error('Unexpected error in sessions API:', err);
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
      handleSessionError(err as Error, res as Response<ErrorResponse>);
    });
  };
}

// ============================================================================
// Routes
// ============================================================================

/**
 * GET /api/sessions
 * List all sessions, optionally filtered by project
 *
 * Query params:
 * - project_id: Filter by project (optional)
 */
router.get(
  '/sessions',
  asyncHandler<SessionResponse[] | ErrorResponse>(async (req, res) => {
    const projectId = req.query.project_id as string | undefined;

    const sessions = await sessionSupervisor.listSessions(projectId);

    res.json(sessions.map(toSessionResponse));
  })
);

/**
 * POST /api/projects/:id/sessions
 * Start a new session for a project
 *
 * Body options:
 * - ticket_id: Start a ticket session (optional)
 * - initial_prompt: Custom initial prompt (optional)
 * - cwd: Working directory override (optional)
 */
router.post(
  '/projects/:id/sessions',
  asyncHandler<SessionResponse | ErrorResponse>(async (req, res) => {
    const { id: projectId } = projectIdSchema.parse(req.params);

    // Check if this is a ticket session or ad-hoc
    // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
    if (req.body.ticket_id) {
      const input = startTicketSessionSchema.parse(req.body);

      // Build options conditionally to handle undefined
      const options: Parameters<typeof sessionSupervisor.startTicketSession>[0] = {
        projectId,
        ticketId: input.ticket_id,
      };
      if (input.initial_prompt !== undefined) {
        options.initialPrompt = input.initial_prompt;
      }
      if (input.cwd !== undefined) {
        options.cwd = input.cwd;
      }

      const session = await sessionSupervisor.startTicketSession(options);

      res.status(201).json(toSessionResponse(session));
    } else {
      const input = startSessionSchema.parse(req.body);

      // Build options conditionally to handle undefined
      const options: Parameters<typeof sessionSupervisor.startSession>[0] = {
        projectId,
      };
      if (input.initial_prompt !== undefined) {
        options.initialPrompt = input.initial_prompt;
      }
      if (input.cwd !== undefined) {
        options.cwd = input.cwd;
      }

      const session = await sessionSupervisor.startSession(options);

      res.status(201).json(toSessionResponse(session));
    }
  })
);

/**
 * GET /api/sessions/:id
 * Get session details
 */
router.get(
  '/sessions/:id',
  asyncHandler<SessionResponse | ErrorResponse>(async (req, res) => {
    const { id } = sessionIdSchema.parse(req.params);

    const session = await sessionSupervisor.getSession(id);

    res.json(toSessionResponse(session));
  })
);

/**
 * POST /api/sessions/:id/stop
 * Stop a running session
 *
 * Body options:
 * - force: Force kill without grace period (optional, default false)
 */
router.post(
  '/sessions/:id/stop',
  asyncHandler<MessageResponse | ErrorResponse>(async (req, res) => {
    const { id } = sessionIdSchema.parse(req.params);
    const { force } = stopSessionSchema.parse(req.body);

    await sessionSupervisor.stopSession(id, force);

    res.json({ message: 'Session stopped successfully' });
  })
);

/**
 * POST /api/sessions/:id/input
 * Send input to a running session
 *
 * Body:
 * - input: Text to send to the session (required)
 */
router.post(
  '/sessions/:id/input',
  asyncHandler<MessageResponse | ErrorResponse>(async (req, res) => {
    const { id } = sessionIdSchema.parse(req.params);
    const { input } = sendInputSchema.parse(req.body);

    await sessionSupervisor.sendInput(id, input);

    res.json({ message: 'Input sent successfully' });
  })
);

/**
 * GET /api/sessions/:id/output
 * Get recent output from a session
 *
 * Query params:
 * - lines: Number of lines to retrieve (optional, default 100, max 10000)
 */
router.get(
  '/sessions/:id/output',
  (req, res: Response<SessionOutputResponse | ErrorResponse>) => {
    try {
      const { id } = sessionIdSchema.parse(req.params);
      const { lines } = outputQuerySchema.parse(req.query);

      const output = sessionSupervisor.getSessionOutput(id, lines);

      res.json({
        session_id: id,
        lines: output,
        total_lines: output.length,
      });
    } catch (err) {
      handleSessionError(err as Error, res);
    }
  }
);

export default router;
