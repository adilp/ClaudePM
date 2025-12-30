/**
 * SessionCard Component
 * Displays individual session information with click-to-focus functionality
 */

import { useState, useCallback } from 'react';
import type { Session } from '../types/api';
import { StatusBadge } from './StatusBadge';
import { focusSession, showErrorNotification } from '../services/session-controller';

type FocusState = 'idle' | 'loading' | 'success' | 'error';

interface SessionCardProps {
  session: Session;
  isSelected?: boolean;
  onSelect?: () => void;
  onDoubleClick?: () => void;
}

export function SessionCard({
  session,
  isSelected = false,
  onSelect,
  onDoubleClick,
}: SessionCardProps) {
  const [focusState, setFocusState] = useState<FocusState>('idle');
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const name = session.ticket?.title ?? session.project?.name ?? 'Unnamed Session';
  const contextPercent = session.context_percent;

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

  const cardClassName = [
    'session-card',
    isSelected && 'session-card--selected',
    focusState === 'loading' && 'session-card--loading',
    focusState === 'success' && 'session-card--success',
    focusState === 'error' && 'session-card--error',
  ]
    .filter(Boolean)
    .join(' ');

  return (
    <div
      className={cardClassName}
      onClick={handleClick}
      onDoubleClick={handleDoubleClick}
      tabIndex={0}
      role="button"
      aria-pressed={isSelected}
      aria-busy={focusState === 'loading'}
    >
      {focusState === 'loading' && (
        <div className="session-card__loading-overlay">
          <div className="spinner spinner--small" />
        </div>
      )}

      <div className="session-card__header">
        <span className="session-card__name">{name}</span>
        <StatusBadge status={session.status} />
      </div>

      <div className="session-card__details">
        {session.project?.name && (
          <span className="session-card__project">{session.project.name}</span>
        )}

        {session.ticket?.external_id && (
          <span className="session-card__ticket-id">{session.ticket.external_id}</span>
        )}
      </div>

      {contextPercent !== null && (
        <div className="session-card__context">
          <div className="session-card__context-bar">
            <div
              className="session-card__context-fill"
              style={{ width: `${contextPercent}%` }}
            />
          </div>
          <span className="session-card__context-label">{contextPercent}% context</span>
        </div>
      )}

      <div className="session-card__meta">
        {session.started_at && (
          <span className="session-card__time">
            Started {formatRelativeTime(session.started_at)}
          </span>
        )}
      </div>

      {errorMessage && (
        <div className="session-card__error">
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
