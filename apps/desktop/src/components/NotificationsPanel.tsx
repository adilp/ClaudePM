/**
 * Notifications Panel
 * Displays notifications that need attention.
 */

import { Link } from 'react-router-dom';
import {
  useNotifications,
  useDismissNotification,
  useDismissAllNotifications,
} from '../hooks/useNotifications';
import {
  Bell,
  X,
  CheckCircle,
  AlertCircle,
  MessageCircleQuestion,
  ArrowRight,
  RefreshCw,
  Trash2,
} from 'lucide-react';
import type { NotificationType, Notification } from '../types/api';

interface NotificationsPanelProps {
  isOpen: boolean;
  onClose: () => void;
}

const notificationConfig: Record<
  NotificationType,
  { icon: typeof Bell; colorClass: string; label: string }
> = {
  waiting_input: {
    icon: MessageCircleQuestion,
    colorClass: 'notification--waiting',
    label: 'Waiting for Input',
  },
  review_ready: {
    icon: CheckCircle,
    colorClass: 'notification--success',
    label: 'Ready for Review',
  },
  handoff_complete: {
    icon: RefreshCw,
    colorClass: 'notification--info',
    label: 'Handoff Complete',
  },
  error: {
    icon: AlertCircle,
    colorClass: 'notification--error',
    label: 'Error',
  },
  context_low: {
    icon: AlertCircle,
    colorClass: 'notification--warning',
    label: 'Context Low',
  },
};

function formatTime(dateStr: string) {
  const date = new Date(dateStr);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffMins = Math.floor(diffMs / 60000);
  const diffHours = Math.floor(diffMins / 60);
  const diffDays = Math.floor(diffHours / 24);

  if (diffMins < 1) return 'Just now';
  if (diffMins < 60) return `${diffMins}m ago`;
  if (diffHours < 24) return `${diffHours}h ago`;
  if (diffDays < 7) return `${diffDays}d ago`;
  return date.toLocaleDateString();
}

function getNotificationLink(notification: Notification) {
  if (notification.session) {
    return `/sessions/${notification.session.id}`;
  }
  if (notification.ticket) {
    return `/tickets/${notification.ticket.id}`;
  }
  return null;
}

export function NotificationsPanel({ isOpen, onClose }: NotificationsPanelProps) {
  const { data, isLoading, refetch } = useNotifications();
  const dismissNotification = useDismissNotification();
  const dismissAll = useDismissAllNotifications();

  if (!isOpen) return null;

  const notifications = data?.data ?? [];

  const handleDismiss = (id: string, e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    dismissNotification.mutate(id);
  };

  const handleDismissAll = () => {
    dismissAll.mutate();
  };

  return (
    <>
      {/* Backdrop */}
      <div className="notifications-backdrop" onClick={onClose} />

      {/* Panel */}
      <div className="notifications-panel">
        {/* Header */}
        <div className="notifications-panel__header">
          <div className="notifications-panel__title-row">
            <Bell size={20} />
            <h2 className="notifications-panel__title">Notifications</h2>
            {notifications.length > 0 && (
              <span className="notifications-panel__count">{notifications.length}</span>
            )}
          </div>
          <div className="notifications-panel__actions">
            {notifications.length > 0 && (
              <button
                onClick={handleDismissAll}
                disabled={dismissAll.isPending}
                className="btn btn--ghost btn--sm"
                title="Dismiss all notifications"
              >
                <Trash2 size={16} />
                Clear all
              </button>
            )}
            <button onClick={onClose} className="btn btn--ghost btn--sm">
              <X size={20} />
            </button>
          </div>
        </div>

        {/* Info banner */}
        <div className="notifications-panel__info">
          Notifications auto-update when session state changes. Click to navigate, or
          dismiss when acknowledged.
        </div>

        {/* Content */}
        <div className="notifications-panel__content">
          {isLoading ? (
            <div className="notifications-panel__loading">
              <div className="spinner" />
            </div>
          ) : notifications.length === 0 ? (
            <div className="notifications-panel__empty">
              <Bell size={48} className="notifications-panel__empty-icon" />
              <p className="notifications-panel__empty-title">No notifications</p>
              <p className="notifications-panel__empty-text">You're all caught up!</p>
            </div>
          ) : (
            <div className="notifications-list">
              {notifications.map((notification) => {
                const config =
                  notificationConfig[notification.type] || notificationConfig.error;
                const Icon = config.icon;
                const link = getNotificationLink(notification);

                const content = (
                  <div className={`notification-item ${config.colorClass}`}>
                    <div className="notification-item__icon">
                      <Icon size={16} />
                    </div>
                    <div className="notification-item__content">
                      <div className="notification-item__header">
                        <span className="notification-item__label">{config.label}</span>
                        <span className="notification-item__time">
                          {formatTime(notification.created_at)}
                        </span>
                      </div>
                      <p className="notification-item__message">{notification.message}</p>
                      {(notification.session || notification.ticket) && (
                        <div className="notification-item__meta">
                          {notification.ticket && (
                            <span className="notification-item__ticket">
                              {notification.ticket.title || notification.ticket.external_id}
                            </span>
                          )}
                          {link && <ArrowRight size={12} />}
                        </div>
                      )}
                      <button
                        onClick={(e) => handleDismiss(notification.id, e)}
                        disabled={dismissNotification.isPending}
                        className="notification-item__dismiss"
                      >
                        Dismiss
                      </button>
                    </div>
                  </div>
                );

                if (link) {
                  return (
                    <Link
                      key={notification.id}
                      to={link}
                      onClick={onClose}
                      className="notification-item__link"
                    >
                      {content}
                    </Link>
                  );
                }

                return <div key={notification.id}>{content}</div>;
              })}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="notifications-panel__footer">
          <button
            onClick={() => refetch()}
            className="btn btn--ghost btn--md notifications-panel__refresh"
          >
            <RefreshCw size={16} />
            Refresh
          </button>
        </div>
      </div>
    </>
  );
}
