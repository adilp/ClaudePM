/**
 * Claude Code Hooks API
 * Receives hook events from Claude Code and forwards to WaitingDetector
 */

import { Router, Request, Response } from 'express';
import { z } from 'zod';
import { waitingDetector, type ClaudeHookPayload } from '../services/waiting-detector.js';

const router = Router();

// ============================================================================
// Validation Schemas
// ============================================================================

/**
 * Hook payload schema
 */
const hookPayloadSchema = z.object({
  event: z.string(),
  matcher: z.string().optional(),
  session_id: z.string().optional(),
  transcript_path: z.string().optional(),
  cwd: z.string().optional(),
  timestamp: z.string().optional(),
});

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
    const result = hookPayloadSchema.safeParse(req.body);

    if (!result.success) {
      console.warn('Invalid hook payload:', result.error.issues);
      res.status(200).json({
        received: true,
        warning: 'Invalid payload format',
      });
      return;
    }

    const payload = result.data as ClaudeHookPayload;

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
