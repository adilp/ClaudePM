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
import { focusSessionAndActivate } from '../services/session-controller';
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
import { cn } from '../lib/utils';
import type { NotificationType, Notification } from '../types/api';

interface NotificationsPanelProps {
  isOpen: boolean;
  onClose: () => void;
}

const notificationConfig: Record<
  NotificationType,
  { icon: typeof Bell; iconColor: string; borderColor: string; label: string }
> = {
  waiting_input: {
    icon: MessageCircleQuestion,
    iconColor: 'text-amber-500',
    borderColor: 'border-l-amber-500',
    label: 'Waiting for Input',
  },
  review_ready: {
    icon: CheckCircle,
    iconColor: 'text-green-500',
    borderColor: 'border-l-green-500',
    label: 'Ready for Review',
  },
  handoff_complete: {
    icon: RefreshCw,
    iconColor: 'text-indigo-500',
    borderColor: 'border-l-indigo-500',
    label: 'Handoff Complete',
  },
  error: {
    icon: AlertCircle,
    iconColor: 'text-red-500',
    borderColor: 'border-l-red-500',
    label: 'Error',
  },
  context_low: {
    icon: AlertCircle,
    iconColor: 'text-amber-500',
    borderColor: 'border-l-amber-500',
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

  const handleNotificationClick = async (notification: Notification) => {
    // If notification has a session, focus it and activate Alacritty
    if (notification.session?.id) {
      try {
        await focusSessionAndActivate(notification.session.id);
        onClose();
      } catch (error) {
        console.error('Failed to focus session:', error);
      }
    }
  };

  return (
    <>
      {/* Backdrop */}
      <div
        className="fixed inset-0 bg-black/40 z-40"
        onClick={onClose}
      />

      {/* Panel */}
      <div className="fixed top-0 right-0 bottom-0 w-[380px] max-w-full bg-surface-secondary border-l border-line z-50 flex flex-col animate-[slide-in-right_0.2s_ease-out]">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-line">
          <div className="flex items-center gap-3">
            <Bell size={20} className="text-content-secondary" />
            <h2 className="text-lg font-semibold text-content-primary">Notifications</h2>
            {notifications.length > 0 && (
              <span className="px-1.5 py-0.5 text-xs font-medium bg-indigo-500 text-white rounded">
                {notifications.length}
              </span>
            )}
          </div>
          <div className="flex items-center gap-2">
            {notifications.length > 0 && (
              <button
                onClick={handleDismissAll}
                disabled={dismissAll.isPending}
                className="inline-flex items-center gap-1.5 px-2.5 py-1.5 text-xs bg-transparent border-none text-content-secondary rounded-md cursor-pointer transition-colors hover:bg-surface-tertiary hover:text-content-primary disabled:opacity-60"
                title="Dismiss all notifications"
              >
                <Trash2 size={14} />
                Clear all
              </button>
            )}
            <button
              onClick={onClose}
              className="flex items-center justify-center w-8 h-8 bg-transparent border-none text-content-secondary rounded-md cursor-pointer transition-colors hover:bg-surface-tertiary hover:text-content-primary"
            >
              <X size={20} />
            </button>
          </div>
        </div>

        {/* Info banner */}
        <div className="px-5 py-2.5 text-xs text-content-muted bg-surface-tertiary border-b border-line">
          Notifications auto-update when session state changes. Click to navigate, or
          dismiss when acknowledged.
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto">
          {isLoading ? (
            <div className="flex items-center justify-center py-16">
              <div className="w-5 h-5 border-2 border-surface-tertiary border-t-indigo-500 rounded-full animate-spin" />
            </div>
          ) : notifications.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-16 text-center">
              <Bell size={48} className="text-content-muted mb-4" />
              <p className="font-medium text-content-primary">No notifications</p>
              <p className="text-sm text-content-secondary">You're all caught up!</p>
            </div>
          ) : (
            <div className="flex flex-col">
              {notifications.map((notification) => {
                const config =
                  notificationConfig[notification.type] || notificationConfig.error;
                const Icon = config.icon;
                const link = getNotificationLink(notification);

                const content = (
                  <div className={cn(
                    'flex gap-3 p-4 border-l-[3px] border-b border-line bg-surface-secondary transition-colors hover:bg-surface-tertiary',
                    config.borderColor
                  )}>
                    <div className={cn('shrink-0 mt-0.5', config.iconColor)}>
                      <Icon size={16} />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between gap-2 mb-1">
                        <span className="text-xs font-medium text-content-primary">{config.label}</span>
                        <span className="text-[10px] text-content-muted shrink-0">
                          {formatTime(notification.created_at)}
                        </span>
                      </div>
                      <p className="text-sm text-content-secondary leading-snug">{notification.message}</p>
                      {(notification.session || notification.ticket) && (
                        <div className="flex items-center gap-1.5 mt-2 text-xs text-content-muted">
                          {notification.ticket && (
                            <span className="truncate max-w-[200px]">
                              {notification.ticket.title || notification.ticket.external_id}
                            </span>
                          )}
                          {link && <ArrowRight size={12} />}
                        </div>
                      )}
                      <button
                        onClick={(e) => handleDismiss(notification.id, e)}
                        disabled={dismissNotification.isPending}
                        className="mt-2 px-2 py-1 text-xs text-content-secondary bg-transparent border border-line rounded cursor-pointer transition-colors hover:bg-surface-tertiary hover:text-content-primary disabled:opacity-60"
                      >
                        Dismiss
                      </button>
                    </div>
                  </div>
                );

                // If notification has a session, make it clickable to focus + activate Alacritty
                if (notification.session?.id) {
                  return (
                    <button
                      key={notification.id}
                      onClick={() => handleNotificationClick(notification)}
                      className="w-full text-left bg-transparent border-none p-0 cursor-pointer"
                    >
                      {content}
                    </button>
                  );
                }

                // For ticket notifications without sessions, use Link
                if (link) {
                  return (
                    <Link
                      key={notification.id}
                      to={link}
                      onClick={onClose}
                      className="no-underline text-inherit"
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
        <div className="px-5 py-4 border-t border-line">
          <button
            onClick={() => refetch()}
            className="inline-flex items-center justify-center gap-2 w-full px-4 py-2 bg-transparent border border-line text-content-secondary text-sm rounded-md cursor-pointer transition-colors hover:bg-surface-tertiary hover:text-content-primary"
          >
            <RefreshCw size={16} />
            Refresh
          </button>
        </div>
      </div>
    </>
  );
}
