import { Router, Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import { prisma } from '../config/db.js';
import { Prisma } from '../generated/prisma/index.js';
import { notificationService } from '../services/notification-service.js';
import { apnsClient } from '../services/apns-client.js';
import { liveActivityPush } from '../services/live-activity-push.js';

const router = Router();

// Validation schema for device token registration
const registerSchema = z.object({
  token: z.string().regex(/^[0-9a-f]{64}$/i, 'Invalid APNs token format'),
  platform: z.enum(['ios', 'ipados', 'macos']).default('ios'),
});

// Validation schema for Live Activity push-token registration. Unlike the
// 64-hex APNs *device* token, an ActivityKit push token is variable-length
// (typically 128–160 hex chars), so it needs its own, looser format check.
const liveActivitySchema = z.object({
  token: z.string().regex(/^[0-9a-f]{32,}$/i, 'Invalid Live Activity token format'),
  platform: z.enum(['ios', 'ipados']).default('ios'),
  // Which Live Activity this token drives; only "agents" exists today.
  activity: z.string().max(64).default('agents'),
  // Which ActivityKit token this is (issue #13):
  //   - "update" — a per-activity push token, drives content updates (#10).
  //   - "start"  — an app-lifetime push-to-start token, lets the server START
  //                an activity remotely after iOS's ~8h expiry.
  // Stored under distinct platform suffixes so each push targets the right set.
  kind: z.enum(['update', 'start']).default('update'),
});

// Validation schema for the test push (both fields optional)
const testPushSchema = z.object({
  title: z.string().max(120).optional(),
  body: z.string().max(500).optional(),
});

// Response types
interface SuccessResponse {
  success: true;
}

interface ErrorResponse {
  error: string;
  message: string;
  details?: unknown;
}

// Async handler to wrap async route handlers
function asyncHandler<T>(
  fn: (req: Request, res: Response<T>, next: NextFunction) => Promise<void>
) {
  return (req: Request, res: Response<T>, next: NextFunction): void => {
    Promise.resolve(fn(req, res, next)).catch((err: unknown) => {
      console.error('Unhandled error in devices router:', err);
      (res as Response<ErrorResponse>).status(500).json({
        error: 'Internal server error',
        message: 'An unexpected error occurred',
      });
    });
  };
}

/**
 * POST /api/devices/register
 * Register or update a device token for push notifications
 */
router.post(
  '/register',
  asyncHandler<SuccessResponse | ErrorResponse>(async (req, res) => {
    const parseResult = registerSchema.safeParse(req.body);

    if (!parseResult.success) {
      (res as Response<ErrorResponse>).status(400).json({
        error: 'Validation error',
        message: parseResult.error.errors[0]?.message ?? 'Invalid request body',
        details: parseResult.error.errors,
      });
      return;
    }

    const { token, platform } = parseResult.data;

    await prisma.deviceToken.upsert({
      where: { token },
      create: { token, platform },
      update: { updatedAt: new Date() },
    });

    res.json({ success: true });
  })
);

/**
 * POST /api/devices/live-activity
 * Register an ActivityKit token so the server can drive the Live Activity. Two
 * kinds (see `kind`): a per-activity **update** token (content updates, #10) or
 * an app-lifetime **push-to-start** token (remote start after expiry, #13). We
 * reuse the `device_tokens` table with a `<platform>-liveactivity[-start]`
 * discriminator so no schema migration is needed — the push side queries by
 * that suffix. `kind` defaults to "update" for backward compatibility.
 */
router.post(
  '/live-activity',
  asyncHandler<SuccessResponse | ErrorResponse>(async (req, res) => {
    const parseResult = liveActivitySchema.safeParse(req.body);

    if (!parseResult.success) {
      (res as Response<ErrorResponse>).status(400).json({
        error: 'Validation error',
        message: parseResult.error.errors[0]?.message ?? 'Invalid request body',
        details: parseResult.error.errors,
      });
      return;
    }

    const { token, platform, kind } = parseResult.data;

    // "update" => `<platform>-liveactivity`; "start" => `<platform>-liveactivity-start`.
    const storedPlatform =
      kind === 'start' ? `${platform}-liveactivity-start` : `${platform}-liveactivity`;

    await prisma.deviceToken.upsert({
      where: { token },
      create: { token, platform: storedPlatform },
      update: { platform: storedPlatform, updatedAt: new Date() },
    });

    // A per-activity update token means the app just observed a *live* activity;
    // tell the push service so it doesn't redundantly push-to-start (issue #13).
    if (kind === 'update') {
      liveActivityPush.noteActivityRegistered();
    }

    res.json({ success: true });
  })
);

/**
 * POST /api/devices/test-push
 * Fire a test APNs alert to every registered device — the "confirm receipt on
 * device" step for APNs setup. Returns how many sends succeeded/failed, plus a
 * clear message when APNs isn't configured yet.
 */
router.post(
  '/test-push',
  asyncHandler<
    | { success: true; configured: boolean; registered: number; sent: number; failed: number }
    | ErrorResponse
  >(async (req, res) => {
    const parseResult = testPushSchema.safeParse(req.body ?? {});
    if (!parseResult.success) {
      (res as Response<ErrorResponse>).status(400).json({
        error: 'Validation error',
        message: parseResult.error.errors[0]?.message ?? 'Invalid request body',
        details: parseResult.error.errors,
      });
      return;
    }

    const configError = apnsClient.configError();
    if (configError) {
      (res as Response<ErrorResponse>).status(503).json({
        error: 'APNs not configured',
        message: configError,
      });
      return;
    }

    const registered = await prisma.deviceToken.count();
    const { title, body } = parseResult.data;
    const result = await notificationService.sendPush({
      title: title ?? 'ClaudePM',
      body: body ?? 'Test push — APNs is working. 🎉',
      data: { type: 'test' },
    });

    res.json({ success: true, configured: true, registered, ...result });
  })
);

/**
 * POST /api/devices/test-live-activity
 * Force an immediate Live Activity content push of the *current* fleet to every
 * registered Live Activity token — the "confirm receipt on device" step for
 * Live Activity push setup (mirrors /test-push for standard alerts). Bypasses
 * the automatic path's debounce/dedupe/budget. Returns how many tokens were
 * targeted and how many sends succeeded, plus a clear message when APNs isn't
 * configured. With zero live agents there is nothing to render, so `agents: 0`
 * and no push is attempted.
 */
router.post(
  '/test-live-activity',
  asyncHandler<
    | { success: true; configured: boolean; tokens: number; agents: number; sent: number; failed: number }
    | ErrorResponse
  >(async (_req, res) => {
    const configError = apnsClient.configError();
    if (configError) {
      (res as Response<ErrorResponse>).status(503).json({
        error: 'APNs not configured',
        message: configError,
      });
      return;
    }

    const result = await liveActivityPush.pushNow();
    res.json({ success: true, ...result });
  })
);

/**
 * POST /api/devices/test-live-activity-start
 * Force a push-to-START of the *current* fleet to every registered push-to-start
 * token — the "confirm receipt on device" step for push-to-start setup (issue
 * #13, mirrors /test-live-activity for content updates). Force-quit the app first
 * to prove the server can revive the Live Activity with no manual launch. Returns
 * how many push-to-start tokens were targeted and how many sends succeeded. With
 * zero live agents there is nothing to start, so `agents: 0` and no push.
 */
router.post(
  '/test-live-activity-start',
  asyncHandler<
    | { success: true; configured: boolean; tokens: number; agents: number; sent: number; failed: number }
    | ErrorResponse
  >(async (_req, res) => {
    const configError = apnsClient.configError();
    if (configError) {
      (res as Response<ErrorResponse>).status(503).json({
        error: 'APNs not configured',
        message: configError,
      });
      return;
    }

    const result = await liveActivityPush.startNow();
    res.json({ success: true, ...result });
  })
);

/**
 * DELETE /api/devices/:token
 * Remove a device token from the database
 */
router.delete(
  '/:token',
  asyncHandler<SuccessResponse | ErrorResponse>(async (req, res) => {
    const token = req.params.token;

    if (!token) {
      (res as Response<ErrorResponse>).status(400).json({
        error: 'Validation error',
        message: 'Token parameter is required',
      });
      return;
    }

    // Validate token format
    if (!/^[0-9a-f]{64}$/i.test(token)) {
      (res as Response<ErrorResponse>).status(400).json({
        error: 'Validation error',
        message: 'Invalid APNs token format',
      });
      return;
    }

    try {
      await prisma.deviceToken.delete({
        where: { token },
      });

      res.json({ success: true });
    } catch (error) {
      // Handle case where token doesn't exist (Prisma error code P2025)
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === 'P2025'
      ) {
        (res as Response<ErrorResponse>).status(404).json({
          error: 'Not found',
          message: 'Device token not found',
        });
        return;
      }

      throw error;
    }
  })
);

export default router;
