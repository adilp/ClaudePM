/**
 * Projects List Page
 * Displays all projects in a responsive grid with loading, error, and empty states
 */

import { useState, useCallback } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useProjects } from '../hooks/useProjects';
import { useShortcutScope } from '../shortcuts';
import { Button } from '../components/ui/button';
import { EditProjectModal } from '../components/EditProjectModal';
import { cn } from '../lib/utils';
import type { Project } from '../types/api';

// Icons as inline SVGs to match desktop app pattern
function PlusIcon({ className }: { className?: string }) {
  return (
    <svg
      width="16"
      height="16"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
    >
      <line x1="12" y1="5" x2="12" y2="19" />
      <line x1="5" y1="12" x2="19" y2="12" />
    </svg>
  );
}

function FolderKanbanIcon({ className }: { className?: string }) {
  return (
    <svg
      width="24"
      height="24"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
    >
      <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z" />
      <path d="M8 10v6" />
      <path d="M12 10v6" />
      <path d="M16 10v6" />
    </svg>
  );
}

function RefreshIcon({ className }: { className?: string }) {
  return (
    <svg
      width="16"
      height="16"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
    >
      <path d="M21 12a9 9 0 0 0-9-9 9.75 9.75 0 0 0-6.74 2.74L3 8" />
      <path d="M3 3v5h5" />
      <path d="M3 12a9 9 0 0 0 9 9 9.75 9.75 0 0 0 6.74-2.74L21 16" />
      <path d="M16 16h5v5" />
    </svg>
  );
}

function EditIcon({ className }: { className?: string }) {
  return (
    <svg
      width="16"
      height="16"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
    >
      <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" />
      <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" />
    </svg>
  );
}

export function Projects() {
  const navigate = useNavigate();
  const { data, isLoading, error, refetch, isRefetching } = useProjects();
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [editingProject, setEditingProject] = useState<Project | null>(null);

  const projects = data?.data ?? [];

  // Keyboard navigation handlers
  const handleNext = useCallback(() => {
    setSelectedIndex((i) => Math.min(i + 1, projects.length - 1));
  }, [projects.length]);

  const handlePrev = useCallback(() => {
    setSelectedIndex((i) => Math.max(i - 1, 0));
  }, []);

  const handleOpen = useCallback(() => {
    if (projects[selectedIndex]) {
      navigate(`/projects/${projects[selectedIndex].id}`);
    }
  }, [projects, selectedIndex, navigate]);

  const handleNew = useCallback(() => {
    navigate('/projects/new');
  }, [navigate]);

  // Register keyboard shortcuts
  useShortcutScope('projects', {
    selectNext: handleNext,
    selectPrev: handlePrev,
    openProject: handleOpen,
    newProject: handleNew,
  });

  // Loading state
  if (isLoading) {
    return (
      <div className="p-6 space-y-6">
        {/* Header skeleton */}
        <div className="flex items-center justify-between">
          <div>
            <div className="h-8 w-32 bg-surface-tertiary rounded animate-pulse mb-2" />
            <div className="h-4 w-64 bg-surface-tertiary rounded animate-pulse" />
          </div>
          <div className="h-10 w-32 bg-surface-tertiary rounded animate-pulse" />
        </div>

        {/* Grid skeleton */}
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {[1, 2, 3, 4, 5, 6].map((i) => (
            <div
              key={i}
              className="bg-surface-secondary border border-line rounded-xl p-5 animate-pulse"
            >
              <div className="flex items-start justify-between mb-3">
                <div className="w-10 h-10 bg-surface-tertiary rounded-lg" />
              </div>
              <div className="h-5 w-3/4 bg-surface-tertiary rounded mb-2" />
              <div className="h-4 w-full bg-surface-tertiary rounded mb-3" />
              <div className="h-3 w-1/2 bg-surface-tertiary rounded" />
            </div>
          ))}
        </div>
      </div>
    );
  }

  // Error state
  if (error) {
    return (
      <div className="p-6">
        <div className="rounded-xl border border-red-500/30 bg-red-500/10 p-8 text-center">
          <div className="mx-auto w-12 h-12 rounded-full bg-red-500/20 flex items-center justify-center mb-4">
            <svg
              width="24"
              height="24"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
              className="text-red-400"
            >
              <circle cx="12" cy="12" r="10" />
              <line x1="12" y1="8" x2="12" y2="12" />
              <line x1="12" y1="16" x2="12.01" y2="16" />
            </svg>
          </div>
          <h3 className="text-lg font-medium text-content-primary mb-2">
            Failed to load projects
          </h3>
          <p className="text-content-secondary mb-6">
            {error instanceof Error ? error.message : 'An unexpected error occurred'}
          </p>
          <Button
            onClick={() => refetch()}
            loading={isRefetching}
            variant="secondary"
          >
            <RefreshIcon />
            Retry
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-content-primary">Projects</h1>
          <p className="text-content-secondary">
            Manage your Claude session projects
          </p>
        </div>
        <Link to="/projects/new">
          <Button>
            <PlusIcon />
            New Project
          </Button>
        </Link>
      </div>

      {/* Empty state */}
      {projects.length === 0 ? (
        <div className="rounded-xl border border-line bg-surface-secondary p-12 text-center">
          <div className="mx-auto w-16 h-16 rounded-full bg-indigo-500/10 flex items-center justify-center mb-4">
            <FolderKanbanIcon className="w-8 h-8 text-indigo-400" />
          </div>
          <h3 className="text-lg font-medium text-content-primary mb-2">
            No projects yet
          </h3>
          <p className="text-content-secondary mb-6 max-w-md mx-auto">
            Create your first project to get started with Claude sessions
          </p>
          <Link to="/projects/new">
            <Button>
              <PlusIcon />
              Create Project
            </Button>
          </Link>
        </div>
      ) : (
        /* Projects Grid */
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {projects.map((project, index) => (
            <div
              key={project.id}
              className={cn(
                'group rounded-xl border bg-surface-secondary p-5 hover:border-indigo-500/50 hover:shadow-lg hover:shadow-indigo-500/5 transition-all',
                index === selectedIndex
                  ? 'ring-2 ring-indigo-500 border-indigo-500'
                  : 'border-line'
              )}
            >
              <div className="flex items-start justify-between mb-3">
                <Link to={`/projects/${project.id}`} className="rounded-lg bg-indigo-500/10 p-2 hover:bg-indigo-500/20 transition-colors">
                  <FolderKanbanIcon className="w-5 h-5 text-indigo-400" />
                </Link>
                <button
                  onClick={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    setEditingProject(project);
                  }}
                  className="p-2 rounded-lg text-content-muted hover:text-content-primary hover:bg-surface-tertiary transition-colors opacity-0 group-hover:opacity-100"
                  title="Edit project"
                >
                  <EditIcon />
                </button>
              </div>
              <Link to={`/projects/${project.id}`} className="block">
                <h3 className="font-semibold text-content-primary mb-1 group-hover:text-indigo-400 transition-colors">
                  {project.name}
                </h3>
                <p className="text-sm text-content-secondary truncate mb-3">
                  {project.repo_path}
                </p>
                <div className="text-xs text-content-muted">
                  tmux: {project.tmux_session}
                  {project.tmux_window && `:${project.tmux_window}`}
                </div>
              </Link>
            </div>
          ))}
        </div>
      )}

      {/* Pagination info */}
      {data && data.pagination.total_pages > 1 && (
        <div className="flex items-center justify-center gap-2 pt-4">
          <span className="text-sm text-content-muted">
            Page {data.pagination.page} of {data.pagination.total_pages}
          </span>
        </div>
      )}

      {/* Edit Project Modal */}
      <EditProjectModal
        project={editingProject}
        isOpen={editingProject !== null}
        onClose={() => setEditingProject(null)}
      />
    </div>
  );
}
