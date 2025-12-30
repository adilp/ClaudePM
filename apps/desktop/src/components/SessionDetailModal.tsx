/**
 * SessionDetailModal Component
 * Displays detailed session information in a modal overlay
 */

import { useCallback, useEffect } from 'react';
import { createPortal } from 'react-dom';
import type { Session } from '../types/api';
import { StatusBadge } from './StatusBadge';

interface SessionDetailModalProps {
  session: Session;
  onClose: () => void;
}

export function SessionDetailModal({ session, onClose }: SessionDetailModalProps) {
  const name = session.ticket?.title ?? session.project?.name ?? 'Unnamed Session';

  // Close on escape key
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [onClose]);

  // Prevent scroll on body when modal is open
  useEffect(() => {
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = '';
    };
  }, []);

  const handleBackdropClick = useCallback(
    (e: React.MouseEvent) => {
      if (e.target === e.currentTarget) {
        onClose();
      }
    },
    [onClose]
  );

  // Use portal to render modal at document body level
  return createPortal(
    <div className="modal-backdrop" onClick={handleBackdropClick}>
      <div className="modal" role="dialog" aria-modal="true" aria-labelledby="modal-title">
        <div className="modal__header">
          <h2 id="modal-title" className="modal__title">{name}</h2>
          <button className="modal__close" onClick={onClose} aria-label="Close">
            <svg
              width="20"
              height="20"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <line x1="18" y1="6" x2="6" y2="18" />
              <line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </button>
        </div>

        <div className="modal__content">
          <div className="detail-row">
            <span className="detail-label">Status</span>
            <StatusBadge status={session.status} />
          </div>

          <div className="detail-row">
            <span className="detail-label">Type</span>
            <span className="detail-value detail-value--tag">{session.type}</span>
          </div>

          {session.project && (
            <div className="detail-row">
              <span className="detail-label">Project</span>
              <span className="detail-value">{session.project.name}</span>
            </div>
          )}

          {session.ticket && (
            <>
              <div className="detail-row">
                <span className="detail-label">Ticket</span>
                <span className="detail-value">{session.ticket.title}</span>
              </div>
              {session.ticket.external_id && (
                <div className="detail-row">
                  <span className="detail-label">Ticket ID</span>
                  <span className="detail-value detail-value--code">
                    {session.ticket.external_id}
                  </span>
                </div>
              )}
            </>
          )}

          {session.context_percent !== null && (
            <div className="detail-row">
              <span className="detail-label">Context Usage</span>
              <div className="detail-context">
                <div className="detail-context__bar">
                  <div
                    className="detail-context__fill"
                    style={{ width: `${session.context_percent}%` }}
                  />
                </div>
                <span className="detail-context__label">{session.context_percent}%</span>
              </div>
            </div>
          )}

          {session.pane_id && (
            <div className="detail-row">
              <span className="detail-label">Pane ID</span>
              <span className="detail-value detail-value--code">{session.pane_id}</span>
            </div>
          )}

          <div className="detail-row">
            <span className="detail-label">Session ID</span>
            <span className="detail-value detail-value--code detail-value--small">
              {session.id}
            </span>
          </div>

          {session.started_at && (
            <div className="detail-row">
              <span className="detail-label">Started</span>
              <span className="detail-value">{formatDateTime(session.started_at)}</span>
            </div>
          )}

          {session.ended_at && (
            <div className="detail-row">
              <span className="detail-label">Ended</span>
              <span className="detail-value">{formatDateTime(session.ended_at)}</span>
            </div>
          )}

          <div className="detail-row">
            <span className="detail-label">Created</span>
            <span className="detail-value">{formatDateTime(session.created_at)}</span>
          </div>
        </div>

        <div className="modal__footer">
          <button className="modal__button" onClick={onClose}>
            Close
          </button>
        </div>
      </div>
    </div>,
    document.body
  );
}

function formatDateTime(dateStr: string): string {
  const date = new Date(dateStr);
  return date.toLocaleString(undefined, {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}
