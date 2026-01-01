/**
 * SessionDetailModal Component
 * Displays detailed session information in a modal overlay with tabs
 * for Overview, Summary, Activity, and Review
 */

import { useCallback, useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { X } from 'lucide-react';
import { cn } from '../lib/utils';
import type { Session } from '../types/api';
import { StatusBadge } from './StatusBadge';
import { SessionSummaryCard } from './session/SessionSummaryCard';
import { SessionActivityFeed } from './session/SessionActivityFeed';
import { ReviewReportPanel } from './session/ReviewReportPanel';

type TabId = 'overview' | 'summary' | 'activity' | 'review';

interface Tab {
  id: TabId;
  label: string;
}

const tabs: Tab[] = [
  { id: 'overview', label: 'Overview' },
  { id: 'summary', label: 'Summary' },
  { id: 'activity', label: 'Activity' },
  { id: 'review', label: 'Review' },
];

interface SessionDetailModalProps {
  session: Session;
  onClose: () => void;
}

export function SessionDetailModal({ session, onClose }: SessionDetailModalProps) {
  const [activeTab, setActiveTab] = useState<TabId>('overview');
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
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60"
      onClick={handleBackdropClick}
    >
      <div
        className="bg-surface-secondary border border-line rounded-xl shadow-xl w-full max-w-2xl mx-4 max-h-[85vh] flex flex-col animate-[dialog-fade-in_0.2s_ease-out]"
        role="dialog"
        aria-modal="true"
        aria-labelledby="modal-title"
      >
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-line shrink-0">
          <h2 id="modal-title" className="text-lg font-semibold text-content-primary truncate pr-4">
            {name}
          </h2>
          <button
            className="p-1.5 rounded-lg text-content-muted hover:text-content-primary hover:bg-surface-tertiary transition-colors"
            onClick={onClose}
            aria-label="Close"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Tabs */}
        <div className="flex border-b border-line shrink-0">
          {tabs.map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={cn(
                'px-4 py-2.5 text-sm font-medium transition-colors',
                activeTab === tab.id
                  ? 'text-indigo-400 border-b-2 border-indigo-400'
                  : 'text-content-muted hover:text-content-primary'
              )}
            >
              {tab.label}
            </button>
          ))}
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-5">
          {activeTab === 'overview' && (
            <OverviewTab session={session} />
          )}
          {activeTab === 'summary' && (
            <SessionSummaryCard sessionId={session.id} />
          )}
          {activeTab === 'activity' && (
            <SessionActivityFeed sessionId={session.id} maxEvents={50} />
          )}
          {activeTab === 'review' && (
            <ReviewReportPanel sessionId={session.id} projectId={session.project_id} />
          )}
        </div>

        {/* Footer */}
        <div className="px-5 py-4 border-t border-line shrink-0">
          <button
            className="w-full px-4 py-2 bg-surface-tertiary text-content-primary rounded-lg text-sm font-medium hover:bg-line transition-colors"
            onClick={onClose}
          >
            Close
          </button>
        </div>
      </div>
    </div>,
    document.body
  );
}

function OverviewTab({ session }: { session: Session }) {
  const getContextColor = (percent: number) => {
    if (percent >= 80) return 'bg-red-500';
    if (percent >= 60) return 'bg-yellow-500';
    return 'bg-green-500';
  };

  return (
    <div className="space-y-3">
      <DetailRow label="Status">
        <StatusBadge status={session.status} />
      </DetailRow>

      <DetailRow label="Type">
        <span className="px-2 py-0.5 bg-surface-tertiary text-content-secondary text-xs font-medium rounded">
          {session.type}
        </span>
      </DetailRow>

      {session.project && (
        <DetailRow label="Project">
          <span className="text-sm text-content-primary">{session.project.name}</span>
        </DetailRow>
      )}

      {session.ticket && (
        <>
          <DetailRow label="Ticket">
            <span className="text-sm text-content-primary">{session.ticket.title}</span>
          </DetailRow>
          {session.ticket.external_id && (
            <DetailRow label="Ticket ID">
              <span className="text-sm font-mono text-indigo-400">
                {session.ticket.external_id}
              </span>
            </DetailRow>
          )}
        </>
      )}

      {session.context_percent !== null && (
        <DetailRow label="Context Usage">
          <div className="flex items-center gap-2">
            <div className="w-20 h-1.5 bg-surface-tertiary rounded-full overflow-hidden">
              <div
                className={`h-full ${getContextColor(session.context_percent)} transition-all`}
                style={{ width: `${session.context_percent}%` }}
              />
            </div>
            <span className="text-xs text-content-muted">{session.context_percent}%</span>
          </div>
        </DetailRow>
      )}

      {session.pane_id && (
        <DetailRow label="Pane ID">
          <span className="text-sm font-mono text-content-secondary">{session.pane_id}</span>
        </DetailRow>
      )}

      <DetailRow label="Session ID">
        <span className="text-xs font-mono text-content-muted truncate max-w-[200px]">
          {session.id}
        </span>
      </DetailRow>

      {session.started_at && (
        <DetailRow label="Started">
          <span className="text-sm text-content-primary">{formatDateTime(session.started_at)}</span>
        </DetailRow>
      )}

      {session.ended_at && (
        <DetailRow label="Ended">
          <span className="text-sm text-content-primary">{formatDateTime(session.ended_at)}</span>
        </DetailRow>
      )}

      <DetailRow label="Created">
        <span className="text-sm text-content-primary">{formatDateTime(session.created_at)}</span>
      </DetailRow>
    </div>
  );
}

function DetailRow({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-4">
      <span className="text-sm text-content-muted shrink-0">{label}</span>
      {children}
    </div>
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
