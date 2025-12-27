/**
 * Project Create Page
 * Form for creating new projects
 */

import { useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { useCreateProject } from '@/hooks/useProjects';
import { useTmuxSessions } from '@/hooks/useTmux';
import { ArrowLeft, FolderKanban, Terminal, RefreshCw } from 'lucide-react';

export function ProjectCreate() {
  const navigate = useNavigate();
  const createProject = useCreateProject();
  const { data: tmuxSessions, isLoading: loadingTmux, refetch: refetchTmux } = useTmuxSessions();

  const [formData, setFormData] = useState({
    name: '',
    repo_path: '',
    tmux_session: '',
    tmux_window: '',
    tickets_path: '',
    handoff_path: '',
  });

  const [errors, setErrors] = useState<Record<string, string>>({});

  const validate = () => {
    const newErrors: Record<string, string> = {};

    if (!formData.name.trim()) {
      newErrors.name = 'Project name is required';
    }

    if (!formData.repo_path.trim()) {
      newErrors.repo_path = 'Repository path is required';
    } else if (!formData.repo_path.startsWith('/')) {
      newErrors.repo_path = 'Repository path must be an absolute path';
    }

    if (!formData.tmux_session.trim()) {
      newErrors.tmux_session = 'tmux session is required';
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!validate()) return;

    try {
      const project = await createProject.mutateAsync({
        name: formData.name.trim(),
        repo_path: formData.repo_path.trim(),
        tmux_session: formData.tmux_session.trim(),
        tmux_window: formData.tmux_window.trim() || undefined,
        tickets_path: formData.tickets_path.trim() || undefined,
        handoff_path: formData.handoff_path.trim() || undefined,
      });

      navigate(`/projects/${project.id}`);
    } catch (error) {
      // Error will be shown via createProject.error
    }
  };

  const handleChange = (
    e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>
  ) => {
    const { name, value } = e.target;
    setFormData((prev) => ({ ...prev, [name]: value }));
    // Clear error when user starts typing
    if (errors[name]) {
      setErrors((prev) => ({ ...prev, [name]: '' }));
    }
  };

  return (
    <div className="max-w-2xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex items-center gap-4">
        <Link
          to="/projects"
          className="p-2 rounded-md hover:bg-accent"
        >
          <ArrowLeft className="h-5 w-5" />
        </Link>
        <div>
          <h1 className="text-2xl font-bold">Create Project</h1>
          <p className="text-muted-foreground">
            Set up a new Claude session project
          </p>
        </div>
      </div>

      {/* Form */}
      <form onSubmit={handleSubmit} className="space-y-6">
        <div className="rounded-lg border bg-card p-6 space-y-4">
          <div className="flex items-center gap-2 mb-2">
            <FolderKanban className="h-5 w-5 text-primary" />
            <h2 className="font-semibold">Project Details</h2>
          </div>

          {/* Name */}
          <div className="space-y-2">
            <label htmlFor="name" className="text-sm font-medium">
              Project Name <span className="text-destructive">*</span>
            </label>
            <input
              type="text"
              id="name"
              name="name"
              value={formData.name}
              onChange={handleChange}
              placeholder="My Project"
              className={`w-full px-3 py-2 rounded-md border bg-background ${
                errors.name ? 'border-destructive' : 'border-input'
              } focus:outline-none focus:ring-2 focus:ring-ring`}
            />
            {errors.name && (
              <p className="text-sm text-destructive">{errors.name}</p>
            )}
          </div>

          {/* Repo Path */}
          <div className="space-y-2">
            <label htmlFor="repo_path" className="text-sm font-medium">
              Repository Path <span className="text-destructive">*</span>
            </label>
            <input
              type="text"
              id="repo_path"
              name="repo_path"
              value={formData.repo_path}
              onChange={handleChange}
              placeholder="/Users/you/projects/my-repo"
              className={`w-full px-3 py-2 rounded-md border bg-background font-mono text-sm ${
                errors.repo_path ? 'border-destructive' : 'border-input'
              } focus:outline-none focus:ring-2 focus:ring-ring`}
            />
            {errors.repo_path && (
              <p className="text-sm text-destructive">{errors.repo_path}</p>
            )}
            <p className="text-xs text-muted-foreground">
              Absolute path to the git repository
            </p>
          </div>
        </div>

        {/* tmux Configuration */}
        <div className="rounded-lg border bg-card p-6 space-y-4">
          <div className="flex items-center justify-between mb-2">
            <div className="flex items-center gap-2">
              <Terminal className="h-5 w-5 text-primary" />
              <h2 className="font-semibold">tmux Configuration</h2>
            </div>
            <button
              type="button"
              onClick={() => refetchTmux()}
              disabled={loadingTmux}
              className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
            >
              <RefreshCw className={`h-4 w-4 ${loadingTmux ? 'animate-spin' : ''}`} />
              Refresh
            </button>
          </div>

          {/* tmux Session */}
          <div className="space-y-2">
            <label htmlFor="tmux_session" className="text-sm font-medium">
              tmux Session <span className="text-destructive">*</span>
            </label>
            {tmuxSessions && tmuxSessions.length > 0 ? (
              <select
                id="tmux_session"
                name="tmux_session"
                value={formData.tmux_session}
                onChange={handleChange}
                className={`w-full px-3 py-2 rounded-md border bg-background ${
                  errors.tmux_session ? 'border-destructive' : 'border-input'
                } focus:outline-none focus:ring-2 focus:ring-ring`}
              >
                <option value="">Select a tmux session...</option>
                {tmuxSessions.map((session) => (
                  <option key={session.name} value={session.name}>
                    {session.name} ({session.windows} window{session.windows !== 1 ? 's' : ''})
                    {session.attached ? ' - attached' : ''}
                  </option>
                ))}
              </select>
            ) : (
              <input
                type="text"
                id="tmux_session"
                name="tmux_session"
                value={formData.tmux_session}
                onChange={handleChange}
                placeholder="session-name"
                className={`w-full px-3 py-2 rounded-md border bg-background ${
                  errors.tmux_session ? 'border-destructive' : 'border-input'
                } focus:outline-none focus:ring-2 focus:ring-ring`}
              />
            )}
            {errors.tmux_session && (
              <p className="text-sm text-destructive">{errors.tmux_session}</p>
            )}
            {!tmuxSessions?.length && !loadingTmux && (
              <p className="text-xs text-muted-foreground">
                No tmux sessions found. Create one with: <code className="bg-muted px-1 rounded">tmux new -s session-name</code>
              </p>
            )}
          </div>

          {/* tmux Window */}
          <div className="space-y-2">
            <label htmlFor="tmux_window" className="text-sm font-medium">
              tmux Window <span className="text-muted-foreground">(optional)</span>
            </label>
            <input
              type="text"
              id="tmux_window"
              name="tmux_window"
              value={formData.tmux_window}
              onChange={handleChange}
              placeholder="0"
              className="w-full px-3 py-2 rounded-md border border-input bg-background focus:outline-none focus:ring-2 focus:ring-ring"
            />
            <p className="text-xs text-muted-foreground">
              Window index or name (defaults to current window)
            </p>
          </div>
        </div>

        {/* Optional Paths */}
        <div className="rounded-lg border bg-card p-6 space-y-4">
          <h2 className="font-semibold mb-2">Optional Paths</h2>

          {/* Tickets Path */}
          <div className="space-y-2">
            <label htmlFor="tickets_path" className="text-sm font-medium">
              Tickets Path
            </label>
            <input
              type="text"
              id="tickets_path"
              name="tickets_path"
              value={formData.tickets_path}
              onChange={handleChange}
              placeholder="docs/jira-tickets"
              className="w-full px-3 py-2 rounded-md border border-input bg-background font-mono text-sm focus:outline-none focus:ring-2 focus:ring-ring"
            />
            <p className="text-xs text-muted-foreground">
              Relative path to ticket files within the repository
            </p>
          </div>

          {/* Handoff Path */}
          <div className="space-y-2">
            <label htmlFor="handoff_path" className="text-sm font-medium">
              Handoff Path
            </label>
            <input
              type="text"
              id="handoff_path"
              name="handoff_path"
              value={formData.handoff_path}
              onChange={handleChange}
              placeholder="docs/ai-context/HANDOFF.md"
              className="w-full px-3 py-2 rounded-md border border-input bg-background font-mono text-sm focus:outline-none focus:ring-2 focus:ring-ring"
            />
            <p className="text-xs text-muted-foreground">
              Relative path to the handoff document
            </p>
          </div>
        </div>

        {/* Error Message */}
        {createProject.error && (
          <div className="rounded-lg border border-destructive bg-destructive/10 p-4">
            <p className="text-sm text-destructive">
              {createProject.error instanceof Error
                ? createProject.error.message
                : 'Failed to create project'}
            </p>
          </div>
        )}

        {/* Actions */}
        <div className="flex items-center justify-end gap-3">
          <Link
            to="/projects"
            className="px-4 py-2 rounded-md border hover:bg-accent"
          >
            Cancel
          </Link>
          <button
            type="submit"
            disabled={createProject.isPending}
            className="px-4 py-2 rounded-md bg-primary text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
          >
            {createProject.isPending ? 'Creating...' : 'Create Project'}
          </button>
        </div>
      </form>
    </div>
  );
}
