/**
 * Notifications Panel
 * Displays notifications that need attention.
 *
 * Notifications are state-based - they automatically update when the
 * underlying session/ticket state changes. Users can dismiss notifications
 * they've acknowledged.
 */

import { Link } from 'react-router-dom';
import { useNotifications, useDismissNotification, useDismissAllNotifications } from '@/hooks/useNotifications';
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
import { cn } from '@/lib/utils';
import type { NotificationType } from '@/types/api';

interface NotificationsPanelProps {
  isOpen: boolean;
  onClose: () => void;
}

const notificationConfig: Record<NotificationType, { icon: typeof Bell; color: string; bgColor: string; label: string }> = {
  waiting_input: { icon: MessageCircleQuestion, color: 'text-orange-600', bgColor: 'bg-orange-100', label: 'Waiting for Input' },
  review_ready: { icon: CheckCircle, color: 'text-green-600', bgColor: 'bg-green-100', label: 'Ready for Review' },
  handoff_complete: { icon: RefreshCw, color: 'text-blue-600', bgColor: 'bg-blue-100', label: 'Handoff Complete' },
  error: { icon: AlertCircle, color: 'text-red-600', bgColor: 'bg-red-100', label: 'Error' },
  context_low: { icon: AlertCircle, color: 'text-yellow-600', bgColor: 'bg-yellow-100', label: 'Context Low' },
};

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

  const getNotificationLink = (notification: typeof notifications[0]) => {
    if (notification.session) {
      return `/sessions/${notification.session.id}`;
    }
    if (notification.ticket) {
      return `/tickets/${notification.ticket.id}`;
    }
    return null;
  };

  const formatTime = (dateStr: string) => {
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
  };

  return (
    <>
      {/* Backdrop */}
      <div
        className="fixed inset-0 bg-black/50 z-40"
        onClick={onClose}
      />

      {/* Panel */}
      <div className="fixed right-0 top-0 h-full w-full max-w-md bg-background border-l shadow-xl z-50 flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b">
          <div className="flex items-center gap-2">
            <Bell className="h-5 w-5" />
            <h2 className="font-semibold">Notifications</h2>
            {notifications.length > 0 && (
              <span className="px-2 py-0.5 text-xs font-medium rounded-full bg-red-500 text-white">
                {notifications.length}
              </span>
            )}
          </div>
          <div className="flex items-center gap-2">
            {notifications.length > 0 && (
              <button
                onClick={handleDismissAll}
                disabled={dismissAll.isPending}
                className="flex items-center gap-1 px-2 py-1 text-sm text-muted-foreground hover:text-foreground hover:bg-accent rounded-md transition-colors disabled:opacity-50"
                title="Dismiss all notifications"
              >
                <Trash2 className="h-4 w-4" />
                Clear all
              </button>
            )}
            <button
              onClick={onClose}
              className="p-1 hover:bg-accent rounded-md transition-colors"
            >
              <X className="h-5 w-5" />
            </button>
          </div>
        </div>

        {/* Info banner */}
        <div className="px-4 py-2 bg-muted/50 text-xs text-muted-foreground border-b">
          Notifications auto-update when session state changes. Click to navigate, or dismiss when acknowledged.
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto">
          {isLoading ? (
            <div className="flex items-center justify-center h-32">
              <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-primary" />
            </div>
          ) : notifications.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-64 text-muted-foreground">
              <Bell className="h-12 w-12 mb-4 opacity-50" />
              <p className="font-medium">No notifications</p>
              <p className="text-sm">You're all caught up!</p>
            </div>
          ) : (
            <div className="divide-y">
              {notifications.map((notification) => {
                const config = notificationConfig[notification.type] || notificationConfig.error;
                const Icon = config.icon;
                const link = getNotificationLink(notification);
                const Wrapper = link ? Link : 'div';
                const wrapperProps = link ? { to: link, onClick: onClose } : {};

                return (
                  <Wrapper
                    key={notification.id}
                    {...wrapperProps}
                    className={cn(
                      "block p-4 hover:bg-accent/50 transition-colors",
                      link && "cursor-pointer"
                    )}
                  >
                    <div className="flex gap-3">
                      <div className={cn('rounded-full p-2 flex-shrink-0 h-fit', config.bgColor)}>
                        <Icon className={cn('h-4 w-4', config.color)} />
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-start justify-between gap-2">
                          <p className={cn('text-sm font-medium', config.color)}>
                            {config.label}
                          </p>
                          <span className="text-xs text-muted-foreground flex-shrink-0">
                            {formatTime(notification.created_at)}
                          </span>
                        </div>
                        <p className="text-sm text-muted-foreground mt-1 line-clamp-2">
                          {notification.message}
                        </p>
                        {(notification.session || notification.ticket) && (
                          <div className="flex items-center gap-2 mt-2 text-xs text-muted-foreground">
                            {notification.ticket && (
                              <span className="truncate">
                                {notification.ticket.title || notification.ticket.external_id}
                              </span>
                            )}
                            {link && (
                              <ArrowRight className="h-3 w-3 flex-shrink-0" />
                            )}
                          </div>
                        )}
                        <button
                          onClick={(e) => handleDismiss(notification.id, e)}
                          disabled={dismissNotification.isPending}
                          className="mt-2 text-xs text-muted-foreground hover:text-foreground disabled:opacity-50"
                        >
                          Dismiss
                        </button>
                      </div>
                    </div>
                  </Wrapper>
                );
              })}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="border-t p-3">
          <button
            onClick={() => refetch()}
            className="w-full flex items-center justify-center gap-2 px-3 py-2 text-sm text-muted-foreground hover:text-foreground hover:bg-accent rounded-md transition-colors"
          >
            <RefreshCw className="h-4 w-4" />
            Refresh
          </button>
        </div>
      </div>
    </>
  );
}
