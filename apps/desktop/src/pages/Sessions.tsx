/**
 * Sessions Page
 * Full-featured sessions page with tmux discovery, managed sessions,
 * and recent/completed sections. Includes keyboard navigation, filters, and rename.
 */

import { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { useSessions, useSyncSessions } from '../hooks/useSessions';
import { useTmuxSessions } from '../hooks/useTmux';
import { useWebSocket } from '../hooks/useWebSocket';
import { useShortcutScope } from '../shortcuts';
import { toast } from '../hooks/use-toast';
import { SessionCard } from '../components/SessionCard';
import { SessionDetailModal } from '../components/SessionDetailModal';
import { cn } from '../lib/utils';
import { discoverSessions, renameSession } from '../services/api';
import type { Session, SyncSessionsResult } from '../types/api';

// ============================================================================
// Filter Types
// ============================================================================

type SourceFilter = 'all' | 'api' | 'discovered';
type CommandFilter = 'all' | 'node' | 'nvim' | 'other';

// ============================================================================
// Collapsible Section Component
// ============================================================================

interface CollapsibleSectionProps {
  title: string;
  count?: number;
  defaultOpen?: boolean;
  children: React.ReactNode;
}

function CollapsibleSection({
  title,
  count,
  defaultOpen = false,
  children,
}: CollapsibleSectionProps) {
  const [isOpen, setIsOpen] = useState(defaultOpen);

  return (
    <section className="space-y-3">
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="flex items-center gap-2 text-lg font-semibold text-content-primary hover:text-indigo-400 transition-colors"
      >
        <span
          className={cn(
            'text-content-muted transition-transform',
            isOpen && 'rotate-90'
          )}
        >
          ▶
        </span>
        <span>{title}</span>
        {count !== undefined && (
          <span className="text-content-muted font-normal">({count})</span>
        )}
      </button>
      {isOpen && children}
    </section>
  );
}

// ============================================================================
// TmuxSessionCard Component
// ============================================================================

interface TmuxSessionCardProps {
  session: {
    name: string;
    windows: number;
    attached: boolean;
  };
}

function TmuxSessionCard({ session }: TmuxSessionCardProps) {
  return (
    <div className="flex items-center gap-3 p-4 bg-surface-secondary border border-line rounded-lg hover:bg-surface-tertiary transition-colors">
      <div
        className={cn(
          'flex items-center justify-center w-10 h-10 rounded-lg',
          session.attached ? 'bg-green-500/20' : 'bg-surface-tertiary'
        )}
      >
        <svg
          className={cn(
            'w-5 h-5',
            session.attached ? 'text-green-400' : 'text-content-muted'
          )}
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <polyline points="4 17 10 11 4 5" />
          <line x1="12" y1="19" x2="20" y2="19" />
        </svg>
      </div>
      <div className="flex-1 min-w-0">
        <p className="font-medium text-content-primary truncate">
          {session.name}
        </p>
        <div className="flex items-center gap-2 text-xs text-content-muted">
          <span className="flex items-center gap-1">
            <svg
              className="w-3 h-3"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
            >
              <rect x="3" y="3" width="18" height="18" rx="2" ry="2" />
              <line x1="3" y1="9" x2="21" y2="9" />
            </svg>
            {session.windows} window{session.windows !== 1 ? 's' : ''}
          </span>
          {session.attached && (
            <span className="text-green-400 font-medium">attached</span>
          )}
        </div>
      </div>
    </div>
  );
}

// ============================================================================
// Empty State Component
// ============================================================================

interface EmptyStateProps {
  message: string;
  submessage?: string;
  icon?: 'terminal' | 'session';
}

function EmptyState({
  message,
  submessage,
  icon = 'terminal',
}: EmptyStateProps) {
  return (
    <div className="flex flex-col items-center justify-center p-8 bg-surface-secondary border border-line rounded-lg text-center">
      {icon === 'terminal' ? (
        <svg
          className="w-12 h-12 text-content-muted mb-3"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.5"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <polyline points="4 17 10 11 4 5" />
          <line x1="12" y1="19" x2="20" y2="19" />
        </svg>
      ) : (
        <svg
          className="w-12 h-12 text-content-muted mb-3"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.5"
        >
          <rect x="2" y="3" width="20" height="14" rx="2" ry="2" />
          <line x1="8" y1="21" x2="16" y2="21" />
          <line x1="12" y1="17" x2="12" y2="21" />
        </svg>
      )}
      <p className="text-content-secondary">{message}</p>
      {submessage && (
        <p className="text-sm text-content-muted mt-1">{submessage}</p>
      )}
    </div>
  );
}

// ============================================================================
// Sync Button Component
// ============================================================================

interface SyncButtonProps {
  onClick: () => void;
  loading?: boolean;
}

function SyncButton({ onClick, loading }: SyncButtonProps) {
  return (
    <button
      onClick={onClick}
      disabled={loading}
      className={cn(
        'inline-flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium rounded-md',
        'border border-line bg-surface-secondary text-content-secondary',
        'hover:bg-surface-tertiary hover:text-content-primary',
        'disabled:cursor-not-allowed',
        'transition-all duration-200',
        loading && 'bg-indigo-500/10 border-indigo-500/30 text-indigo-400'
      )}
    >
      <svg
        className={cn('w-4 h-4 transition-transform', loading && 'animate-spin')}
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <path d="M21 12a9 9 0 11-9-9c2.52 0 4.93 1 6.74 2.74L21 8" />
        <path d="M21 3v5h-5" />
      </svg>
      {loading ? 'Syncing...' : 'Sync'}
    </button>
  );
}

// ============================================================================
// Filter Chips Component
// ============================================================================

interface FilterChipsProps {
  sourceFilter: SourceFilter;
  commandFilter: CommandFilter;
  onSourceChange: (source: SourceFilter) => void;
  onCommandChange: (command: CommandFilter) => void;
  counts: {
    api: number;
    discovered: number;
    node: number;
    nvim: number;
    other: number;
  };
}

function FilterChips({
  sourceFilter,
  commandFilter,
  onSourceChange,
  onCommandChange,
  counts,
}: FilterChipsProps) {
  return (
    <div className="flex flex-wrap gap-2">
      {/* Source filters */}
      <div className="flex items-center gap-1 mr-2">
        <span className="text-xs text-content-muted mr-1">Source:</span>
        <button
          onClick={() => onSourceChange('all')}
          className={cn(
            'px-2 py-1 text-xs rounded-md transition-colors',
            sourceFilter === 'all'
              ? 'bg-indigo-500/20 text-indigo-400'
              : 'bg-surface-tertiary text-content-muted hover:text-content-secondary'
          )}
        >
          All
        </button>
        <button
          onClick={() => onSourceChange('api')}
          className={cn(
            'px-2 py-1 text-xs rounded-md transition-colors',
            sourceFilter === 'api'
              ? 'bg-indigo-500/20 text-indigo-400'
              : 'bg-surface-tertiary text-content-muted hover:text-content-secondary'
          )}
        >
          API ({counts.api})
        </button>
        <button
          onClick={() => onSourceChange('discovered')}
          className={cn(
            'px-2 py-1 text-xs rounded-md transition-colors',
            sourceFilter === 'discovered'
              ? 'bg-amber-500/20 text-amber-400'
              : 'bg-surface-tertiary text-content-muted hover:text-content-secondary'
          )}
        >
          Discovered ({counts.discovered})
        </button>
      </div>

      {/* Command filters (only show for discovered) */}
      {sourceFilter !== 'api' && (
        <div className="flex items-center gap-1">
          <span className="text-xs text-content-muted mr-1">Command:</span>
          <button
            onClick={() => onCommandChange('all')}
            className={cn(
              'px-2 py-1 text-xs rounded-md transition-colors',
              commandFilter === 'all'
                ? 'bg-indigo-500/20 text-indigo-400'
                : 'bg-surface-tertiary text-content-muted hover:text-content-secondary'
            )}
          >
            All
          </button>
          <button
            onClick={() => onCommandChange('node')}
            className={cn(
              'px-2 py-1 text-xs rounded-md transition-colors',
              commandFilter === 'node'
                ? 'bg-green-500/20 text-green-400'
                : 'bg-surface-tertiary text-content-muted hover:text-content-secondary'
            )}
          >
            node ({counts.node})
          </button>
          <button
            onClick={() => onCommandChange('nvim')}
            className={cn(
              'px-2 py-1 text-xs rounded-md transition-colors',
              commandFilter === 'nvim'
                ? 'bg-blue-500/20 text-blue-400'
                : 'bg-surface-tertiary text-content-muted hover:text-content-secondary'
            )}
          >
            nvim ({counts.nvim})
          </button>
          <button
            onClick={() => onCommandChange('other')}
            className={cn(
              'px-2 py-1 text-xs rounded-md transition-colors',
              commandFilter === 'other'
                ? 'bg-gray-500/20 text-gray-400'
                : 'bg-surface-tertiary text-content-muted hover:text-content-secondary'
            )}
          >
            other ({counts.other})
          </button>
        </div>
      )}
    </div>
  );
}

// ============================================================================
// Rename Dialog Component
// ============================================================================

interface RenameDialogProps {
  currentName: string | null;
  onClose: () => void;
  onRename: (name: string) => Promise<void>;
}

function RenameDialog({ currentName, onClose, onRename }: RenameDialogProps) {
  const [name, setName] = useState(currentName ?? '');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    inputRef.current?.focus();
    inputRef.current?.select();
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return;

    setIsSubmitting(true);
    try {
      await onRename(name.trim());
      onClose();
    } catch {
      // Error handled by parent
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50" onClick={onClose}>
      <div
        className="bg-surface-secondary border border-line rounded-lg p-6 w-full max-w-md shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <h3 className="text-lg font-semibold text-content-primary mb-4">Rename Session</h3>
        <form onSubmit={handleSubmit}>
          <input
            ref={inputRef}
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Enter session name"
            className="w-full px-3 py-2 bg-surface-tertiary border border-line rounded-md text-content-primary placeholder-content-muted focus:border-indigo-500 focus:outline-none"
          />
          <div className="flex justify-end gap-2 mt-4">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 text-sm text-content-secondary hover:text-content-primary transition-colors"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={!name.trim() || isSubmitting}
              className="px-4 py-2 text-sm bg-indigo-500 text-white rounded-md hover:bg-indigo-600 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              {isSubmitting ? 'Saving...' : 'Save'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ============================================================================
// Sessions Page
// ============================================================================

export function Sessions() {
  // Data fetching hooks
  const {
    data: sessions,
    isLoading: sessionsLoading,
    error: sessionsError,
    refetch: refetchSessions,
  } = useSessions();
  const {
    data: tmuxSessions,
    isLoading: tmuxLoading,
    error: tmuxError,
    refetch: refetchTmux,
  } = useTmuxSessions();

  // WebSocket for real-time updates
  const { connectionState } = useWebSocket();

  // Sync mutation for cleaning up orphan sessions
  const syncSessions = useSyncSessions();

  // UI state
  const [selectedIndex, setSelectedIndex] = useState<number | null>(null);
  const [detailSession, setDetailSession] = useState<Session | null>(null);
  const [isSyncing, setIsSyncing] = useState(false);
  const [isDiscovering, setIsDiscovering] = useState(false);
  const listRef = useRef<HTMLDivElement>(null);

  // Filter state
  const [sourceFilter, setSourceFilter] = useState<SourceFilter>('all');
  const [commandFilter, setCommandFilter] = useState<CommandFilter>('all');

  // Rename dialog state
  const [renameTarget, setRenameTarget] = useState<{ sessionId: string; currentName: string | null } | null>(null);

  // Get active sessions (running/paused)
  const allActiveSessions = useMemo(
    () =>
      sessions?.filter(
        (s) =>
          s.status === 'running' ||
          s.status === 'paused'
      ) ?? [],
    [sessions]
  );

  // Calculate filter counts
  const filterCounts = useMemo(() => {
    const active = allActiveSessions;
    return {
      api: active.filter(s => s.source === 'api').length,
      discovered: active.filter(s => s.source === 'discovered').length,
      node: active.filter(s => s.pane_command === 'node').length,
      nvim: active.filter(s => s.pane_command === 'nvim' || s.pane_command === 'vim').length,
      other: active.filter(s => s.pane_command && !['node', 'nvim', 'vim'].includes(s.pane_command)).length,
    };
  }, [allActiveSessions]);

  // Apply filters to active sessions
  const activeSessions = useMemo(() => {
    let filtered = allActiveSessions;

    // Source filter
    if (sourceFilter !== 'all') {
      filtered = filtered.filter(s => s.source === sourceFilter);
    }

    // Command filter (only applies when not filtering to API only)
    if (commandFilter !== 'all' && sourceFilter !== 'api') {
      filtered = filtered.filter(s => {
        if (commandFilter === 'node') return s.pane_command === 'node';
        if (commandFilter === 'nvim') return s.pane_command === 'nvim' || s.pane_command === 'vim';
        if (commandFilter === 'other') return s.pane_command && !['node', 'nvim', 'vim'].includes(s.pane_command);
        return true;
      });
    }

    return filtered;
  }, [allActiveSessions, sourceFilter, commandFilter]);

  const completedSessions = useMemo(
    () =>
      sessions?.filter(
        (s) => s.status === 'completed' || s.status === 'error'
      ) ?? [],
    [sessions]
  );

  // Select first session when sessions load
  useEffect(() => {
    if (activeSessions.length > 0 && selectedIndex === null) {
      setSelectedIndex(0);
    }
  }, [activeSessions.length, selectedIndex]);

  // Reset selection if sessions change and index is out of bounds
  useEffect(() => {
    if (selectedIndex !== null && selectedIndex >= activeSessions.length) {
      setSelectedIndex(
        activeSessions.length > 0 ? activeSessions.length - 1 : null
      );
    }
  }, [activeSessions.length, selectedIndex]);

  // Navigation callbacks
  const selectNextSession = useCallback(() => {
    if (activeSessions.length === 0) return;
    setSelectedIndex((prev) => {
      if (prev === null) return 0;
      return Math.min(prev + 1, activeSessions.length - 1);
    });
  }, [activeSessions.length]);

  const selectPreviousSession = useCallback(() => {
    if (activeSessions.length === 0) return;
    setSelectedIndex((prev) => {
      if (prev === null) return 0;
      return Math.max(prev - 1, 0);
    });
  }, [activeSessions.length]);

  const openSelectedDetail = useCallback(() => {
    if (selectedIndex !== null && activeSessions[selectedIndex]) {
      setDetailSession(activeSessions[selectedIndex]);
    }
  }, [selectedIndex, activeSessions]);

  // Register keyboard shortcuts for this page
  useShortcutScope('sessions', {
    selectNext: selectNextSession,
    selectPrev: selectPreviousSession,
    openSession: openSelectedDetail,
  });

  // Sync sessions - cleans up orphan panes and refreshes data
  const handleSync = useCallback(async () => {
    setIsSyncing(true);
    try {
      // Run sync (cleans up orphans) and refresh tmux in parallel
      const [syncResult] = await Promise.all([
        syncSessions.mutateAsync(undefined),
        refetchTmux(),
      ]);

      // Also refresh the sessions list to get updated data
      await refetchSessions();

      // Show appropriate message based on sync results
      const result = syncResult as SyncSessionsResult;
      if (result.orphaned_count > 0) {
        toast.success(
          'Synced',
          `Cleaned up ${result.orphaned_count} orphan session${result.orphaned_count > 1 ? 's' : ''}`
        );
      } else {
        toast.success('Synced', 'All sessions up to date');
      }
    } catch {
      toast.error('Sync failed', 'Could not sync sessions');
    } finally {
      setIsSyncing(false);
    }
  }, [syncSessions, refetchTmux, refetchSessions]);

  // Discover manually created panes
  const handleDiscover = useCallback(async () => {
    setIsDiscovering(true);
    try {
      const result = await discoverSessions();
      await refetchSessions();

      if (result.discovered_sessions.length > 0) {
        toast.success(
          'Discovery Complete',
          `Found ${result.discovered_sessions.length} new pane${result.discovered_sessions.length > 1 ? 's' : ''}`
        );
      } else {
        toast.success('Discovery Complete', 'No new panes found');
      }
    } catch {
      toast.error('Discovery failed', 'Could not discover panes');
    } finally {
      setIsDiscovering(false);
    }
  }, [refetchSessions]);

  // Rename session handler
  const handleRename = useCallback(async (name: string) => {
    if (!renameTarget) return;

    try {
      await renameSession(renameTarget.sessionId, name);
      await refetchSessions();
      toast.success('Renamed', `Session renamed to "${name}"`);
    } catch {
      toast.error('Rename failed', 'Could not rename session');
      throw new Error('Failed to rename');
    }
  }, [renameTarget, refetchSessions]);

  // Open rename dialog
  const handleOpenRename = useCallback((sessionId: string, currentName: string | null) => {
    setRenameTarget({ sessionId, currentName });
  }, []);

  const isConnected = connectionState === 'connected';

  return (
    <div className="p-6 space-y-6" ref={listRef}>
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-content-primary">Sessions</h1>
          <p className="text-content-secondary">
            Monitor and control Claude sessions
          </p>
        </div>
        <div className="flex items-center gap-3">
          {/* WebSocket Status Indicator */}
          <div
            className={cn(
              'flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium',
              isConnected
                ? 'bg-green-500/20 text-green-400'
                : 'bg-surface-tertiary text-content-muted'
            )}
          >
            <div
              className={cn(
                'w-2 h-2 rounded-full',
                isConnected ? 'bg-green-400 animate-pulse' : 'bg-content-muted'
              )}
            />
            {isConnected ? 'Connected' : 'Disconnected'}
          </div>
          {/* Discover Button */}
          <button
            onClick={handleDiscover}
            disabled={isDiscovering}
            className={cn(
              'inline-flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium rounded-md',
              'border border-amber-500/30 bg-amber-500/10 text-amber-400',
              'hover:bg-amber-500/20',
              'disabled:cursor-not-allowed',
              'transition-all duration-200',
              isDiscovering && 'opacity-70'
            )}
          >
            <svg
              className={cn('w-4 h-4', isDiscovering && 'animate-pulse')}
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <circle cx="11" cy="11" r="8" />
              <path d="m21 21-4.3-4.3" />
            </svg>
            {isDiscovering ? 'Discovering...' : 'Discover'}
          </button>
          <SyncButton onClick={handleSync} loading={isSyncing} />
        </div>
      </div>

      {/* Filter Chips */}
      {allActiveSessions.length > 0 && (
        <FilterChips
          sourceFilter={sourceFilter}
          commandFilter={commandFilter}
          onSourceChange={setSourceFilter}
          onCommandChange={setCommandFilter}
          counts={filterCounts}
        />
      )}

      {/* tmux Sessions Discovery */}
      <section className="space-y-3">
        <h2 className="text-lg font-semibold text-content-primary flex items-center gap-2">
          <div className="flex items-center justify-center w-6 h-6 rounded bg-purple-500/20">
            <svg
              className="w-4 h-4 text-purple-400"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
            >
              <rect x="2" y="3" width="20" height="14" rx="2" ry="2" />
              <line x1="8" y1="21" x2="16" y2="21" />
              <line x1="12" y1="17" x2="12" y2="21" />
            </svg>
          </div>
          tmux Sessions
          <span className="text-content-muted font-normal">
            ({tmuxSessions?.length ?? 0})
          </span>
        </h2>

        {tmuxError ? (
          <div className="p-4 bg-red-500/10 border border-red-500/30 rounded-lg text-center">
            <p className="text-red-400 text-sm mb-3">Failed to load tmux sessions</p>
            <button
              onClick={() => refetchTmux()}
              className="inline-flex items-center gap-2 px-3 py-1.5 text-sm font-medium text-red-400 border border-red-500/30 rounded-md hover:bg-red-500/10 transition-colors"
            >
              <svg
                className="w-4 h-4"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <path d="M21 12a9 9 0 11-9-9c2.52 0 4.93 1 6.74 2.74L21 8" />
                <path d="M21 3v5h-5" />
              </svg>
              Retry
            </button>
          </div>
        ) : tmuxLoading ? (
          <div className="flex items-center justify-center h-32">
            <div className="w-6 h-6 border-2 border-surface-tertiary border-t-indigo-500 rounded-full animate-spin" />
          </div>
        ) : tmuxSessions && tmuxSessions.length > 0 ? (
          <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
            {tmuxSessions.map((session) => (
              <TmuxSessionCard key={session.name} session={session} />
            ))}
          </div>
        ) : (
          <EmptyState
            message="No tmux sessions found"
            submessage="Create a tmux session in your terminal"
            icon="terminal"
          />
        )}
      </section>

      {/* Managed Sessions (Active) */}
      <section className="space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-semibold text-content-primary flex items-center gap-2">
            <div className="w-2 h-2 rounded-full bg-green-500 animate-pulse" />
            Managed Sessions
            <span className="text-content-muted font-normal">
              ({activeSessions.length})
            </span>
          </h2>
          {activeSessions.length > 0 && (
            <span className="text-xs text-content-muted">
              Press Enter to view details • j/k to navigate
            </span>
          )}
        </div>

        {sessionsError ? (
          <div className="p-4 bg-red-500/10 border border-red-500/30 rounded-lg text-center">
            <p className="text-red-400 text-sm mb-3">
              Failed to load managed sessions
            </p>
            <button
              onClick={() => refetchSessions()}
              className="inline-flex items-center gap-2 px-3 py-1.5 text-sm font-medium text-red-400 border border-red-500/30 rounded-md hover:bg-red-500/10 transition-colors"
            >
              <svg
                className="w-4 h-4"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <path d="M21 12a9 9 0 11-9-9c2.52 0 4.93 1 6.74 2.74L21 8" />
                <path d="M21 3v5h-5" />
              </svg>
              Retry
            </button>
          </div>
        ) : sessionsLoading && !sessions ? (
          <div className="flex items-center justify-center h-32">
            <div className="w-6 h-6 border-2 border-surface-tertiary border-t-indigo-500 rounded-full animate-spin" />
          </div>
        ) : activeSessions.length === 0 ? (
          <EmptyState
            message="No active managed sessions"
            submessage="Start a session from a project or ticket"
            icon="session"
          />
        ) : (
          <div className="flex flex-col gap-3" role="listbox" aria-label="Active sessions">
            {activeSessions.map((session, index) => (
              <div key={session.id} className="group">
                <SessionCard
                  session={session}
                  isSelected={index === selectedIndex}
                  onSelect={() => setSelectedIndex(index)}
                  onDoubleClick={() => setDetailSession(session)}
                  onRename={handleOpenRename}
                />
              </div>
            ))}
          </div>
        )}
      </section>

      {/* Recent/Completed Sessions (Collapsible) */}
      {completedSessions.length > 0 && (
        <CollapsibleSection
          title="Recent Sessions"
          count={completedSessions.length}
          defaultOpen={false}
        >
          <div className="flex flex-col gap-2">
            {completedSessions.slice(0, 10).map((session) => (
              <div
                key={session.id}
                onClick={() => setDetailSession(session)}
                className={cn(
                  'flex items-center justify-between p-3 rounded-lg cursor-pointer',
                  'bg-surface-secondary/50 border border-line',
                  'hover:bg-surface-tertiary transition-colors'
                )}
              >
                <div className="flex items-center gap-3">
                  <svg
                    className="w-4 h-4 text-content-muted"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                  >
                    <rect x="3" y="3" width="18" height="18" rx="2" ry="2" />
                    <line x1="9" y1="9" x2="15" y2="15" />
                    <line x1="15" y1="9" x2="9" y2="15" />
                  </svg>
                  <div>
                    <p className="font-mono text-sm text-content-secondary">
                      {session.id.slice(0, 8)}...
                    </p>
                    {session.ticket?.title && (
                      <p className="text-xs text-content-muted truncate max-w-[200px]">
                        {session.ticket.title}
                      </p>
                    )}
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <span
                    className={cn(
                      'px-2 py-0.5 rounded text-xs font-medium',
                      session.status === 'completed'
                        ? 'bg-surface-tertiary text-content-muted'
                        : 'bg-red-500/20 text-red-400'
                    )}
                  >
                    {session.status === 'completed' ? 'Completed' : 'Error'}
                  </span>
                  <span className="text-xs text-content-muted">
                    {session.ended_at
                      ? formatDate(session.ended_at)
                      : 'Unknown'}
                  </span>
                </div>
              </div>
            ))}
          </div>
        </CollapsibleSection>
      )}

      {/* Session Detail Modal */}
      {detailSession && (
        <SessionDetailModal
          session={detailSession}
          onClose={() => setDetailSession(null)}
        />
      )}

      {/* Rename Dialog */}
      {renameTarget && (
        <RenameDialog
          currentName={renameTarget.currentName}
          onClose={() => setRenameTarget(null)}
          onRename={handleRename}
        />
      )}
    </div>
  );
}

// ============================================================================
// Helper Functions
// ============================================================================

function formatDate(dateStr: string): string {
  const date = new Date(dateStr);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffMins = Math.floor(diffMs / 60000);

  if (diffMins < 1) return 'just now';
  if (diffMins < 60) return `${diffMins}m ago`;

  const diffHours = Math.floor(diffMins / 60);
  if (diffHours < 24) return `${diffHours}h ago`;

  const diffDays = Math.floor(diffHours / 24);
  if (diffDays < 7) return `${diffDays}d ago`;

  return date.toLocaleDateString();
}
