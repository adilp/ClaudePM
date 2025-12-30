import { Router, Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import { prisma } from '../config/db.js';
import { Prisma } from '../generated/prisma/index.js';

const router = Router();

// Validation schema for device token registration
const registerSchema = z.object({
  token: z.string().regex(/^[0-9a-f]{64}$/i, 'Invalid APNs token format'),
  platform: z.enum(['ios', 'ipados', 'macos']).default('ios'),
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
