/**
 * SessionCard Component
 * Displays individual session information with click-to-focus functionality
 */

import { useState, useCallback } from 'react';
import type { Session } from '../types/api';
import { StatusBadge } from './StatusBadge';
import { focusSession, showErrorNotification } from '../services/session-controller';
import { cn } from '../lib/utils';

type FocusState = 'idle' | 'loading' | 'success' | 'error';

interface SessionCardProps {
  session: Session;
  isSelected?: boolean;
  onSelect?: () => void;
  onDoubleClick?: () => void;
  onRename?: (sessionId: string, currentName: string | null) => void;
}

export function SessionCard({
  session,
  isSelected = false,
  onSelect,
  onDoubleClick,
  onRename,
}: SessionCardProps) {
  const [focusState, setFocusState] = useState<FocusState>('idle');
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  // Display name: pane_name > ticket title > project name
  const displayName = session.pane_name ?? session.ticket?.title ?? session.project?.name ?? 'Unnamed Session';
  const contextPercent = session.context_percent;
  const isDiscovered = session.source === 'discovered';

  // Get command icon/label
  const getCommandDisplay = (command: string | null) => {
    if (!command) return null;
    switch (command) {
      case 'node': return { label: 'node', color: 'text-green-400', hint: 'Likely Claude' };
      case 'nvim': return { label: 'nvim', color: 'text-blue-400', hint: null };
      case 'vim': return { label: 'vim', color: 'text-blue-400', hint: null };
      case 'zsh': return { label: 'zsh', color: 'text-gray-400', hint: null };
      case 'bash': return { label: 'bash', color: 'text-gray-400', hint: null };
      default: return { label: command, color: 'text-content-muted', hint: null };
    }
  };

  const commandDisplay = getCommandDisplay(session.pane_command);

  const handleFocus = useCallback(async () => {
    if (focusState === 'loading') return;

    setFocusState('loading');
    setErrorMessage(null);

    try {
      await focusSession(session.id);
      setFocusState('success');
      // Reset success state after brief flash
      setTimeout(() => setFocusState('idle'), 1500);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to focus session';
      setErrorMessage(message);
      setFocusState('error');
      await showErrorNotification(message);
      // Reset error state after showing
      setTimeout(() => {
        setFocusState('idle');
        setErrorMessage(null);
      }, 3000);
    }
  }, [session.id, focusState]);

  const handleClick = useCallback(() => {
    onSelect?.();
    handleFocus();
  }, [onSelect, handleFocus]);

  const handleDoubleClick = useCallback(() => {
    onDoubleClick?.();
  }, [onDoubleClick]);

  const handleRenameClick = useCallback((e: React.MouseEvent) => {
    e.stopPropagation();
    onRename?.(session.id, session.pane_name);
  }, [session.id, session.pane_name, onRename]);

  return (
    <div
      className={cn(
        'relative bg-surface-secondary border-2 border-line rounded-lg p-4 cursor-pointer transition-all outline-none',
        'hover:border-indigo-500',
        'focus:border-indigo-500 focus:shadow-[0_0_0_2px_rgba(99,102,241,0.2)]',
        isSelected && 'border-indigo-500 bg-indigo-500/[0.08] hover:bg-indigo-500/[0.12]',
        focusState === 'loading' && 'opacity-80 pointer-events-none',
        focusState === 'success' && 'border-green-500 bg-green-500/10 animate-[success-pulse_0.3s_ease-out]',
        focusState === 'error' && 'border-red-500 bg-red-500/10'
      )}
      onClick={handleClick}
      onDoubleClick={handleDoubleClick}
      tabIndex={0}
      role="button"
      aria-pressed={isSelected}
      aria-busy={focusState === 'loading'}
    >
      {focusState === 'loading' && (
        <div className="absolute inset-0 flex items-center justify-center bg-black/30 rounded-md z-10">
          <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
        </div>
      )}

      {/* Header: Name + Status + Source badge */}
      <div className="flex items-start justify-between gap-3 mb-2">
        <div className="flex items-center gap-2 min-w-0 flex-1">
          <span className="font-medium text-content-primary leading-snug truncate">{displayName}</span>
          {onRename && (
            <button
              onClick={handleRenameClick}
              className="text-content-muted hover:text-content-primary p-0.5 opacity-0 group-hover:opacity-100 transition-opacity"
              title="Rename session"
            >
              <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" />
              </svg>
            </button>
          )}
        </div>
        <div className="flex items-center gap-2 flex-shrink-0">
          {isDiscovered && (
            <span className="text-[10px] text-amber-400 bg-amber-400/10 px-1.5 py-0.5 rounded font-medium">
              DISCOVERED
            </span>
          )}
          <StatusBadge status={session.status} />
        </div>
      </div>

      {/* Meta: Project, Ticket ID, Command */}
      <div className="flex flex-wrap items-center gap-2 mb-3">
        {session.project?.name && (
          <span className="text-[13px] text-content-secondary">{session.project.name}</span>
        )}

        {session.ticket?.external_id && (
          <span className="text-xs text-indigo-500 bg-indigo-500/10 px-1.5 py-0.5 rounded">
            {session.ticket.external_id}
          </span>
        )}

        {commandDisplay && (
          <span className={cn('text-xs px-1.5 py-0.5 rounded bg-surface-tertiary', commandDisplay.color)}>
            {commandDisplay.label}
            {commandDisplay.hint && (
              <span className="ml-1 text-content-muted text-[10px]">({commandDisplay.hint})</span>
            )}
          </span>
        )}
      </div>

      {contextPercent !== null && (
        <div className="mb-2">
          <div className="h-1 bg-surface-tertiary rounded-sm overflow-hidden mb-1">
            <div
              className="h-full bg-indigo-500 rounded-sm transition-[width] duration-300"
              style={{ width: `${contextPercent}%` }}
            />
          </div>
          <span className="text-xs text-content-muted">{contextPercent}% context</span>
        </div>
      )}

      <div className="flex items-center gap-2">
        {session.started_at && (
          <span className="text-xs text-content-muted">
            Started {formatRelativeTime(session.started_at)}
          </span>
        )}
      </div>

      {errorMessage && (
        <div className="mt-3 p-2 text-xs text-red-500 bg-red-500/10 rounded">
          {errorMessage}
        </div>
      )}
    </div>
  );
}

function formatRelativeTime(dateStr: string): string {
  const date = new Date(dateStr);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffMins = Math.floor(diffMs / 60000);

  if (diffMins < 1) return 'just now';
  if (diffMins < 60) return `${diffMins}m ago`;

  const diffHours = Math.floor(diffMins / 60);
  if (diffHours < 24) return `${diffHours}h ago`;

  const diffDays = Math.floor(diffHours / 24);
  return `${diffDays}d ago`;
}
