/**
 * Dashboard Page
 * Overview of all projects and active sessions
 */

import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { useProjects } from '@/hooks/useProjects';
import { useSessions } from '@/hooks/useSessions';
import { useNotificationCount, useNotifications } from '@/hooks/useNotifications';
import { useWebSocket } from '@/hooks/useWebSocket';
import { NotificationsPanel } from '@/components/notifications';
import {
  FolderKanban,
  Play,
  Clock,
  CheckCircle,
  AlertCircle,
  ArrowRight,
  Bell,
  MessageCircleQuestion,
} from 'lucide-react';
import { cn } from '@/lib/utils';

export function Dashboard() {
  const { data: projectsData, isLoading: projectsLoading } = useProjects();
  const { data: sessions, isLoading: sessionsLoading } = useSessions();
  const { data: notificationCount, refetch: refetchNotificationCount } = useNotificationCount();
  const { data: notifications, refetch: refetchNotifications } = useNotifications();
  const { lastMessage, subscribe, unsubscribe } = useWebSocket();

  // Track waiting state for each session
  const [waitingSessions, setWaitingSessions] = useState<Set<string>>(new Set());
  const [showNotifications, setShowNotifications] = useState(false);

  const activeSessions = sessions?.filter((s) => s.status === 'running' || s.status === 'paused') ?? [];

  // Initialize waiting sessions from notifications API on load
  useEffect(() => {
    if (notifications?.data) {
      const waitingSessionIds = notifications.data
        .filter((n) => n.type === 'waiting_input' && n.session?.id)
        .map((n) => n.session!.id);

      if (waitingSessionIds.length > 0) {
        setWaitingSessions(new Set(waitingSessionIds));
      }
    }
  }, [notifications?.data]);

  // Subscribe to all active sessions for waiting state updates
  useEffect(() => {
    activeSessions.forEach((session) => {
      subscribe(session.id);
    });

    return () => {
      activeSessions.forEach((session) => {
        unsubscribe(session.id);
      });
    };
  }, [activeSessions.map(s => s.id).join(','), subscribe, unsubscribe]);

  // Handle WebSocket messages for waiting state
  useEffect(() => {
    if (lastMessage?.type === 'session:waiting') {
      const payload = lastMessage.payload as { sessionId: string; waiting: boolean };
      setWaitingSessions((prev) => {
        const next = new Set(prev);
        if (payload.waiting) {
          next.add(payload.sessionId);
        } else {
          next.delete(payload.sessionId);
        }
        return next;
      });
    }
  }, [lastMessage]);

  if (projectsLoading || sessionsLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" />
      </div>
    );
  }

  const unreadCount = notificationCount?.count ?? 0;
  const waitingCount = waitingSessions.size;

  return (
    <div className="space-y-8">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold">Dashboard</h1>
        <p className="text-muted-foreground">
          Overview of your projects and active sessions
        </p>
      </div>

      {/* Stats */}
      <div className="grid gap-4 md:grid-cols-4">
        <div className="rounded-lg border bg-card p-6">
          <div className="flex items-center gap-4">
            <div className="rounded-full bg-primary/10 p-3">
              <FolderKanban className="h-6 w-6 text-primary" />
            </div>
            <div>
              <p className="text-sm text-muted-foreground">Total Projects</p>
              <p className="text-2xl font-bold">{projectsData?.pagination.total ?? 0}</p>
            </div>
          </div>
        </div>

        <div className="rounded-lg border bg-card p-6">
          <div className="flex items-center gap-4">
            <div className="rounded-full bg-green-500/10 p-3">
              <Play className="h-6 w-6 text-green-500" />
            </div>
            <div>
              <p className="text-sm text-muted-foreground">Active Sessions</p>
              <p className="text-2xl font-bold">{activeSessions.length}</p>
            </div>
          </div>
        </div>

        <div className="rounded-lg border bg-card p-6">
          <div className="flex items-center gap-4">
            <div className={cn(
              "rounded-full p-3",
              waitingCount > 0 ? "bg-orange-500/10" : "bg-yellow-500/10"
            )}>
              {waitingCount > 0 ? (
                <MessageCircleQuestion className="h-6 w-6 text-orange-500" />
              ) : (
                <Clock className="h-6 w-6 text-yellow-500" />
              )}
            </div>
            <div>
              <p className="text-sm text-muted-foreground">
                {waitingCount > 0 ? 'Waiting for Input' : 'Paused'}
              </p>
              <p className="text-2xl font-bold">
                {waitingCount > 0
                  ? waitingCount
                  : activeSessions.filter((s) => s.status === 'paused').length}
              </p>
            </div>
          </div>
        </div>

        <button
          onClick={() => setShowNotifications(true)}
          className="rounded-lg border bg-card p-6 hover:bg-accent/50 transition-colors text-left w-full"
        >
          <div className="flex items-center gap-4">
            <div className={cn(
              "rounded-full p-3 relative",
              unreadCount > 0 ? "bg-red-500/10" : "bg-muted"
            )}>
              <Bell className={cn(
                "h-6 w-6",
                unreadCount > 0 ? "text-red-500" : "text-muted-foreground"
              )} />
              {unreadCount > 0 && (
                <span className="absolute -top-1 -right-1 h-5 w-5 rounded-full bg-red-500 text-white text-xs flex items-center justify-center">
                  {unreadCount > 9 ? '9+' : unreadCount}
                </span>
              )}
            </div>
            <div>
              <p className="text-sm text-muted-foreground">Notifications</p>
              <p className="text-2xl font-bold">{unreadCount}</p>
            </div>
          </div>
        </button>
      </div>

      {/* Active Sessions */}
      {activeSessions.length > 0 && (
        <div>
          <h2 className="text-lg font-semibold mb-4">Active Sessions</h2>
          <div className="space-y-3">
            {activeSessions.map((session) => {
              const isWaiting = waitingSessions.has(session.id);
              const sessionTitle = session.ticket
                ? session.ticket.title || session.ticket.external_id || 'Ticket Session'
                : 'Ad-hoc Session';
              const projectName = session.project?.name;

              return (
                <Link
                  key={session.id}
                  to={`/sessions/${session.id}`}
                  className={cn(
                    "flex items-center justify-between p-4 rounded-lg border bg-card hover:bg-accent/50 transition-colors",
                    isWaiting && "border-orange-500/50 bg-orange-500/5"
                  )}
                >
                  <div className="flex items-center gap-4">
                    <SessionStatusIcon status={session.status} isWaiting={isWaiting} />
                    <div className="min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <p className="font-medium truncate max-w-[300px]" title={sessionTitle}>
                          {sessionTitle}
                        </p>
                        {isWaiting && (
                          <span className="px-2 py-0.5 text-xs font-medium rounded-full bg-orange-500/10 text-orange-600 flex-shrink-0">
                            Waiting for Input
                          </span>
                        )}
                      </div>
                      <div className="flex items-center gap-2 text-sm text-muted-foreground">
                        {projectName && (
                          <>
                            <span className="truncate max-w-[200px]">{projectName}</span>
                            <span>•</span>
                          </>
                        )}
                        <span>
                          {session.context_percent !== null
                            ? `Context: ${session.context_percent}%`
                            : 'Starting...'}
                        </span>
                      </div>
                    </div>
                  </div>
                  <ArrowRight className="h-5 w-5 text-muted-foreground flex-shrink-0" />
                </Link>
              );
            })}
          </div>
        </div>
      )}

      {/* Projects List */}
      <div>
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-semibold">Projects</h2>
          <Link
            to="/projects"
            className="text-sm text-primary hover:underline"
          >
            View all
          </Link>
        </div>

        {projectsData?.data.length === 0 ? (
          <div className="rounded-lg border bg-card p-8 text-center">
            <FolderKanban className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
            <h3 className="font-medium mb-2">No projects yet</h3>
            <p className="text-sm text-muted-foreground mb-4">
              Get started by creating your first project
            </p>
            <Link
              to="/projects/new"
              className="inline-flex items-center justify-center rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90"
            >
              Create Project
            </Link>
          </div>
        ) : (
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
            {projectsData?.data.slice(0, 6).map((project) => (
              <Link
                key={project.id}
                to={`/projects/${project.id}`}
                className="rounded-lg border bg-card p-4 hover:bg-accent/50 transition-colors"
              >
                <h3 className="font-medium mb-1">{project.name}</h3>
                <p className="text-sm text-muted-foreground truncate">
                  {project.repo_path}
                </p>
              </Link>
            ))}
          </div>
        )}
      </div>

      {/* Notifications Panel */}
      <NotificationsPanel
        isOpen={showNotifications}
        onClose={() => {
          setShowNotifications(false);
          refetchNotificationCount();
          refetchNotifications();
        }}
      />
    </div>
  );
}

function SessionStatusIcon({ status, isWaiting }: { status: string; isWaiting?: boolean }) {
  if (isWaiting) {
    return <MessageCircleQuestion className="h-5 w-5 text-orange-500 animate-pulse" />;
  }

  switch (status) {
    case 'running':
      return <Play className="h-5 w-5 text-green-500" />;
    case 'paused':
      return <Clock className="h-5 w-5 text-yellow-500" />;
    case 'completed':
      return <CheckCircle className="h-5 w-5 text-muted-foreground" />;
    case 'error':
      return <AlertCircle className="h-5 w-5 text-red-500" />;
    default:
      return <Clock className="h-5 w-5 text-muted-foreground" />;
  }
}
