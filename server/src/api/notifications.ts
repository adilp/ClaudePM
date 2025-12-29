/**
 * Notifications API
 * Endpoints for fetching and managing notifications
 *
 * Notifications are state-based (one per session/ticket) and automatically
 * update when the underlying state changes. Users can dismiss notifications
 * they've acknowledged.
 */

import { Router, Request, Response } from 'express';
import { prisma } from '../config/db.js';

const router = Router();

/**
 * GET /api/notifications
 * Fetch active notifications (waiting_input, review_ready, error types)
 */
router.get('/notifications', async (_req: Request, res: Response): Promise<void> => {
  try {
    const notifications = await prisma.notification.findMany({
      where: {
        // Only show notifications that need attention
        type: {
          in: ['waiting_input', 'review_ready', 'error', 'context_low'],
        },
      },
      orderBy: {
        createdAt: 'desc',
      },
      take: 50,
      include: {
        session: {
          select: {
            id: true,
            type: true,
            status: true,
          },
        },
        ticket: {
          select: {
            id: true,
            externalId: true,
            title: true,
          },
        },
      },
    });

    res.json({
      data: notifications.map((n) => ({
        id: n.id,
        type: n.type,
        message: n.message,
        created_at: n.createdAt.toISOString(),
        session: n.session
          ? {
              id: n.session.id,
              type: n.session.type,
              status: n.session.status,
            }
          : null,
        ticket: n.ticket
          ? {
              id: n.ticket.id,
              external_id: n.ticket.externalId,
              title: n.ticket.title,
            }
          : null,
      })),
      count: notifications.length,
    });
  } catch (error) {
    console.error('Failed to fetch notifications:', error);
    res.status(500).json({ error: 'Failed to fetch notifications' });
  }
});

/**
 * GET /api/notifications/count
 * Get count of active notifications
 */
router.get('/notifications/count', async (_req: Request, res: Response): Promise<void> => {
  try {
    const count = await prisma.notification.count({
      where: {
        type: {
          in: ['waiting_input', 'review_ready', 'error', 'context_low'],
        },
      },
    });

    res.json({ count });
  } catch (error) {
    console.error('Failed to count notifications:', error);
    res.status(500).json({ error: 'Failed to count notifications' });
  }
});

/**
 * DELETE /api/notifications/:id
 * Dismiss a notification (removes it from the list)
 * Use this when user has acknowledged the notification
 */
router.delete('/notifications/:id', async (req: Request, res: Response): Promise<void> => {
  try {
    const id = req.params.id;
    if (!id) {
      res.status(400).json({ error: 'Notification ID is required' });
      return;
    }

    await prisma.notification.delete({
      where: { id },
    });

    res.json({ success: true });
  } catch (error) {
    console.error('Failed to dismiss notification:', error);
    res.status(500).json({ error: 'Failed to dismiss notification' });
  }
});

/**
 * DELETE /api/notifications
 * Dismiss all notifications
 */
router.delete('/notifications', async (_req: Request, res: Response): Promise<void> => {
  try {
    const result = await prisma.notification.deleteMany({
      where: {
        type: {
          in: ['waiting_input', 'review_ready', 'error', 'context_low'],
        },
      },
    });

    res.json({
      dismissed: result.count,
    });
  } catch (error) {
    console.error('Failed to dismiss all notifications:', error);
    res.status(500).json({ error: 'Failed to dismiss all notifications' });
  }
});

export default router;
