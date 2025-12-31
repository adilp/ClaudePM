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
      <div className="dashboard-loading">
        <div className="spinner" />
      </div>
    );
  }

  // Show error state if both API calls failed
  if (projectsError && sessionsError) {
    return (
      <div className="page page--dashboard">
        <div className="dashboard-error">
          <AlertCircle size={48} className="dashboard-error__icon" />
          <h2 className="dashboard-error__title">Unable to load dashboard</h2>
          <p className="dashboard-error__text">
            {projectsError instanceof Error
              ? projectsError.message
              : 'Failed to connect to server'}
          </p>
          <button
            onClick={() => {
              refetchProjects();
              refetchSessions();
            }}
            className="btn btn--primary btn--md"
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
    <div className="page page--dashboard">
      {/* Header */}
      <div className="dashboard-header">
        <h1 className="dashboard-header__title">Dashboard</h1>
        <p className="dashboard-header__subtitle">
          Overview of your projects and active sessions
        </p>
      </div>

      {/* Partial error banner */}
      {hasPartialError && (
        <div className="dashboard-error-banner">
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
            className="dashboard-error-banner__retry"
          >
            Retry
          </button>
        </div>
      )}

      {/* Stats */}
      <div className="stats-grid">
        <div className="stats-card">
          <div className="stats-card__icon stats-card__icon--primary">
            <FolderKanban size={24} />
          </div>
          <div className="stats-card__content">
            <p className="stats-card__label">Total Projects</p>
            <p className="stats-card__value">{projectsData?.pagination.total ?? 0}</p>
          </div>
        </div>

        <div className="stats-card">
          <div className="stats-card__icon stats-card__icon--success">
            <Play size={24} />
          </div>
          <div className="stats-card__content">
            <p className="stats-card__label">Active Sessions</p>
            <p className="stats-card__value">{activeSessions.length}</p>
          </div>
        </div>

        <div className="stats-card">
          <div
            className={`stats-card__icon ${
              waitingCount > 0 ? 'stats-card__icon--warning' : 'stats-card__icon--muted'
            }`}
          >
            {waitingCount > 0 ? (
              <MessageCircleQuestion size={24} />
            ) : (
              <Clock size={24} />
            )}
          </div>
          <div className="stats-card__content">
            <p className="stats-card__label">
              {waitingCount > 0 ? 'Waiting for Input' : 'Paused'}
            </p>
            <p className="stats-card__value">
              {waitingCount > 0
                ? waitingCount
                : activeSessions.filter((s) => s.status === 'paused').length}
            </p>
          </div>
        </div>

        <button
          onClick={() => setShowNotifications(true)}
          className="stats-card stats-card--clickable"
        >
          <div
            className={`stats-card__icon ${
              unreadCount > 0 ? 'stats-card__icon--error' : 'stats-card__icon--muted'
            }`}
          >
            <Bell size={24} />
            {unreadCount > 0 && (
              <span className="stats-card__badge">
                {unreadCount > 9 ? '9+' : unreadCount}
              </span>
            )}
          </div>
          <div className="stats-card__content">
            <p className="stats-card__label">Notifications</p>
            <p className="stats-card__value">{unreadCount}</p>
          </div>
        </button>
      </div>

      {/* Active Sessions */}
      {activeSessions.length > 0 && (
        <div className="dashboard-section">
          <h2 className="dashboard-section__title">Active Sessions</h2>
          <div className="active-sessions-list">
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
                  className={`active-session-card ${
                    isWaiting ? 'active-session-card--waiting' : ''
                  }`}
                >
                  <div className="active-session-card__left">
                    <SessionStatusIcon status={session.status} isWaiting={isWaiting} />
                    <div className="active-session-card__info">
                      <div className="active-session-card__title-row">
                        <p className="active-session-card__title" title={sessionTitle}>
                          {sessionTitle}
                        </p>
                        {isWaiting && (
                          <span className="active-session-card__waiting-badge">
                            Waiting for Input
                          </span>
                        )}
                      </div>
                      <div className="active-session-card__meta">
                        {projectName && (
                          <>
                            <span className="active-session-card__project">
                              {projectName}
                            </span>
                            <span className="active-session-card__separator">•</span>
                          </>
                        )}
                        <span className="active-session-card__context">
                          {session.context_percent !== null
                            ? `Context: ${session.context_percent}%`
                            : 'Starting...'}
                        </span>
                      </div>
                    </div>
                  </div>
                  <ArrowRight size={20} className="active-session-card__arrow" />
                </Link>
              );
            })}
          </div>
        </div>
      )}

      {/* No Active Sessions */}
      {activeSessions.length === 0 && (
        <div className="dashboard-section">
          <h2 className="dashboard-section__title">Active Sessions</h2>
          <div className="dashboard-empty">
            <Play size={32} className="dashboard-empty__icon" />
            <p className="dashboard-empty__text">No active sessions</p>
          </div>
        </div>
      )}

      {/* Projects List */}
      <div className="dashboard-section">
        <div className="dashboard-section__header">
          <h2 className="dashboard-section__title">Projects</h2>
          <Link to="/projects" className="dashboard-section__link">
            View all
          </Link>
        </div>

        {projectsData?.data.length === 0 ? (
          <div className="dashboard-empty dashboard-empty--large">
            <FolderKanban size={48} className="dashboard-empty__icon" />
            <h3 className="dashboard-empty__title">No projects yet</h3>
            <p className="dashboard-empty__text">
              Get started by creating your first project
            </p>
            <Link to="/projects/new" className="btn btn--primary btn--md">
              Create Project
            </Link>
          </div>
        ) : (
          <div className="projects-grid">
            {projectsData?.data.slice(0, 6).map((project) => (
              <Link
                key={project.id}
                to={`/projects/${project.id}`}
                className="project-card"
              >
                <h3 className="project-card__name">{project.name}</h3>
                <p className="project-card__path">{project.repo_path}</p>
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
        className="session-status-icon session-status-icon--waiting"
      />
    );
  }

  switch (status) {
    case 'running':
      return (
        <Play size={20} className="session-status-icon session-status-icon--running" />
      );
    case 'paused':
      return (
        <Clock size={20} className="session-status-icon session-status-icon--paused" />
      );
    case 'completed':
      return (
        <CheckCircle
          size={20}
          className="session-status-icon session-status-icon--completed"
        />
      );
    case 'error':
      return (
        <AlertCircle size={20} className="session-status-icon session-status-icon--error" />
      );
    default:
      return (
        <Clock size={20} className="session-status-icon session-status-icon--default" />
      );
  }
}
