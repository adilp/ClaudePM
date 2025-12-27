/**
 * Project Detail Page
 */

import { useParams, Link } from 'react-router-dom';
import { useProject } from '@/hooks/useProjects';
import { useTickets, useSyncTickets } from '@/hooks/useTickets';
import { useStartSession } from '@/hooks/useSessions';
import { cn } from '@/lib/utils';
import type { TicketState } from '@/types/api';
import {
  ArrowLeft,
  Play,
  RefreshCw,
  FileText,
  Clock,
  CheckCircle,
  AlertCircle,
} from 'lucide-react';

const stateConfig: Record<TicketState, { label: string; color: string; icon: typeof Clock }> = {
  backlog: { label: 'Backlog', color: 'bg-gray-500', icon: Clock },
  in_progress: { label: 'In Progress', color: 'bg-blue-500', icon: Play },
  review: { label: 'Review', color: 'bg-yellow-500', icon: AlertCircle },
  done: { label: 'Done', color: 'bg-green-500', icon: CheckCircle },
};

export function ProjectDetail() {
  const { projectId } = useParams<{ projectId: string }>();
  const { data: project, isLoading: projectLoading } = useProject(projectId!);
  const { data: tickets, isLoading: ticketsLoading } = useTickets(projectId!);
  const syncTickets = useSyncTickets();
  const startSession = useStartSession();

  if (projectLoading || ticketsLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" />
      </div>
    );
  }

  if (!project) {
    return (
      <div className="rounded-lg border border-destructive bg-destructive/10 p-6 text-center">
        <p className="text-destructive">Project not found</p>
      </div>
    );
  }

  // Group tickets by state
  const ticketsByState = tickets?.reduce(
    (acc, ticket) => {
      acc[ticket.state].push(ticket);
      return acc;
    },
    { backlog: [], in_progress: [], review: [], done: [] } as Record<TicketState, typeof tickets>
  );

  const handleSync = () => {
    syncTickets.mutate(projectId!);
  };

  const handleStartSession = () => {
    startSession.mutate({ project_id: projectId! });
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-start justify-between">
        <div>
          <Link
            to="/projects"
            className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground mb-2"
          >
            <ArrowLeft className="h-4 w-4" />
            Back to Projects
          </Link>
          <h1 className="text-2xl font-bold">{project.name}</h1>
          <p className="text-muted-foreground">{project.repo_path}</p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={handleSync}
            disabled={syncTickets.isPending}
            className="inline-flex items-center gap-2 rounded-md border px-3 py-2 text-sm hover:bg-accent disabled:opacity-50"
          >
            <RefreshCw className={cn('h-4 w-4', syncTickets.isPending && 'animate-spin')} />
            Sync Tickets
          </button>
          <button
            onClick={handleStartSession}
            disabled={startSession.isPending}
            className="inline-flex items-center gap-2 rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
          >
            <Play className="h-4 w-4" />
            Start Session
          </button>
        </div>
      </div>

      {/* Active Session */}
      {project.active_session && (
        <Link
          to={`/sessions/${project.active_session.id}`}
          className="flex items-center justify-between p-4 rounded-lg border bg-green-500/10 border-green-500/30 hover:bg-green-500/20 transition-colors"
        >
          <div className="flex items-center gap-3">
            <div className="rounded-full bg-green-500 p-2">
              <Play className="h-4 w-4 text-white" />
            </div>
            <div>
              <p className="font-medium">Active Session</p>
              <p className="text-sm text-muted-foreground">
                Status: {project.active_session.status}
                {project.active_session.context_percent !== null && (
                  <> • Context: {project.active_session.context_percent}%</>
                )}
              </p>
            </div>
          </div>
        </Link>
      )}

      {/* Ticket Counts */}
      <div className="grid gap-4 md:grid-cols-4">
        {(Object.entries(stateConfig) as [TicketState, typeof stateConfig.backlog][]).map(
          ([state, config]) => (
            <div key={state} className="rounded-lg border bg-card p-4">
              <div className="flex items-center gap-2 mb-2">
                <div className={cn('h-2 w-2 rounded-full', config.color)} />
                <span className="text-sm font-medium">{config.label}</span>
              </div>
              <p className="text-2xl font-bold">
                {project.ticket_counts[state]}
              </p>
            </div>
          )
        )}
      </div>

      {/* Tickets by State */}
      {ticketsByState && (
        <div className="space-y-6">
          {(Object.entries(stateConfig) as [TicketState, typeof stateConfig.backlog][]).map(
            ([state, config]) => {
              const stateTickets = ticketsByState[state];
              if (stateTickets.length === 0) return null;

              return (
                <div key={state}>
                  <h2 className="flex items-center gap-2 text-lg font-semibold mb-3">
                    <div className={cn('h-3 w-3 rounded-full', config.color)} />
                    {config.label}
                    <span className="text-muted-foreground font-normal">
                      ({stateTickets.length})
                    </span>
                  </h2>
                  <div className="space-y-2">
                    {stateTickets.map((ticket) => (
                      <Link
                        key={ticket.id}
                        to={`/projects/${projectId}/tickets/${ticket.id}`}
                        className="flex items-center gap-3 p-3 rounded-lg border bg-card hover:bg-accent/50 transition-colors"
                      >
                        <FileText className="h-5 w-5 text-muted-foreground" />
                        <div className="flex-1 min-w-0">
                          <p className="font-medium truncate">{ticket.title}</p>
                          <p className="text-sm text-muted-foreground">
                            {ticket.external_id}
                          </p>
                        </div>
                      </Link>
                    ))}
                  </div>
                </div>
              );
            }
          )}
        </div>
      )}

      {/* Empty State */}
      {tickets?.length === 0 && (
        <div className="rounded-lg border bg-card p-12 text-center">
          <FileText className="h-16 w-16 mx-auto text-muted-foreground mb-4" />
          <h3 className="text-lg font-medium mb-2">No tickets found</h3>
          <p className="text-muted-foreground mb-4">
            Sync tickets from your filesystem or add markdown files to your tickets path
          </p>
          <button
            onClick={handleSync}
            disabled={syncTickets.isPending}
            className="inline-flex items-center gap-2 rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
          >
            <RefreshCw className={cn('h-4 w-4', syncTickets.isPending && 'animate-spin')} />
            Sync Tickets
          </button>
        </div>
      )}
    </div>
  );
}
