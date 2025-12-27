/**
 * Projects List Page
 */

import { Link } from 'react-router-dom';
import { useProjects } from '@/hooks/useProjects';
import { Plus, FolderKanban } from 'lucide-react';

export function Projects() {
  const { data, isLoading, error } = useProjects();

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="rounded-lg border border-destructive bg-destructive/10 p-6 text-center">
        <p className="text-destructive">Failed to load projects</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Projects</h1>
          <p className="text-muted-foreground">
            Manage your Claude session projects
          </p>
        </div>
        <Link
          to="/projects/new"
          className="inline-flex items-center gap-2 rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90"
        >
          <Plus className="h-4 w-4" />
          New Project
        </Link>
      </div>

      {/* Projects Grid */}
      {data?.data.length === 0 ? (
        <div className="rounded-lg border bg-card p-12 text-center">
          <FolderKanban className="h-16 w-16 mx-auto text-muted-foreground mb-4" />
          <h3 className="text-lg font-medium mb-2">No projects yet</h3>
          <p className="text-muted-foreground mb-6">
            Create your first project to get started with Claude sessions
          </p>
          <Link
            to="/projects/new"
            className="inline-flex items-center gap-2 rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90"
          >
            <Plus className="h-4 w-4" />
            Create Project
          </Link>
        </div>
      ) : (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {data?.data.map((project) => (
            <Link
              key={project.id}
              to={`/projects/${project.id}`}
              className="group rounded-lg border bg-card p-5 hover:border-primary/50 hover:shadow-md transition-all"
            >
              <div className="flex items-start justify-between mb-3">
                <div className="rounded-lg bg-primary/10 p-2">
                  <FolderKanban className="h-5 w-5 text-primary" />
                </div>
              </div>
              <h3 className="font-semibold mb-1 group-hover:text-primary transition-colors">
                {project.name}
              </h3>
              <p className="text-sm text-muted-foreground truncate mb-3">
                {project.repo_path}
              </p>
              <div className="text-xs text-muted-foreground">
                tmux: {project.tmux_session}
                {project.tmux_window && `:${project.tmux_window}`}
              </div>
            </Link>
          ))}
        </div>
      )}

      {/* Pagination */}
      {data && data.pagination.total_pages > 1 && (
        <div className="flex items-center justify-center gap-2 pt-4">
          <span className="text-sm text-muted-foreground">
            Page {data.pagination.page} of {data.pagination.total_pages}
          </span>
        </div>
      )}
    </div>
  );
}
