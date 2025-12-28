/**
 * Claude Code Hooks API
 * Receives hook events from Claude Code and forwards to WaitingDetector
 */

import { Router, Request, Response } from 'express';
import { z } from 'zod';
import { waitingDetector, type ClaudeHookPayload } from '../services/waiting-detector.js';
import { prisma } from '../config/db.js';

const router = Router();

// ============================================================================
// Validation Schemas
// ============================================================================

/**
 * Hook payload schema - matches Claude Code's actual stdin format
 * All fields optional for maximum compatibility
 */
const hookPayloadSchema = z.object({
  // Core fields from Claude Code
  session_id: z.string().optional(),
  transcript_path: z.string().optional(),
  cwd: z.string().optional(),
  permission_mode: z.string().optional(),
  hook_event_name: z.string().optional(), // "Notification", "Stop", etc.

  // Notification-specific fields
  notification_type: z.string().optional(), // "permission_prompt", "idle_prompt", etc.
  message: z.string().optional(),

  // Stop-specific fields
  stop_hook_active: z.boolean().optional(),

  // Legacy fields (for backwards compatibility)
  event: z.string().optional(),
  matcher: z.string().optional(),
  timestamp: z.string().optional(),
}).passthrough(); // Allow additional unknown fields

/**
 * SessionStart hook payload schema
 */
const sessionStartSchema = z.object({
  session_id: z.string(),
  transcript_path: z.string().optional(),
  cwd: z.string(),
  source: z.string().optional(), // "startup", "resume", or "clear"
  hook_event_name: z.string().optional(),
  permission_mode: z.string().optional(),
}).passthrough();

// ============================================================================
// Response Types
// ============================================================================

interface HookResponse {
  received: boolean;
  warning?: string;
}

// ============================================================================
// Routes
// ============================================================================

/**
 * POST /api/hooks/claude
 * Receives Claude Code hook events (Notification, Stop, etc.)
 *
 * Always returns 200 to avoid hook failures - hooks should be resilient.
 * Invalid payloads are logged but don't fail the request.
 */
router.post('/claude', (req: Request, res: Response<HookResponse>): void => {
  try {
    // Log raw payload for debugging
    console.log('[Hooks] Received payload:', JSON.stringify(req.body, null, 2));

    const result = hookPayloadSchema.safeParse(req.body);

    if (!result.success) {
      console.warn('[Hooks] Invalid hook payload:', result.error.issues);
      console.warn('[Hooks] Raw body was:', req.body);
      res.status(200).json({
        received: true,
        warning: 'Invalid payload format',
      });
      return;
    }

    const payload = result.data as ClaudeHookPayload;
    console.log('[Hooks] Parsed payload:', {
      event: payload.hook_event_name || payload.event,
      type: payload.notification_type || payload.matcher,
      cwd: payload.cwd,
      session_id: payload.session_id,
    });

    // Forward to waiting detector
    waitingDetector.handleHookEvent(payload);

    res.status(200).json({ received: true });
  } catch (error) {
    // Log but don't fail - hooks should be resilient
    console.error('Error processing hook:', error);
    res.status(200).json({
      received: true,
      warning: 'Processing error',
    });
  }
});

/**
 * POST /api/hooks/session-start
 * Registers a new Claude Code session and links it to a project
 *
 * Called when Claude Code starts via SessionStart hook.
 * Creates or updates a session record with Claude's session_id.
 */
router.post('/session-start', async (req: Request, res: Response<HookResponse>): Promise<void> => {
  try {
    console.log('[Hooks] SessionStart payload:', JSON.stringify(req.body, null, 2));

    const result = sessionStartSchema.safeParse(req.body);

    if (!result.success) {
      console.warn('[Hooks] Invalid SessionStart payload:', result.error.issues);
      res.status(200).json({
        received: true,
        warning: 'Invalid payload format',
      });
      return;
    }

    const { session_id, transcript_path, cwd, source } = result.data;

    // Find project by matching cwd to repo_path
    const projects = await prisma.project.findMany({
      select: { id: true, repoPath: true, name: true },
    });

    let matchingProject = null;
    for (const project of projects) {
      if (cwd.startsWith(project.repoPath)) {
        matchingProject = project;
        break;
      }
    }

    if (!matchingProject) {
      console.log('[Hooks] No matching project found for cwd:', cwd);
      res.status(200).json({
        received: true,
        warning: 'No matching project found',
      });
      return;
    }

    console.log('[Hooks] Matched project:', matchingProject.name);

    // Check if session with this Claude session_id already exists (e.g., on resume)
    const existingByClaudeId = await prisma.session.findUnique({
      where: { claudeSessionId: session_id },
    });

    if (existingByClaudeId) {
      // Update existing session on resume
      await prisma.session.update({
        where: { id: existingByClaudeId.id },
        data: {
          status: 'running',
          transcriptPath: transcript_path ?? null,
          updatedAt: new Date(),
        },
      });
      console.log('[Hooks] Updated existing session (resume):', existingByClaudeId.id, 'source:', source);
    } else {
      // Check if there's a recent session for this project without a claudeSessionId
      // This handles sessions started from the web UI before Claude Code reported its session_id
      const pendingSession = await prisma.session.findFirst({
        where: {
          projectId: matchingProject.id,
          claudeSessionId: null,
          status: { in: ['running', 'paused'] },
        },
        orderBy: { createdAt: 'desc' },
      });

      if (pendingSession) {
        // Link the existing session to this Claude session_id
        await prisma.session.update({
          where: { id: pendingSession.id },
          data: {
            claudeSessionId: session_id,
            transcriptPath: transcript_path ?? null,
            status: 'running',
            updatedAt: new Date(),
          },
        });
        console.log('[Hooks] Linked claude_session_id to existing session:', pendingSession.id, 'claude_session_id:', session_id);
      } else {
        // Create new session (ad-hoc Claude Code session not started from web UI)
        const newSession = await prisma.session.create({
          data: {
            projectId: matchingProject.id,
            claudeSessionId: session_id,
            transcriptPath: transcript_path ?? null,
            type: 'adhoc',
            status: 'running',
            tmuxPaneId: 'claude-code', // Placeholder since this is from hooks, not tmux
            startedAt: new Date(),
          },
        });
        console.log('[Hooks] Created new session:', newSession.id, 'claude_session_id:', session_id);

        // Auto-watch the session for waiting detection
        waitingDetector.watchSession(newSession.id);
      }
    }

    res.status(200).json({ received: true });
  } catch (error) {
    console.error('[Hooks] Error processing SessionStart:', error);
    res.status(200).json({
      received: true,
      warning: 'Processing error',
    });
  }
});

/**
 * GET /api/hooks/health
 * Health check endpoint for hooks
 */
router.get('/health', (_req: Request, res: Response): void => {
  res.json({
    status: 'ok',
    detectorRunning: waitingDetector.isRunning(),
    watchedSessions: waitingDetector.getWatchedSessions().length,
  });
});

export default router;
