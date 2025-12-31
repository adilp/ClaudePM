/**
 * ProjectDetail Page
 * Project view with kanban board for ticket management
 */

import { useState } from 'react';
import { useParams, Link, useNavigate } from 'react-router-dom';
import { useProject } from '../hooks/useProjects';
import { useTickets } from '../hooks/useTickets';
import { useSessions, useSyncProject, useStartSession } from '../hooks/useSessions';
import { KanbanBoard } from '../components/kanban/KanbanBoard';
import { CreateAdhocTicketModal } from '../components/CreateAdhocTicketModal';
import { StatusBadge } from '../components/StatusBadge';
import { Button } from '../components/ui/button';
import { toast } from '../hooks/use-toast';
import type { Session } from '../types/api';

// Context meter component for session context percentage
function ContextMeter({ value }: { value: number | null }) {
  if (value === null) return null;

  const getColor = () => {
    if (value >= 80) return 'var(--color-error)';
    if (value >= 60) return 'var(--color-warning)';
    return 'var(--color-success)';
  };

  return (
    <div className="context-meter">
      <div className="context-meter__bar">
        <div
          className="context-meter__fill"
          style={{ width: `${value}%`, backgroundColor: getColor() }}
        />
      </div>
      <span className="context-meter__label">{value}%</span>
    </div>
  );
}

// Active session indicator component
function ActiveSessionIndicator({
  projectId,
  sessions,
}: {
  projectId: string;
  sessions: Session[] | undefined;
}) {
  const navigate = useNavigate();
  const startSession = useStartSession();

  const activeSession = sessions?.find(
    (s) => s.status === 'running' || s.status === 'paused'
  );

  const handleStartSession = () => {
    startSession.mutate(
      { project_id: projectId },
      {
        onSuccess: (session) => {
          toast.success('Session started');
          navigate(`/sessions/${session.id}`);
        },
        onError: (err) => {
          toast.error(
            'Failed to start session',
            err instanceof Error ? err.message : 'Unknown error'
          );
        },
      }
    );
  };

  if (!activeSession) {
    return (
      <div className="session-indicator session-indicator--empty">
        <div className="session-indicator__content">
          <svg
            width="20"
            height="20"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <circle cx="12" cy="12" r="10" />
            <line x1="12" y1="8" x2="12" y2="12" />
            <line x1="12" y1="16" x2="12.01" y2="16" />
          </svg>
          <span>No active session</span>
        </div>
        <Button
          variant="primary"
          onClick={handleStartSession}
          disabled={startSession.isPending}
        >
          <svg
            width="16"
            height="16"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <polygon points="5 3 19 12 5 21 5 3" />
          </svg>
          {startSession.isPending ? 'Starting...' : 'Start Session'}
        </Button>
      </div>
    );
  }

  return (
    <Link
      to={`/sessions/${activeSession.id}`}
      className="session-indicator session-indicator--active"
    >
      <div className="session-indicator__content">
        <div className="session-indicator__pulse" />
        <StatusBadge status={activeSession.status} />
        <span className="session-indicator__label">
          {activeSession.ticket?.external_id ||
            activeSession.ticket?.title ||
            'Adhoc Session'}
        </span>
        <ContextMeter value={activeSession.context_percent} />
      </div>
      <Button variant="secondary" size="sm">
        <svg
          width="16"
          height="16"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <circle cx="12" cy="12" r="10" />
          <polygon points="10 8 16 12 10 16 10 8" />
        </svg>
        Focus
      </Button>
    </Link>
  );
}

export function ProjectDetail() {
  const { projectId } = useParams<{ projectId: string }>();
  const navigate = useNavigate();
  const { data: project, isLoading: projectLoading, error: projectError } = useProject(projectId!);
  const { data: tickets, isLoading: ticketsLoading } = useTickets(projectId!);
  const { data: sessions } = useSessions(projectId!);
  const syncProject = useSyncProject();
  const [showAdhocModal, setShowAdhocModal] = useState(false);

  const handleSync = () => {
    syncProject.mutate(projectId!, {
      onSuccess: () => {
        toast.success('Sync complete', 'Tickets and sessions refreshed');
      },
      onError: (err) => {
        toast.error(
          'Sync failed',
          err instanceof Error ? err.message : 'Unknown error'
        );
      },
    });
  };

  // Loading state
  if (projectLoading || ticketsLoading) {
    return (
      <div className="page page--loading">
        <div className="loading-spinner" />
        <p>Loading project...</p>
      </div>
    );
  }

  // Error state
  if (projectError) {
    return (
      <div className="page page--error">
        <div className="error-content">
          <svg
            width="48"
            height="48"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <circle cx="12" cy="12" r="10" />
            <line x1="15" y1="9" x2="9" y2="15" />
            <line x1="9" y1="9" x2="15" y2="15" />
          </svg>
          <h2>Failed to load project</h2>
          <p>
            {projectError instanceof Error
              ? projectError.message
              : 'An error occurred'}
          </p>
          <Button variant="secondary" onClick={() => navigate('/projects')}>
            Back to Projects
          </Button>
        </div>
      </div>
    );
  }

  // Project not found
  if (!project) {
    return (
      <div className="page page--error">
        <div className="error-content">
          <svg
            width="48"
            height="48"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z" />
            <line x1="9" y1="14" x2="15" y2="14" />
          </svg>
          <h2>Project not found</h2>
          <p>The project you're looking for doesn't exist.</p>
          <Button variant="secondary" onClick={() => navigate('/projects')}>
            Back to Projects
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="page project-detail">
      {/* Header */}
      <header className="project-detail__header">
        <div className="project-detail__header-left">
          <Link to="/projects" className="back-link">
            <svg
              width="16"
              height="16"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <line x1="19" y1="12" x2="5" y2="12" />
              <polyline points="12 19 5 12 12 5" />
            </svg>
            Back to Projects
          </Link>
          <h1 className="project-detail__title">{project.name}</h1>
          <p className="project-detail__path">{project.repo_path}</p>
        </div>
        <div className="project-detail__header-actions">
          <Button
            variant="secondary"
            onClick={handleSync}
            disabled={syncProject.isPending}
          >
            <svg
              width="16"
              height="16"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
              className={syncProject.isPending ? 'spin' : ''}
            >
              <polyline points="23 4 23 10 17 10" />
              <polyline points="1 20 1 14 7 14" />
              <path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15" />
            </svg>
            {syncProject.isPending ? 'Syncing...' : 'Sync'}
          </Button>
          <Button variant="secondary" onClick={() => setShowAdhocModal(true)}>
            <svg
              width="16"
              height="16"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <line x1="12" y1="5" x2="12" y2="19" />
              <line x1="5" y1="12" x2="19" y2="12" />
            </svg>
            New Adhoc
          </Button>
        </div>
      </header>

      {/* Active Session Indicator */}
      <ActiveSessionIndicator projectId={projectId!} sessions={sessions} />

      {/* Sprint Board Section */}
      <section className="project-detail__board">
        <div className="project-detail__board-header">
          <h2>Sprint Board</h2>
          {tickets && (
            <span className="project-detail__ticket-count">
              {tickets.length} ticket{tickets.length !== 1 ? 's' : ''}
            </span>
          )}
        </div>

        {/* Filter chips are handled inside KanbanBoard component */}
        {tickets && tickets.length > 0 ? (
          <KanbanBoard tickets={tickets} projectId={projectId!} />
        ) : (
          /* Empty state - no tickets */
          <div className="empty-state">
            <svg
              width="48"
              height="48"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.5"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
              <polyline points="14 2 14 8 20 8" />
              <line x1="12" y1="18" x2="12" y2="12" />
              <line x1="9" y1="15" x2="15" y2="15" />
            </svg>
            <h3>No tickets found</h3>
            <p>
              Sync to discover tickets from your filesystem or create an adhoc
              ticket to get started.
            </p>
            <div className="empty-state__actions">
              <Button
                variant="primary"
                onClick={handleSync}
                disabled={syncProject.isPending}
              >
                <svg
                  width="16"
                  height="16"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  className={syncProject.isPending ? 'spin' : ''}
                >
                  <polyline points="23 4 23 10 17 10" />
                  <polyline points="1 20 1 14 7 14" />
                  <path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15" />
                </svg>
                {syncProject.isPending ? 'Syncing...' : 'Sync Tickets'}
              </Button>
              <Button variant="secondary" onClick={() => setShowAdhocModal(true)}>
                <svg
                  width="16"
                  height="16"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                >
                  <line x1="12" y1="5" x2="12" y2="19" />
                  <line x1="5" y1="12" x2="19" y2="12" />
                </svg>
                Create Adhoc
              </Button>
            </div>
          </div>
        )}
      </section>

      {/* Create Adhoc Ticket Modal */}
      <CreateAdhocTicketModal
        projectId={projectId!}
        isOpen={showAdhocModal}
        onClose={() => setShowAdhocModal(false)}
      />
    </div>
  );
}
