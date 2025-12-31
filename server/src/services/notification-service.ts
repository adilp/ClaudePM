/**
 * Notification Service
 * Centralized service for creating, managing, and delivering notifications
 * Handles database persistence, WebSocket broadcast, and push notifications
 */

import { EventEmitter } from 'events';
import { prisma } from '../config/db.js';
import type { Notification, NotificationType } from '../generated/prisma/index.js';

// ============================================================================
// Types
// ============================================================================

export interface CreateNotificationOptions {
  /** Notification type */
  type: NotificationType;
  /** Notification message */
  message: string;
  /** Associated session ID (optional) */
  sessionId?: string | undefined;
  /** Associated ticket ID (optional) */
  ticketId?: string | undefined;
  /** If true, upserts based on ticketId (one notification per ticket) */
  upsertByTicket?: boolean | undefined;
  /** If true, upserts based on sessionId (one notification per session) */
  upsertBySession?: boolean | undefined;
}

export interface NotificationData {
  id: string;
  type: NotificationType;
  message: string;
  sessionId: string | null;
  ticketId: string | null;
  read: boolean;
  createdAt: Date;
}

export interface NotificationServiceEvents {
  'notification:created': (notification: NotificationData) => void;
  'notification:updated': (notification: NotificationData) => void;
  'notification:deleted': (id: string) => void;
  'notification:read': (id: string) => void;
}

export interface PushNotificationPayload {
  title: string;
  body: string;
  data?: Record<string, string>;
}

// ============================================================================
// Typed EventEmitter
// ============================================================================

class TypedEventEmitter extends EventEmitter {
  on<K extends keyof NotificationServiceEvents>(
    event: K,
    listener: NotificationServiceEvents[K]
  ): this {
    return super.on(event, listener);
  }

  off<K extends keyof NotificationServiceEvents>(
    event: K,
    listener: NotificationServiceEvents[K]
  ): this {
    return super.off(event, listener);
  }

  emit<K extends keyof NotificationServiceEvents>(
    event: K,
    ...args: Parameters<NotificationServiceEvents[K]>
  ): boolean {
    return super.emit(event, ...args);
  }
}

// ============================================================================
// Notification Service
// ============================================================================

interface WebSocketManagerInterface {
  sendNotification: (id: string, title: string, body: string) => void;
}

export class NotificationService extends TypedEventEmitter {
  private wsManager: WebSocketManagerInterface | null = null;

  constructor() {
    super();
  }

  /**
   * Set the WebSocket manager for broadcasting
   * Called during server startup to avoid circular dependency
   */
  setWebSocketManager(manager: WebSocketManagerInterface): void {
    this.wsManager = manager;
  }

  // ==========================================================================
  // Create / Upsert
  // ==========================================================================

  /**
   * Create a new notification or upsert based on options
   */
  async create(options: CreateNotificationOptions): Promise<NotificationData> {
    const { type, message, sessionId, ticketId, upsertByTicket, upsertBySession } = options;

    let notification: Notification;

    // Upsert by ticket - one notification per ticket
    if (upsertByTicket && ticketId) {
      const existing = await prisma.notification.findFirst({
        where: { ticketId },
      });

      if (existing) {
        notification = await prisma.notification.update({
          where: { id: existing.id },
          data: {
            type,
            message,
            read: false,
            createdAt: new Date(),
          },
        });
        return this.emitAndBroadcast('updated', notification);
      }
    }

    // Upsert by session - one notification per session
    if (upsertBySession && sessionId) {
      const existing = await prisma.notification.findFirst({
        where: { sessionId },
      });

      if (existing) {
        notification = await prisma.notification.update({
          where: { id: existing.id },
          data: {
            type,
            message,
            read: false,
            createdAt: new Date(),
          },
        });
        return this.emitAndBroadcast('updated', notification);
      }
    }

    // Create new notification
    notification = await prisma.notification.create({
      data: {
        type,
        message,
        sessionId: sessionId ?? null,
        ticketId: ticketId ?? null,
      },
    });

    return this.emitAndBroadcast('created', notification);
  }

  /**
   * Create notification for review ready
   */
  async notifyReviewReady(ticketId: string, ticketIdentifier: string, reasoning: string): Promise<NotificationData> {
    return this.create({
      type: 'review_ready',
      message: `Ticket ${ticketIdentifier} is ready for review. ${reasoning}`,
      ticketId,
      upsertByTicket: true,
    });
  }

  /**
   * Create notification for work not complete
   */
  async notifyNotComplete(ticketId: string, ticketIdentifier: string, reasoning: string): Promise<NotificationData> {
    return this.create({
      type: 'context_low', // Reuse for "still in progress" status
      message: `Ticket ${ticketIdentifier} still in progress: ${reasoning}`,
      ticketId,
      upsertByTicket: true,
    });
  }

  /**
   * Create notification for clarification needed
   */
  async notifyNeedsClarification(ticketId: string, ticketIdentifier: string, reasoning: string): Promise<NotificationData> {
    return this.create({
      type: 'waiting_input',
      message: `Ticket ${ticketIdentifier} needs clarification: ${reasoning}`,
      ticketId,
      upsertByTicket: true,
    });
  }

  /**
   * Create notification for waiting input (session)
   */
  async notifyWaitingInput(sessionId: string, reason: string): Promise<NotificationData> {
    return this.create({
      type: 'waiting_input',
      message: `Session waiting for input: ${reason}`,
      sessionId,
      upsertBySession: true,
    });
  }

  /**
   * Create notification for handoff complete
   */
  async notifyHandoffComplete(sessionId: string, message: string): Promise<NotificationData> {
    return this.create({
      type: 'handoff_complete',
      message,
      sessionId,
    });
  }

  /**
   * Create notification for context low
   */
  async notifyContextLow(sessionId: string, ticketId: string | undefined, contextPercent: number): Promise<NotificationData> {
    return this.create({
      type: 'context_low',
      message: `Context is low (${contextPercent}%). Consider starting a handoff.`,
      sessionId,
      ticketId,
      upsertBySession: true,
    });
  }

  /**
   * Create notification for error
   */
  async notifyError(message: string, sessionId?: string, ticketId?: string): Promise<NotificationData> {
    return this.create({
      type: 'error',
      message,
      sessionId,
      ticketId,
    });
  }

  // ==========================================================================
  // Read / List
  // ==========================================================================

  /**
   * Get all notifications, optionally filtered
   */
  async list(options?: { unreadOnly?: boolean; limit?: number }): Promise<NotificationData[]> {
    const where = options?.unreadOnly ? { read: false } : {};
    const notifications = await prisma.notification.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      ...(options?.limit && { take: options.limit }),
    });

    return notifications.map(this.toNotificationData);
  }

  /**
   * Get a single notification by ID
   */
  async getById(id: string): Promise<NotificationData | null> {
    const notification = await prisma.notification.findUnique({
      where: { id },
    });

    return notification ? this.toNotificationData(notification) : null;
  }

  /**
   * Get unread count
   */
  async getUnreadCount(): Promise<number> {
    return prisma.notification.count({
      where: { read: false },
    });
  }

  // ==========================================================================
  // Update
  // ==========================================================================

  /**
   * Mark a notification as read
   */
  async markRead(id: string): Promise<NotificationData | null> {
    try {
      const notification = await prisma.notification.update({
        where: { id },
        data: { read: true },
      });

      this.emit('notification:read', id);
      return this.toNotificationData(notification);
    } catch {
      return null;
    }
  }

  /**
   * Mark all notifications as read
   */
  async markAllRead(): Promise<number> {
    const result = await prisma.notification.updateMany({
      where: { read: false },
      data: { read: true },
    });

    return result.count;
  }

  // ==========================================================================
  // Delete
  // ==========================================================================

  /**
   * Delete a notification
   */
  async delete(id: string): Promise<boolean> {
    try {
      await prisma.notification.delete({
        where: { id },
      });

      this.emit('notification:deleted', id);
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Delete notifications by session
   */
  async deleteBySession(sessionId: string, type?: NotificationType): Promise<number> {
    const result = await prisma.notification.deleteMany({
      where: {
        sessionId,
        ...(type && { type }),
      },
    });

    return result.count;
  }

  /**
   * Delete notifications by ticket
   */
  async deleteByTicket(ticketId: string, type?: NotificationType): Promise<number> {
    const result = await prisma.notification.deleteMany({
      where: {
        ticketId,
        ...(type && { type }),
      },
    });

    return result.count;
  }

  // ==========================================================================
  // Push Notifications
  // ==========================================================================

  /**
   * Send push notification to all registered devices
   * Currently supports APNs for iOS/macOS
   */
  async sendPush(payload: PushNotificationPayload): Promise<{ sent: number; failed: number }> {
    const devices = await prisma.deviceToken.findMany();

    if (devices.length === 0) {
      return { sent: 0, failed: 0 };
    }

    // TODO: Implement actual APNs sending
    // For now, log what would be sent
    console.log(`[NotificationService] Would send push to ${devices.length} devices:`, payload);

    // When implementing APNs:
    // 1. Use @parse/node-apn or similar library
    // 2. Configure with APNs certificate/key from env
    // 3. Send to each device token
    // 4. Handle token invalidation (remove stale tokens)

    return { sent: 0, failed: 0 };
  }

  /**
   * Send push notification for a specific notification
   */
  async sendPushForNotification(notification: NotificationData): Promise<void> {
    const titleMap: Record<NotificationType, string> = {
      review_ready: 'Ready for Review',
      context_low: 'Context Low',
      handoff_complete: 'Handoff Complete',
      error: 'Error',
      waiting_input: 'Input Required',
    };

    await this.sendPush({
      title: titleMap[notification.type] || 'Notification',
      body: notification.message,
      data: {
        notificationId: notification.id,
        type: notification.type,
        ...(notification.ticketId && { ticketId: notification.ticketId }),
        ...(notification.sessionId && { sessionId: notification.sessionId }),
      },
    });
  }

  // ==========================================================================
  // Private Helpers
  // ==========================================================================

  private toNotificationData(notification: Notification): NotificationData {
    return {
      id: notification.id,
      type: notification.type,
      message: notification.message,
      sessionId: notification.sessionId,
      ticketId: notification.ticketId,
      read: notification.read,
      createdAt: notification.createdAt,
    };
  }

  private emitAndBroadcast(
    eventType: 'created' | 'updated',
    notification: Notification
  ): NotificationData {
    const data = this.toNotificationData(notification);

    // Emit local event
    this.emit(eventType === 'created' ? 'notification:created' : 'notification:updated', data);

    // Broadcast via WebSocket
    if (this.wsManager) {
      this.wsManager.sendNotification(
        data.id,
        this.getNotificationTitle(data.type),
        data.message
      );
    }

    // Send push notification for important types
    if (['review_ready', 'waiting_input', 'error'].includes(data.type)) {
      this.sendPushForNotification(data).catch((err) => {
        console.error('[NotificationService] Failed to send push:', err);
      });
    }

    return data;
  }

  private getNotificationTitle(type: NotificationType): string {
    const titles: Record<NotificationType, string> = {
      review_ready: 'Ready for Review',
      context_low: 'Context Low',
      handoff_complete: 'Handoff Complete',
      error: 'Error',
      waiting_input: 'Input Required',
    };
    return titles[type] || 'Notification';
  }
}

// ============================================================================
// Singleton Export
// ============================================================================

export const notificationService = new NotificationService();
