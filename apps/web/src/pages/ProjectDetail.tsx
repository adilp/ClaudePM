/**
 * Project Detail Page
 */

import { useState } from 'react';
import { useParams, Link, useNavigate } from 'react-router-dom';
import { useProject } from '@/hooks/useProjects';
import { useTickets, useSyncTickets } from '@/hooks/useTickets';
import { useStartSession, useSyncSessions } from '@/hooks/useSessions';
import { KanbanBoard } from '@/components/kanban';
import { CreateAdhocTicketModal } from '@/components/CreateAdhocTicketModal';
import { cn } from '@/lib/utils';
import {
  ArrowLeft,
  Play,
  Plus,
  RefreshCw,
  FileText,
  RotateCcw,
} from 'lucide-react';

export function ProjectDetail() {
  const { projectId } = useParams<{ projectId: string }>();
  const navigate = useNavigate();
  const { data: project, isLoading: projectLoading } = useProject(projectId!);
  const { data: tickets, isLoading: ticketsLoading } = useTickets(projectId!);
  const syncTickets = useSyncTickets();
  const syncSessions = useSyncSessions();
  const startSession = useStartSession();
  const [showAdhocModal, setShowAdhocModal] = useState(false);

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

  const handleSyncTickets = () => {
    syncTickets.mutate(projectId!);
  };

  const handleSyncSessions = () => {
    syncSessions.mutate(projectId!);
  };

  const handleStartSession = () => {
    startSession.mutate(
      { project_id: projectId! },
      {
        onSuccess: (session) => {
          navigate(`/sessions/${session.id}`);
        },
      }
    );
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
            onClick={handleSyncSessions}
            disabled={syncSessions.isPending}
            className="inline-flex items-center gap-2 rounded-md border px-3 py-2 text-sm hover:bg-accent disabled:opacity-50"
            title="Sync session state with tmux"
          >
            <RotateCcw className={cn('h-4 w-4', syncSessions.isPending && 'animate-spin')} />
            Sync Sessions
          </button>
          <button
            onClick={handleSyncTickets}
            disabled={syncTickets.isPending}
            className="inline-flex items-center gap-2 rounded-md border px-3 py-2 text-sm hover:bg-accent disabled:opacity-50"
          >
            <RefreshCw className={cn('h-4 w-4', syncTickets.isPending && 'animate-spin')} />
            Sync Tickets
          </button>
          <button
            onClick={() => setShowAdhocModal(true)}
            className="inline-flex items-center gap-2 rounded-md border px-3 py-2 text-sm hover:bg-accent"
          >
            <Plus className="h-4 w-4" />
            New Adhoc Ticket
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

      {/* Sprint Board */}
      {tickets && tickets.length > 0 ? (
        <div>
          <h2 className="text-lg font-semibold mb-4">Sprint Board</h2>
          <KanbanBoard tickets={tickets} projectId={projectId!} />
        </div>
      ) : (
        /* Empty State */
        <div className="rounded-lg border bg-card p-12 text-center">
          <FileText className="h-16 w-16 mx-auto text-muted-foreground mb-4" />
          <h3 className="text-lg font-medium mb-2">No tickets found</h3>
          <p className="text-muted-foreground mb-4">
            Sync tickets from your filesystem or add markdown files to your tickets path
          </p>
          <button
            onClick={handleSyncTickets}
            disabled={syncTickets.isPending}
            className="inline-flex items-center gap-2 rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
          >
            <RefreshCw className={cn('h-4 w-4', syncTickets.isPending && 'animate-spin')} />
            Sync Tickets
          </button>
        </div>
      )}

      {/* Create Adhoc Ticket Modal */}
      <CreateAdhocTicketModal
        projectId={projectId!}
        isOpen={showAdhocModal}
        onClose={() => setShowAdhocModal(false)}
      />
    </div>
  );
}
