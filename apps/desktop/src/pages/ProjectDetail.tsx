/**
 * ProjectDetail Page
 * Project view with kanban board for ticket management
 */

import { useState, useMemo, useCallback, useEffect } from 'react';
import { useParams, Link, useNavigate } from 'react-router-dom';
import { useProject } from '../hooks/useProjects';
import { useTickets, useStartTicket } from '../hooks/useTickets';
import { useSessions, useSyncProject } from '../hooks/useSessions';
import { useShortcutScope } from '../shortcuts';
import { useUIStore } from '../stores/uiStore';
import { KanbanBoard } from '../components/kanban/KanbanBoard';
import { CreateAdhocTicketModal } from '../components/CreateAdhocTicketModal';
import { StatusBadge } from '../components/StatusBadge';
import { Button } from '../components/ui/button';
import { toast } from '../hooks/use-toast';
import type { Session, Ticket, TicketState } from '../types/api';

// Column order for keyboard navigation
const COLUMN_STATES: TicketState[] = ['backlog', 'in_progress', 'review', 'done'];

// Context meter component for session context percentage
function ContextMeter({ value }: { value: number | null }) {
  if (value === null) return null;

  const getColorClass = () => {
    if (value >= 80) return 'bg-red-500';
    if (value >= 60) return 'bg-yellow-500';
    return 'bg-green-500';
  };

  return (
    <div className="flex items-center gap-2">
      <div className="w-16 h-1 bg-surface-tertiary rounded-full overflow-hidden">
        <div
          className={`h-full ${getColorClass()} transition-all`}
          style={{ width: `${value}%` }}
        />
      </div>
      <span className="text-xs text-content-muted">{value}%</span>
    </div>
  );
}

// Active session indicator component
function ActiveSessionIndicator({
  sessions,
}: {
  projectId: string;
  sessions: Session[] | undefined;
}) {
  const activeSession = sessions?.find(
    (s) => s.status === 'running' || s.status === 'paused'
  );

  if (!activeSession) {
    return null; // Don't show anything if no active session
  }

  return (
    <Link
      to={`/sessions/${activeSession.id}`}
      className="flex items-center justify-between p-4 bg-surface-secondary border border-line rounded-xl hover:border-indigo-500 transition-colors"
    >
      <div className="flex items-center gap-3">
        <div className="relative">
          <div className="absolute inset-0 bg-green-500 rounded-full animate-ping opacity-20" />
          <div className="relative w-2 h-2 bg-green-500 rounded-full" />
        </div>
        <StatusBadge status={activeSession.status} />
        <span className="text-sm font-medium text-content-primary">
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
  const startTicketMutation = useStartTicket();
  const [showAdhocModal, setShowAdhocModal] = useState(false);

  // Keyboard navigation state
  const {
    selectedColumnIndex,
    selectedTicketIndex,
    setSelectedColumn,
    setSelectedTicket,
    resetKanbanSelection,
  } = useUIStore();

  // Group tickets by state for keyboard navigation
  const ticketsByState = useMemo(() => {
    if (!tickets) return {} as Record<TicketState, Ticket[]>;
    return COLUMN_STATES.reduce(
      (acc, state) => {
        acc[state] = tickets.filter((t) => t.state === state);
        return acc;
      },
      {} as Record<TicketState, Ticket[]>
    );
  }, [tickets]);

  // Get currently selected ticket
  const selectedTicket = useMemo(() => {
    const currentState = COLUMN_STATES[selectedColumnIndex];
    const columnTickets = ticketsByState[currentState] || [];
    return columnTickets[selectedTicketIndex] || null;
  }, [selectedColumnIndex, selectedTicketIndex, ticketsByState]);

  // Reset selection when leaving page
  useEffect(() => {
    return () => resetKanbanSelection();
  }, [resetKanbanSelection]);

  // Keyboard navigation handlers
  const handleNextTicket = useCallback(() => {
    const currentState = COLUMN_STATES[selectedColumnIndex];
    const columnTickets = ticketsByState[currentState] || [];
    if (selectedTicketIndex < columnTickets.length - 1) {
      setSelectedTicket(selectedTicketIndex + 1);
    }
  }, [selectedColumnIndex, selectedTicketIndex, ticketsByState, setSelectedTicket]);

  const handlePrevTicket = useCallback(() => {
    if (selectedTicketIndex > 0) {
      setSelectedTicket(selectedTicketIndex - 1);
    }
  }, [selectedTicketIndex, setSelectedTicket]);

  const handleNextColumn = useCallback(() => {
    if (selectedColumnIndex < COLUMN_STATES.length - 1) {
      setSelectedColumn(selectedColumnIndex + 1);
    }
  }, [selectedColumnIndex, setSelectedColumn]);

  const handlePrevColumn = useCallback(() => {
    if (selectedColumnIndex > 0) {
      setSelectedColumn(selectedColumnIndex - 1);
    }
  }, [selectedColumnIndex, setSelectedColumn]);

  const handleOpenTicket = useCallback(() => {
    if (selectedTicket) {
      navigate(`/projects/${projectId}/tickets/${selectedTicket.id}`);
    }
  }, [selectedTicket, projectId, navigate]);

  const handleStartTicket = useCallback(() => {
    if (selectedTicket) {
      startTicketMutation.mutate(selectedTicket.id, {
        onSuccess: (result) => {
          toast.success('Session started', `Working on ${selectedTicket.title}`);
          navigate(`/sessions/${result.session.id}`);
        },
        onError: (err: Error) => {
          toast.error('Failed to start session', err.message);
        },
      });
    }
  }, [selectedTicket, startTicketMutation, navigate]);

  const handleNewAdhoc = useCallback(() => {
    setShowAdhocModal(true);
  }, []);

  // Register keyboard shortcuts for this page
  useShortcutScope('projectDetail', {
    selectNextTicket: handleNextTicket,
    selectPrevTicket: handlePrevTicket,
    nextColumn: handleNextColumn,
    prevColumn: handlePrevColumn,
    openTicket: handleOpenTicket,
    startTicket: handleStartTicket,
    newAdhoc: handleNewAdhoc,
    sync: () => handleSync(),
  });

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
      <div className="flex flex-col items-center justify-center min-h-[400px] gap-4">
        <div className="w-8 h-8 border-2 border-surface-tertiary border-t-indigo-500 rounded-full animate-spin" />
        <p className="text-content-secondary">Loading project...</p>
      </div>
    );
  }

  // Error state
  if (projectError) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[400px] gap-4 text-center p-8">
        <svg
          className="h-12 w-12 text-red-500"
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
        <h2 className="text-xl font-semibold text-content-primary">Failed to load project</h2>
        <p className="text-content-secondary">
          {projectError instanceof Error
            ? projectError.message
            : 'An error occurred'}
        </p>
        <Button variant="secondary" onClick={() => navigate('/projects')}>
          Back to Projects
        </Button>
      </div>
    );
  }

  // Project not found
  if (!project) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[400px] gap-4 text-center p-8">
        <svg
          className="h-12 w-12 text-content-muted"
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
        <h2 className="text-xl font-semibold text-content-primary">Project not found</h2>
        <p className="text-content-secondary">The project you're looking for doesn't exist.</p>
        <Button variant="secondary" onClick={() => navigate('/projects')}>
          Back to Projects
        </Button>
      </div>
    );
  }

  return (
    <div className="p-6 max-w-[1600px] mx-auto space-y-6">
      {/* Header */}
      <header className="flex flex-col lg:flex-row lg:items-start lg:justify-between gap-4">
        <div className="space-y-2">
          <Link to="/projects" className="inline-flex items-center gap-2 text-sm text-content-secondary hover:text-content-primary transition-colors">
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
          <h1 className="text-2xl font-bold text-content-primary">{project.name}</h1>
          <p className="text-sm text-content-muted">{project.repo_path}</p>
        </div>
        <div className="flex items-center gap-2">
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
              className={syncProject.isPending ? 'animate-spin' : ''}
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
      <section className="space-y-4">
        <div className="flex items-center justify-center gap-4">
          <h2 className="text-lg font-semibold text-content-primary">Sprint Board</h2>
          {tickets && (
            <span className="text-sm text-content-muted">
              {tickets.length} ticket{tickets.length !== 1 ? 's' : ''}
            </span>
          )}
        </div>

        {/* Filter chips are handled inside KanbanBoard component */}
        {tickets && tickets.length > 0 ? (
          <KanbanBoard
            tickets={tickets}
            projectId={projectId!}
            selectedColumnIndex={selectedColumnIndex}
            selectedTicketIndex={selectedTicketIndex}
          />
        ) : (
          /* Empty state - no tickets */
          <div className="flex flex-col items-center justify-center py-16 text-center">
            <svg
              className="h-12 w-12 text-content-muted mb-4"
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
            <h3 className="text-lg font-semibold text-content-primary mb-2">No tickets found</h3>
            <p className="text-content-secondary mb-6 max-w-md">
              Sync to discover tickets from your filesystem or create an adhoc
              ticket to get started.
            </p>
            <div className="flex items-center gap-3">
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
                  className={syncProject.isPending ? 'animate-spin' : ''}
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
