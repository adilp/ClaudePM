/**
 * SessionCard Component
 * Displays individual session information
 */

import type { Session } from '../types/api';
import { StatusBadge } from './StatusBadge';

interface SessionCardProps {
  session: Session;
}

export function SessionCard({ session }: SessionCardProps) {
  const name = session.ticket?.title ?? session.project?.name ?? 'Unnamed Session';
  const contextPercent = session.context_percent;

  return (
    <div className="session-card">
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
