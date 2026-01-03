/**
 * Edit Project Modal
 * Modal for editing project settings including tmux session configuration
 */

import { useState, useEffect } from 'react';
import { AlertCircle, Terminal, RefreshCw } from 'lucide-react';
import {
  Dialog,
  DialogHeader,
  DialogTitle,
  DialogContent,
  DialogFooter,
  DialogClose,
} from './ui/dialog';
import { Button } from './ui/button';
import { Input } from './ui/input';
import { Select } from './ui/select';
import { useUpdateProject } from '../hooks/useProjects';
import { useTmuxSessions, useTmuxSessionDetail } from '../hooks/useTmux';
import { toast } from '../hooks/use-toast';
import { cn } from '../lib/utils';
import type { Project } from '../types/api';

interface EditProjectModalProps {
  project: Project | null;
  isOpen: boolean;
  onClose: () => void;
}

export function EditProjectModal({
  project,
  isOpen,
  onClose,
}: EditProjectModalProps) {
  const updateProject = useUpdateProject();
  const {
    data: tmuxSessions,
    isLoading: loadingTmux,
    refetch: refetchTmux,
  } = useTmuxSessions();

  const [name, setName] = useState('');
  const [tmuxSession, setTmuxSession] = useState('');
  const [tmuxWindow, setTmuxWindow] = useState('');
  const [ticketsPath, setTicketsPath] = useState('');
  const [handoffPath, setHandoffPath] = useState('');
  const [error, setError] = useState<string | null>(null);

  // Fetch windows for selected session
  const { data: sessionDetail } = useTmuxSessionDetail(tmuxSession);

  // Populate form when project changes
  useEffect(() => {
    if (project && isOpen) {
      setName(project.name);
      setTmuxSession(project.tmux_session);
      setTmuxWindow(project.tmux_window || '');
      setTicketsPath(project.tickets_path || '');
      setHandoffPath(project.handoff_path || '');
      setError(null);
    }
  }, [project, isOpen]);

  const handleTmuxSessionChange = (e: React.ChangeEvent<HTMLSelectElement | HTMLInputElement>) => {
    setTmuxSession(e.target.value);
    // Reset window selection when session changes
    setTmuxWindow('');
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!project) return;

    // Validate required fields
    if (!name.trim()) {
      setError('Name is required');
      return;
    }
    if (!tmuxSession.trim()) {
      setError('tmux session is required');
      return;
    }

    updateProject.mutate(
      {
        id: project.id,
        data: {
          name: name.trim(),
          tmux_session: tmuxSession.trim(),
          tmux_window: tmuxWindow.trim() || undefined,
          tickets_path: ticketsPath.trim() || undefined,
          handoff_path: handoffPath.trim() || undefined,
        },
      },
      {
        onSuccess: () => {
          toast.success('Project updated', `"${name.trim()}" has been updated`);
          onClose();
        },
        onError: (err) => {
          setError(err instanceof Error ? err.message : 'Failed to update project');
        },
      }
    );
  };

  if (!project) return null;

  return (
    <Dialog open={isOpen} onClose={onClose}>
      <DialogClose onClick={onClose} />
      <DialogHeader>
        <DialogTitle>Edit Project</DialogTitle>
      </DialogHeader>

      <form onSubmit={handleSubmit}>
        <DialogContent>
          <div className="space-y-5">
            {/* Name field */}
            <div className="space-y-2">
              <label htmlFor="name" className="block text-sm font-medium text-content-primary">
                Name <span className="text-red-400">*</span>
              </label>
              <Input
                id="name"
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Project name"
                autoFocus
              />
            </div>

            {/* tmux Configuration Section */}
            <div className="bg-surface-tertiary border border-line rounded-xl p-4 space-y-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Terminal className="h-4 w-4 text-indigo-400" />
                  <span className="font-medium text-content-primary text-sm">
                    tmux Configuration
                  </span>
                </div>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={() => refetchTmux()}
                  disabled={loadingTmux}
                >
                  <RefreshCw
                    className={cn('h-4 w-4', loadingTmux && 'animate-spin')}
                  />
                  Refresh
                </Button>
              </div>

              {/* tmux Session field */}
              <div className="space-y-2">
                <label htmlFor="tmux-session" className="block text-sm font-medium text-content-primary">
                  tmux Session <span className="text-red-400">*</span>
                </label>
                {tmuxSessions && tmuxSessions.length > 0 ? (
                  <Select
                    id="tmux-session"
                    value={tmuxSession}
                    onChange={handleTmuxSessionChange}
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
                  <Input
                    id="tmux-session"
                    type="text"
                    value={tmuxSession}
                    onChange={handleTmuxSessionChange}
                    placeholder="session-name"
                    className="font-mono"
                  />
                )}
                {!tmuxSessions?.length && !loadingTmux && (
                  <p className="text-xs text-content-muted">
                    No tmux sessions found. Create one with:{' '}
                    <code className="bg-surface-primary px-1.5 py-0.5 rounded text-content-secondary">
                      tmux new -s session-name
                    </code>
                  </p>
                )}
              </div>

              {/* tmux Window field */}
              <div className="space-y-2">
                <label htmlFor="tmux-window" className="block text-sm font-medium text-content-primary">
                  tmux Window <span className="text-content-muted font-normal">(optional)</span>
                </label>
                {sessionDetail?.windows_detail && sessionDetail.windows_detail.length > 0 ? (
                  <Select
                    id="tmux-window"
                    value={tmuxWindow}
                    onChange={(e) => setTmuxWindow(e.target.value)}
                  >
                    <option value="">Default (current window)</option>
                    {sessionDetail.windows_detail.map((window) => (
                      <option key={window.index} value={window.index.toString()}>
                        {window.index}: {window.name}
                        {window.active ? ' (active)' : ''}
                      </option>
                    ))}
                  </Select>
                ) : (
                  <Input
                    id="tmux-window"
                    type="text"
                    value={tmuxWindow}
                    onChange={(e) => setTmuxWindow(e.target.value)}
                    placeholder="0"
                    className="font-mono"
                  />
                )}
                <p className="text-xs text-content-muted">
                  Window index or name (defaults to current window)
                </p>
              </div>
            </div>

            {/* Optional Paths */}
            <div className="space-y-4">
              {/* Tickets Path field */}
              <div className="space-y-2">
                <label htmlFor="tickets-path" className="block text-sm font-medium text-content-primary">
                  Tickets Path <span className="text-content-muted font-normal">(optional)</span>
                </label>
                <Input
                  id="tickets-path"
                  type="text"
                  value={ticketsPath}
                  onChange={(e) => setTicketsPath(e.target.value)}
                  placeholder="e.g., docs/tickets"
                  className="font-mono"
                />
              </div>

              {/* Handoff Path field */}
              <div className="space-y-2">
                <label htmlFor="handoff-path" className="block text-sm font-medium text-content-primary">
                  Handoff Path <span className="text-content-muted font-normal">(optional)</span>
                </label>
                <Input
                  id="handoff-path"
                  type="text"
                  value={handoffPath}
                  onChange={(e) => setHandoffPath(e.target.value)}
                  placeholder="e.g., docs/handoffs"
                  className="font-mono"
                />
              </div>
            </div>

            {/* Repo path (read-only info) */}
            <div className="space-y-2">
              <label className="block text-sm font-medium text-content-muted">
                Repository Path
              </label>
              <p className="text-sm text-content-secondary font-mono bg-surface-tertiary px-3 py-2 rounded-lg">
                {project.repo_path}
              </p>
              <p className="text-xs text-content-muted">Repository path cannot be changed</p>
            </div>

            {/* Error message */}
            {error && (
              <div className="flex items-center gap-2 p-3 bg-red-500/10 border border-red-500/30 rounded-lg text-red-400">
                <AlertCircle className="h-4 w-4 shrink-0" />
                <p className="text-sm">{error}</p>
              </div>
            )}
          </div>
        </DialogContent>

        <DialogFooter>
          <Button type="button" variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button
            type="submit"
            variant="primary"
            disabled={updateProject.isPending}
          >
            {updateProject.isPending ? 'Saving...' : 'Save Changes'}
          </Button>
        </DialogFooter>
      </form>
    </Dialog>
  );
}
