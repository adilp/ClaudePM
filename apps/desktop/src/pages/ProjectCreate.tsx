/**
 * ProjectCreate Page
 * Form for creating new projects with tmux session discovery
 */

import { useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { ArrowLeft, FolderKanban, Terminal, RefreshCw } from 'lucide-react';
import { useCreateProject } from '../hooks/useProjects';
import { useTmuxSessions, useTmuxSessionDetail } from '../hooks/useTmux';
import { toast } from '../hooks/use-toast';
import { Button } from '../components/ui/button';
import { Select } from '../components/ui/select';
import { cn } from '../lib/utils';

export function ProjectCreate() {
  const navigate = useNavigate();
  const createProject = useCreateProject();
  const {
    data: tmuxSessions,
    isLoading: loadingTmux,
    refetch: refetchTmux,
  } = useTmuxSessions();

  const [formData, setFormData] = useState({
    name: '',
    repo_path: '',
    tmux_session: '',
    tmux_window: '',
    tickets_path: '',
    handoff_path: '',
  });

  const [errors, setErrors] = useState<Record<string, string>>({});

  // Fetch windows for selected session
  const { data: sessionDetail } = useTmuxSessionDetail(formData.tmux_session);

  const validate = () => {
    const newErrors: Record<string, string> = {};

    if (!formData.name.trim()) {
      newErrors.name = 'Project name is required';
    }

    if (!formData.repo_path.trim()) {
      newErrors.repo_path = 'Repository path is required';
    } else if (!formData.repo_path.startsWith('/')) {
      newErrors.repo_path = 'Repository path must be an absolute path (start with /)';
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

      toast.success('Project created', `${project.name} has been created successfully`);
      navigate(`/projects/${project.id}`);
    } catch (error) {
      toast.error(
        'Failed to create project',
        error instanceof Error ? error.message : 'An unexpected error occurred'
      );
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
    // Reset window selection when session changes
    if (name === 'tmux_session') {
      setFormData((prev) => ({ ...prev, tmux_window: '' }));
    }
  };

  const handleRefreshTmux = () => {
    refetchTmux();
  };

  return (
    <div className="p-6 max-w-2xl mx-auto">
      {/* Header */}
      <div className="flex items-center gap-4 mb-6">
        <Link
          to="/projects"
          className="p-2 rounded-lg hover:bg-surface-tertiary transition-colors"
        >
          <ArrowLeft className="h-5 w-5 text-content-secondary" />
        </Link>
        <div>
          <h1 className="text-2xl font-semibold text-content-primary">
            Create Project
          </h1>
          <p className="text-content-secondary text-sm">
            Set up a new Claude session project
          </p>
        </div>
      </div>

      {/* Form */}
      <form onSubmit={handleSubmit} className="space-y-6">
        {/* Project Details Section */}
        <div className="bg-surface-secondary border border-line rounded-xl p-5 space-y-4">
          <div className="flex items-center gap-2 mb-2">
            <FolderKanban className="h-5 w-5 text-indigo-400" />
            <h2 className="font-semibold text-content-primary">
              Project Details
            </h2>
          </div>

          {/* Name */}
          <div className="space-y-2">
            <label
              htmlFor="name"
              className="block text-sm font-medium text-content-primary"
            >
              Project Name <span className="text-red-400">*</span>
            </label>
            <input
              type="text"
              id="name"
              name="name"
              value={formData.name}
              onChange={handleChange}
              placeholder="My Project"
              className={cn(
                'w-full px-3 py-2 bg-surface-tertiary border rounded-lg text-sm text-content-primary placeholder-content-muted',
                'outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent transition-colors',
                errors.name ? 'border-red-500' : 'border-line'
              )}
            />
            {errors.name && (
              <p className="text-sm text-red-400">{errors.name}</p>
            )}
          </div>

          {/* Repo Path */}
          <div className="space-y-2">
            <label
              htmlFor="repo_path"
              className="block text-sm font-medium text-content-primary"
            >
              Repository Path <span className="text-red-400">*</span>
            </label>
            <input
              type="text"
              id="repo_path"
              name="repo_path"
              value={formData.repo_path}
              onChange={handleChange}
              placeholder="/Users/you/projects/my-repo"
              className={cn(
                'w-full px-3 py-2 bg-surface-tertiary border rounded-lg text-sm text-content-primary placeholder-content-muted font-mono',
                'outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent transition-colors',
                errors.repo_path ? 'border-red-500' : 'border-line'
              )}
            />
            {errors.repo_path && (
              <p className="text-sm text-red-400">{errors.repo_path}</p>
            )}
            <p className="text-xs text-content-muted">
              Absolute path to the git repository
            </p>
          </div>
        </div>

        {/* tmux Configuration Section */}
        <div className="bg-surface-secondary border border-line rounded-xl p-5 space-y-4">
          <div className="flex items-center justify-between mb-2">
            <div className="flex items-center gap-2">
              <Terminal className="h-5 w-5 text-indigo-400" />
              <h2 className="font-semibold text-content-primary">
                tmux Configuration
              </h2>
            </div>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={handleRefreshTmux}
              disabled={loadingTmux}
            >
              <RefreshCw
                className={cn('h-4 w-4', loadingTmux && 'animate-spin')}
              />
              Refresh
            </Button>
          </div>

          {/* tmux Session */}
          <div className="space-y-2">
            <label
              htmlFor="tmux_session"
              className="block text-sm font-medium text-content-primary"
            >
              tmux Session <span className="text-red-400">*</span>
            </label>
            {tmuxSessions && tmuxSessions.length > 0 ? (
              <Select
                id="tmux_session"
                name="tmux_session"
                value={formData.tmux_session}
                onChange={handleChange}
                error={!!errors.tmux_session}
              >
                <option value="">Select a tmux session...</option>
                {tmuxSessions.map((session) => (
                  <option key={session.name} value={session.name}>
                    {session.name} ({session.windows} window
                    {session.windows !== 1 ? 's' : ''})
                    {session.attached ? ' - attached' : ''}
                  </option>
                ))}
              </Select>
            ) : (
              <input
                type="text"
                id="tmux_session"
                name="tmux_session"
                value={formData.tmux_session}
                onChange={handleChange}
                placeholder="session-name"
                className={cn(
                  'w-full px-3 py-2 bg-surface-tertiary border rounded-lg text-sm text-content-primary placeholder-content-muted',
                  'outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent transition-colors',
                  errors.tmux_session ? 'border-red-500' : 'border-line'
                )}
              />
            )}
            {errors.tmux_session && (
              <p className="text-sm text-red-400">{errors.tmux_session}</p>
            )}
            {!tmuxSessions?.length && !loadingTmux && (
              <p className="text-xs text-content-muted">
                No tmux sessions found. Create one with:{' '}
                <code className="bg-surface-tertiary px-1.5 py-0.5 rounded text-content-secondary">
                  tmux new -s session-name
                </code>
              </p>
            )}
          </div>

          {/* tmux Window */}
          <div className="space-y-2">
            <label
              htmlFor="tmux_window"
              className="block text-sm font-medium text-content-primary"
            >
              tmux Window{' '}
              <span className="text-content-muted font-normal">(optional)</span>
            </label>
            {sessionDetail?.windows_detail &&
            sessionDetail.windows_detail.length > 0 ? (
              <Select
                id="tmux_window"
                name="tmux_window"
                value={formData.tmux_window}
                onChange={handleChange}
              >
                <option value="">Default (current window)</option>
                {sessionDetail.windows_detail.map((window) => (
                  <option
                    key={window.index}
                    value={window.index.toString()}
                  >
                    {window.index}: {window.name}
                    {window.active ? ' (active)' : ''}
                  </option>
                ))}
              </Select>
            ) : (
              <input
                type="text"
                id="tmux_window"
                name="tmux_window"
                value={formData.tmux_window}
                onChange={handleChange}
                placeholder="0"
                className="w-full px-3 py-2 bg-surface-tertiary border border-line rounded-lg text-sm text-content-primary placeholder-content-muted outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent transition-colors"
              />
            )}
            <p className="text-xs text-content-muted">
              Window index or name (defaults to current window)
            </p>
          </div>
        </div>

        {/* Optional Paths Section */}
        <div className="bg-surface-secondary border border-line rounded-xl p-5 space-y-4">
          <h2 className="font-semibold text-content-primary mb-2">
            Optional Paths
          </h2>

          {/* Tickets Path */}
          <div className="space-y-2">
            <label
              htmlFor="tickets_path"
              className="block text-sm font-medium text-content-primary"
            >
              Tickets Path
            </label>
            <input
              type="text"
              id="tickets_path"
              name="tickets_path"
              value={formData.tickets_path}
              onChange={handleChange}
              placeholder="docs/jira-tickets"
              className="w-full px-3 py-2 bg-surface-tertiary border border-line rounded-lg text-sm text-content-primary placeholder-content-muted font-mono outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent transition-colors"
            />
            <p className="text-xs text-content-muted">
              Relative path to ticket files within the repository
            </p>
          </div>

          {/* Handoff Path */}
          <div className="space-y-2">
            <label
              htmlFor="handoff_path"
              className="block text-sm font-medium text-content-primary"
            >
              Handoff Path
            </label>
            <input
              type="text"
              id="handoff_path"
              name="handoff_path"
              value={formData.handoff_path}
              onChange={handleChange}
              placeholder="docs/ai-context/HANDOFF.md"
              className="w-full px-3 py-2 bg-surface-tertiary border border-line rounded-lg text-sm text-content-primary placeholder-content-muted font-mono outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent transition-colors"
            />
            <p className="text-xs text-content-muted">
              Relative path to the handoff document
            </p>
          </div>
        </div>

        {/* Error Message */}
        {createProject.error && (
          <div className="bg-red-500/10 border border-red-500/30 rounded-lg p-4">
            <p className="text-sm text-red-400">
              {createProject.error instanceof Error
                ? createProject.error.message
                : 'Failed to create project'}
            </p>
          </div>
        )}

        {/* Actions */}
        <div className="flex items-center justify-end gap-3">
          <Button
            type="button"
            variant="secondary"
            onClick={() => navigate('/projects')}
          >
            Cancel
          </Button>
          <Button type="submit" variant="primary" loading={createProject.isPending}>
            {createProject.isPending ? 'Creating...' : 'Create Project'}
          </Button>
        </div>
      </form>
    </div>
  );
}
