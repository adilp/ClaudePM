/**
 * Dashboard Page
 * Overview of all projects and active sessions
 */

import { Link } from 'react-router-dom';
import { useProjects } from '@/hooks/useProjects';
import { useSessions } from '@/hooks/useSessions';
import {
  FolderKanban,
  Play,
  Clock,
  CheckCircle,
  AlertCircle,
  ArrowRight,
} from 'lucide-react';

export function Dashboard() {
  const { data: projectsData, isLoading: projectsLoading } = useProjects();
  const { data: sessions, isLoading: sessionsLoading } = useSessions();

  const activeSessions = sessions?.filter((s) => s.status === 'running' || s.status === 'paused') ?? [];

  if (projectsLoading || sessionsLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" />
      </div>
    );
  }

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
      <div className="grid gap-4 md:grid-cols-3">
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
            <div className="rounded-full bg-yellow-500/10 p-3">
              <Clock className="h-6 w-6 text-yellow-500" />
            </div>
            <div>
              <p className="text-sm text-muted-foreground">Paused</p>
              <p className="text-2xl font-bold">
                {activeSessions.filter((s) => s.status === 'paused').length}
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* Active Sessions */}
      {activeSessions.length > 0 && (
        <div>
          <h2 className="text-lg font-semibold mb-4">Active Sessions</h2>
          <div className="space-y-3">
            {activeSessions.map((session) => (
              <Link
                key={session.id}
                to={`/sessions/${session.id}`}
                className="flex items-center justify-between p-4 rounded-lg border bg-card hover:bg-accent/50 transition-colors"
              >
                <div className="flex items-center gap-4">
                  <SessionStatusIcon status={session.status} />
                  <div>
                    <p className="font-medium">
                      {session.ticket_id ? `Ticket Session` : 'Ad-hoc Session'}
                    </p>
                    <p className="text-sm text-muted-foreground">
                      {session.context_percent !== null
                        ? `Context: ${session.context_percent}%`
                        : 'Starting...'}
                    </p>
                  </div>
                </div>
                <ArrowRight className="h-5 w-5 text-muted-foreground" />
              </Link>
            ))}
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
    </div>
  );
}

function SessionStatusIcon({ status }: { status: string }) {
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
