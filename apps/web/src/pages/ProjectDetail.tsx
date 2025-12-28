/**
 * Project Detail Page
 */

import { useState, useEffect, useMemo } from 'react';
import { useParams, Link, useNavigate } from 'react-router-dom';
import { useProject } from '@/hooks/useProjects';
import { useTickets } from '@/hooks/useTickets';
import { useStartSession, useSyncProject } from '@/hooks/useSessions';
import { KanbanBoard } from '@/components/kanban';
import { FilterChips } from '@/components/kanban/FilterChips';
import { CreateAdhocTicketModal } from '@/components/CreateAdhocTicketModal';
import { cn } from '@/lib/utils';
import {
  ArrowLeft,
  Play,
  Plus,
  RefreshCw,
  FileText,
} from 'lucide-react';
import type { Ticket } from '@/types/api';

// localStorage key for persisting filter selection
const getFilterStorageKey = (projectId: string) => `ticket-filter-${projectId}`;

// Extract prefix from external_id (e.g., "CSM-001" -> "CSM")
function extractPrefix(ticket: Ticket): string {
  if (!ticket.external_id) return 'ADHOC';
  const match = ticket.external_id.match(/^([A-Z]+)-/);
  return match?.[1] ?? 'ADHOC';
}

export function ProjectDetail() {
  const { projectId } = useParams<{ projectId: string }>();
  const navigate = useNavigate();
  const { data: project, isLoading: projectLoading } = useProject(projectId!);
  const { data: allTickets, isLoading: ticketsLoading } = useTickets(projectId!);
  const syncProject = useSyncProject();
  const startSession = useStartSession();
  const [showAdhocModal, setShowAdhocModal] = useState(false);

  // Filter state - empty array means "all"
  const [selectedPrefixes, setSelectedPrefixes] = useState<string[]>(() => {
    // Load from localStorage on initial render
    if (!projectId) return [];
    try {
      const stored = localStorage.getItem(getFilterStorageKey(projectId));
      return stored ? JSON.parse(stored) : [];
    } catch {
      return [];
    }
  });

  // Persist filter selection to localStorage
  useEffect(() => {
    if (projectId) {
      localStorage.setItem(getFilterStorageKey(projectId), JSON.stringify(selectedPrefixes));
    }
  }, [projectId, selectedPrefixes]);

  // Derive unique prefixes from tickets (client-side)
  const prefixes = useMemo(() => {
    if (!allTickets) return [];
    const prefixSet = new Set(allTickets.map(extractPrefix));
    return Array.from(prefixSet).sort();
  }, [allTickets]);

  // Filter tickets client-side based on selected prefixes
  const tickets = useMemo(() => {
    if (!allTickets) return [];
    if (selectedPrefixes.length === 0) return allTickets; // No filter = show all
    return allTickets.filter((ticket) => selectedPrefixes.includes(extractPrefix(ticket)));
  }, [allTickets, selectedPrefixes]);

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

  const handleSync = () => {
    syncProject.mutate(projectId!);
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
            onClick={handleSync}
            disabled={syncProject.isPending}
            className="inline-flex items-center gap-2 rounded-md border px-3 py-2 text-sm hover:bg-accent disabled:opacity-50"
            title="Sync tickets and sessions"
          >
            <RefreshCw className={cn('h-4 w-4', syncProject.isPending && 'animate-spin')} />
            Sync
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
      <div>
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-semibold">Sprint Board</h2>
        </div>
        {/* Filter Chips - only show if there are multiple prefixes */}
        {prefixes.length > 1 && (
          <div className="mb-4">
            <FilterChips
              prefixes={prefixes}
              selectedPrefixes={selectedPrefixes}
              onSelectionChange={setSelectedPrefixes}
            />
          </div>
        )}
        {tickets && tickets.length > 0 ? (
          <KanbanBoard tickets={tickets} projectId={projectId!} />
        ) : selectedPrefixes.length > 0 ? (
          /* Empty State with filter applied */
          <div className="rounded-lg border bg-card p-12 text-center">
            <FileText className="h-16 w-16 mx-auto text-muted-foreground mb-4" />
            <h3 className="text-lg font-medium mb-2">No matching tickets</h3>
            <p className="text-muted-foreground mb-4">
              No tickets match the current filter. Try selecting different prefixes or click "All" to show all tickets.
            </p>
          </div>
        ) : (
          /* Empty State - no tickets at all */
          <div className="rounded-lg border bg-card p-12 text-center">
            <FileText className="h-16 w-16 mx-auto text-muted-foreground mb-4" />
            <h3 className="text-lg font-medium mb-2">No tickets found</h3>
            <p className="text-muted-foreground mb-4">
              Sync tickets from your filesystem or add markdown files to your tickets path
            </p>
            <button
              onClick={handleSync}
              disabled={syncProject.isPending}
              className="inline-flex items-center gap-2 rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
            >
              <RefreshCw className={cn('h-4 w-4', syncProject.isPending && 'animate-spin')} />
              Sync
            </button>
          </div>
        )}
      </div>

      {/* Create Adhoc Ticket Modal */}
      <CreateAdhocTicketModal
        projectId={projectId!}
        isOpen={showAdhocModal}
        onClose={() => setShowAdhocModal(false)}
      />
    </div>
  );
}
