/**
 * Dashboard Page
 * Overview of all projects and active sessions
 */

import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { useProjects } from '../hooks/useProjects';
import { useSessions } from '../hooks/useSessions';
import {
  useNotificationCount,
  useNotifications,
} from '../hooks/useNotifications';
import { useWebSocket } from '../hooks/useWebSocket';
import { NotificationsPanel } from '../components/NotificationsPanel';
import { cn } from '../lib/utils';
import {
  FolderKanban,
  Play,
  Clock,
  CheckCircle,
  AlertCircle,
  ArrowRight,
  Bell,
  MessageCircleQuestion,
  RefreshCw,
} from 'lucide-react';

export function Dashboard() {
  const {
    data: projectsData,
    isLoading: projectsLoading,
    error: projectsError,
    refetch: refetchProjects,
  } = useProjects();
  const {
    data: sessions,
    isLoading: sessionsLoading,
    error: sessionsError,
    refetch: refetchSessions,
  } = useSessions();
  const { data: notificationCount, refetch: refetchNotificationCount } =
    useNotificationCount();
  const { data: notifications, refetch: refetchNotifications } = useNotifications();
  const { lastMessage } = useWebSocket();

  // Track waiting state for each session
  const [waitingSessions, setWaitingSessions] = useState<Set<string>>(new Set());
  const [showNotifications, setShowNotifications] = useState(false);

  const activeSessions =
    sessions?.filter((s) => s.status === 'running' || s.status === 'paused') ?? [];

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
      <div className="flex items-center justify-center min-h-[300px]">
        <div className="w-5 h-5 border-2 border-surface-tertiary border-t-indigo-500 rounded-full animate-spin" />
      </div>
    );
  }

  // Show error state if both API calls failed
  if (projectsError && sessionsError) {
    return (
      <div className="p-6 max-w-[1200px] mx-auto">
        <div className="flex flex-col items-center justify-center py-16 px-8 text-center min-h-[400px]">
          <AlertCircle size={48} className="text-red-500 mb-6" />
          <h2 className="text-xl font-semibold text-content-primary mb-2">Unable to load dashboard</h2>
          <p className="text-sm text-content-secondary mb-6 max-w-[400px]">
            {projectsError instanceof Error
              ? projectsError.message
              : 'Failed to connect to server'}
          </p>
          <button
            onClick={() => {
              refetchProjects();
              refetchSessions();
            }}
            className="inline-flex items-center justify-center gap-2 px-4 py-2 bg-indigo-500 text-white rounded-lg text-sm font-medium hover:bg-indigo-600 transition-colors"
          >
            <RefreshCw size={16} />
            Retry
          </button>
        </div>
      </div>
    );
  }

  const unreadCount = notificationCount?.count ?? 0;
  const waitingCount = waitingSessions.size;

  // Check for partial errors
  const hasPartialError = projectsError || sessionsError;

  return (
    <div className="p-6 max-w-[1200px] mx-auto">
      {/* Header */}
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-content-primary">Dashboard</h1>
        <p className="text-sm text-content-secondary mt-1">
          Overview of your projects and active sessions
        </p>
      </div>

      {/* Partial error banner */}
      {hasPartialError && (
        <div className="flex items-center gap-3 px-4 py-3 mb-6 bg-red-500/10 border border-red-500/30 rounded-lg text-red-500 text-sm">
          <AlertCircle size={16} />
          <span>
            {projectsError
              ? 'Failed to load projects'
              : 'Failed to load sessions'}
          </span>
          <button
            onClick={() => {
              if (projectsError) refetchProjects();
              if (sessionsError) refetchSessions();
            }}
            className="ml-auto px-3 py-1 bg-transparent border border-red-500 rounded text-xs font-medium cursor-pointer transition-colors hover:bg-red-500/10"
          >
            Retry
          </button>
        </div>
      )}

      {/* Stats */}
      <div className="grid grid-cols-4 gap-4 mb-8 max-[900px]:grid-cols-2 max-[500px]:grid-cols-1">
        <div className="rounded-xl border border-line bg-surface-secondary p-6">
          <div className="flex items-center gap-4">
            <div className="shrink-0 w-12 h-12 rounded-full bg-indigo-500/15 text-indigo-500 flex items-center justify-center">
              <FolderKanban size={24} />
            </div>
            <div>
              <p className="text-sm text-content-secondary">Total Projects</p>
              <p className="text-2xl font-bold text-content-primary">{projectsData?.pagination.total ?? 0}</p>
            </div>
          </div>
        </div>

        <div className="rounded-xl border border-line bg-surface-secondary p-6">
          <div className="flex items-center gap-4">
            <div className="shrink-0 w-12 h-12 rounded-full bg-green-500/15 text-green-500 flex items-center justify-center">
              <Play size={24} />
            </div>
            <div>
              <p className="text-sm text-content-secondary">Active Sessions</p>
              <p className="text-2xl font-bold text-content-primary">{activeSessions.length}</p>
            </div>
          </div>
        </div>

        <div className="rounded-xl border border-line bg-surface-secondary p-6">
          <div className="flex items-center gap-4">
            <div
              className={cn(
                'shrink-0 w-12 h-12 rounded-full flex items-center justify-center',
                waitingCount > 0
                  ? 'bg-amber-500/15 text-amber-500'
                  : 'bg-surface-tertiary text-content-muted'
              )}
            >
              {waitingCount > 0 ? (
                <MessageCircleQuestion size={24} />
              ) : (
                <Clock size={24} />
              )}
            </div>
            <div>
              <p className="text-sm text-content-secondary">
                {waitingCount > 0 ? 'Waiting for Input' : 'Paused'}
              </p>
              <p className="text-2xl font-bold text-content-primary">
                {waitingCount > 0
                  ? waitingCount
                  : activeSessions.filter((s) => s.status === 'paused').length}
              </p>
            </div>
          </div>
        </div>

        <button
          onClick={() => setShowNotifications(true)}
          className="rounded-xl border border-line bg-surface-secondary p-6 text-left cursor-pointer transition-colors hover:bg-surface-tertiary hover:border-indigo-500"
        >
          <div className="flex items-center gap-4">
            <div
              className={cn(
                'relative shrink-0 w-12 h-12 rounded-full flex items-center justify-center',
                unreadCount > 0
                  ? 'bg-red-500/15 text-red-500'
                  : 'bg-surface-tertiary text-content-muted'
              )}
            >
              <Bell size={24} />
              {unreadCount > 0 && (
                <span className="absolute -top-1 -right-1 min-w-[20px] h-5 px-1.5 bg-red-500 text-white text-[10px] font-semibold rounded-full flex items-center justify-center">
                  {unreadCount > 9 ? '9+' : unreadCount}
                </span>
              )}
            </div>
            <div>
              <p className="text-sm text-content-secondary">Notifications</p>
              <p className="text-2xl font-bold text-content-primary">{unreadCount}</p>
            </div>
          </div>
        </button>
      </div>

      {/* Active Sessions */}
      {activeSessions.length > 0 && (
        <div className="mb-8">
          <h2 className="text-lg font-semibold text-content-primary mb-4">Active Sessions</h2>
          <div className="flex flex-col gap-3">
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
                    'flex items-center justify-between p-4 bg-surface-secondary border border-line rounded-lg no-underline transition-colors',
                    isWaiting
                      ? 'border-amber-500 bg-amber-500/5 hover:bg-amber-500/10'
                      : 'hover:bg-surface-tertiary hover:border-indigo-500'
                  )}
                >
                  <div className="flex items-center gap-4 min-w-0">
                    <SessionStatusIcon status={session.status} isWaiting={isWaiting} />
                    <div className="min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <p className="font-medium text-content-primary truncate max-w-[300px]" title={sessionTitle}>
                          {sessionTitle}
                        </p>
                        {isWaiting && (
                          <span className="inline-flex px-2 py-0.5 text-[10px] font-medium bg-amber-500/15 text-amber-500 rounded-full shrink-0">
                            Waiting for Input
                          </span>
                        )}
                      </div>
                      <div className="flex items-center gap-2 text-[13px] text-content-secondary mt-1">
                        {projectName && (
                          <>
                            <span className="truncate max-w-[200px]">
                              {projectName}
                            </span>
                            <span className="text-content-muted">•</span>
                          </>
                        )}
                        <span className="text-content-muted">
                          {session.context_percent !== null
                            ? `Context: ${session.context_percent}%`
                            : 'Starting...'}
                        </span>
                      </div>
                    </div>
                  </div>
                  <ArrowRight size={20} className="text-content-muted shrink-0" />
                </Link>
              );
            })}
          </div>
        </div>
      )}

      {/* No Active Sessions */}
      {activeSessions.length === 0 && (
        <div className="mb-8">
          <h2 className="text-lg font-semibold text-content-primary mb-4">Active Sessions</h2>
          <div className="flex flex-col items-center justify-center p-8 bg-surface-secondary border border-line rounded-xl text-center">
            <Play size={32} className="text-content-muted mb-4" />
            <p className="text-sm text-content-secondary">No active sessions</p>
          </div>
        </div>
      )}

      {/* Projects List */}
      <div className="mb-8">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-semibold text-content-primary">Projects</h2>
          <Link to="/projects" className="text-sm text-indigo-500 no-underline hover:underline">
            View all
          </Link>
        </div>

        {projectsData?.data.length === 0 ? (
          <div className="flex flex-col items-center justify-center p-12 bg-surface-secondary border border-line rounded-xl text-center">
            <FolderKanban size={48} className="text-content-muted mb-4" />
            <h3 className="text-base font-semibold text-content-primary mb-2">No projects yet</h3>
            <p className="text-sm text-content-secondary mb-4">
              Get started by creating your first project
            </p>
            <Link to="/projects/new" className="inline-flex items-center justify-center gap-2 px-4 py-2 bg-indigo-500 text-white rounded-lg text-sm font-medium hover:bg-indigo-600 transition-colors">
              Create Project
            </Link>
          </div>
        ) : (
          <div className="grid grid-cols-3 gap-4 max-[900px]:grid-cols-2 max-[500px]:grid-cols-1">
            {projectsData?.data.slice(0, 6).map((project) => (
              <Link
                key={project.id}
                to={`/projects/${project.id}`}
                className="block p-4 bg-surface-secondary border border-line rounded-lg no-underline transition-colors hover:bg-surface-tertiary hover:border-indigo-500"
              >
                <h3 className="text-sm font-semibold text-content-primary mb-1">{project.name}</h3>
                <p className="text-xs text-content-muted truncate">{project.repo_path}</p>
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

function SessionStatusIcon({
  status,
  isWaiting,
}: {
  status: string;
  isWaiting?: boolean;
}) {
  if (isWaiting) {
    return (
      <MessageCircleQuestion
        size={20}
        className="text-amber-500 animate-pulse"
      />
    );
  }

  switch (status) {
    case 'running':
      return <Play size={20} className="text-green-500" />;
    case 'paused':
      return <Clock size={20} className="text-amber-500" />;
    case 'completed':
      return <CheckCircle size={20} className="text-content-muted" />;
    case 'error':
      return <AlertCircle size={20} className="text-red-500" />;
    default:
      return <Clock size={20} className="text-content-muted" />;
  }
}
