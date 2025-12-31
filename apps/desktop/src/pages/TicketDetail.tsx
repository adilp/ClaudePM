/**
 * Ticket Detail Page
 * Comprehensive ticket view with state management, content editing, and AI analysis
 */

import { useState } from 'react';
import { useParams, Link, useNavigate } from 'react-router-dom';
import { cn } from '../lib/utils';
import { MarkdownContent } from '../components/MarkdownContent';
import { SessionSummaryCard, ReviewReportPanel } from '../components/session';
import {
  useTicket,
  useTicketContent,
  useTicketHistory,
  useUpdateTicketState,
  useUpdateTicketContent,
  useUpdateTicketTitle,
  useApproveTicket,
  useRejectTicket,
  useDeleteTicket,
  useStartTicket,
} from '../hooks/useTickets';
import { useSessions } from '../hooks/useSessions';
import type { TicketState } from '../types/api';

const stateStyles: Record<TicketState, string> = {
  backlog: 'bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-300',
  in_progress: 'bg-blue-100 text-blue-700 dark:bg-blue-900 dark:text-blue-300',
  review: 'bg-yellow-100 text-yellow-700 dark:bg-yellow-900 dark:text-yellow-300',
  done: 'bg-green-100 text-green-700 dark:bg-green-900 dark:text-green-300',
};

export function TicketDetail() {
  const { projectId, ticketId } = useParams<{
    projectId: string;
    ticketId: string;
  }>();
  const navigate = useNavigate();
  const { data: ticket, isLoading, error } = useTicket(projectId!, ticketId!);
  const { data: ticketContent } = useTicketContent(ticketId!);
  const { data: ticketHistory } = useTicketHistory(ticketId!);
  const { data: sessions } = useSessions(projectId);

  // Mutations
  const updateState = useUpdateTicketState();
  const updateContent = useUpdateTicketContent();
  const updateTitle = useUpdateTicketTitle();
  const approveTicket = useApproveTicket();
  const rejectTicket = useRejectTicket();
  const deleteTicket = useDeleteTicket();
  const startTicket = useStartTicket();

  // Local state
  const [showRejectModal, setShowRejectModal] = useState(false);
  const [rejectFeedback, setRejectFeedback] = useState('');
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const [editContent, setEditContent] = useState('');
  const [isEditingTitle, setIsEditingTitle] = useState(false);
  const [editTitle, setEditTitle] = useState('');

  // Check if this ticket has a running session
  const hasRunningSession =
    sessions?.some(
      (s) => s.ticket_id === ticketId && s.status === 'running'
    ) ?? false;

  // Get the most recent session for this ticket
  const ticketSessions =
    sessions?.filter((s) => s.ticket_id === ticketId) ?? [];
  const latestSession =
    ticketSessions.length > 0
      ? ticketSessions.reduce((latest, s) =>
          new Date(s.created_at) > new Date(latest.created_at) ? s : latest
        )
      : null;

  // Find when ticket was moved to review status
  const reviewedAtEntry = ticketHistory?.find(
    (entry) => entry.to_state === 'review'
  );
  const reviewedAt = reviewedAtEntry?.created_at;

  const handleStateChange = (newState: TicketState) => {
    if (newState !== ticket?.state) {
      updateState.mutate({ ticketId: ticketId!, state: newState });
    }
  };

  const handleStartSession = () => {
    startTicket.mutate(ticketId!, {
      onSuccess: (result) => {
        navigate(`/sessions/${result.session.id}`);
      },
    });
  };

  const handleApprove = () => {
    approveTicket.mutate(ticketId!);
  };

  const handleReject = () => {
    if (!rejectFeedback.trim()) return;
    rejectTicket.mutate(
      { ticketId: ticketId!, feedback: rejectFeedback },
      {
        onSuccess: () => {
          setShowRejectModal(false);
          setRejectFeedback('');
        },
      }
    );
  };

  const handleUpdateTitle = () => {
    if (!editTitle.trim() || editTitle === ticket?.title) {
      setIsEditingTitle(false);
      return;
    }
    updateTitle.mutate(
      { ticketId: ticketId!, title: editTitle },
      {
        onSuccess: () => {
          setIsEditingTitle(false);
        },
      }
    );
  };

  const handleUpdateContent = () => {
    updateContent.mutate(
      { ticketId: ticketId!, content: editContent },
      {
        onSuccess: () => {
          setIsEditing(false);
        },
      }
    );
  };

  const handleDelete = () => {
    deleteTicket.mutate(ticketId!, {
      onSuccess: () => {
        navigate(`/projects/${projectId}`);
      },
    });
  };

  if (isLoading) {
    return (
      <div className="page page--loading">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-500" />
        <p className="text-gray-400">Loading ticket...</p>
      </div>
    );
  }

  if (error || !ticket) {
    return (
      <div className="page page--error">
        <div className="error-content">
          <svg
            width="48"
            height="48"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            className="text-red-500 mb-4"
          >
            <circle cx="12" cy="12" r="10" />
            <line x1="12" y1="8" x2="12" y2="12" />
            <line x1="12" y1="16" x2="12.01" y2="16" />
          </svg>
          <h2 className="text-xl font-semibold text-gray-200 mb-2">Ticket not found</h2>
          <Link
            to={`/projects/${projectId}`}
            className="text-blue-400 hover:text-blue-300"
          >
            ← Back to Project
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="page ticket-detail">
      {/* Breadcrumb */}
      <Link
        to={`/projects/${projectId}`}
        className="ticket-detail__breadcrumb"
      >
        <ArrowLeftIcon style={{ width: '1rem', height: '1rem' }} />
        Back to Project
      </Link>

      {/* Header */}
      <div className="ticket-detail__header">
        <div className="ticket-detail__header-left">
          {/* State and badges */}
          <div className="ticket-detail__badges">
            <div className="relative">
              <select
                value={ticket.state}
                onChange={(e) => handleStateChange(e.target.value as TicketState)}
                disabled={updateState.isPending}
                className={cn(
                  'appearance-none cursor-pointer inline-flex items-center gap-1.5 pl-3 pr-8 py-1 rounded-full text-sm font-medium border-0 focus:outline-none focus:ring-2 focus:ring-ring',
                  stateStyles[ticket.state],
                  updateState.isPending && 'opacity-50 cursor-wait'
                )}
              >
                <option value="backlog">Backlog</option>
                <option value="in_progress">In Progress</option>
                <option value="review">Review</option>
                <option value="done">Done</option>
              </select>
              <ChevronDownIcon className="absolute right-2 top-1/2 -translate-y-1/2 h-4 w-4 pointer-events-none" />
            </div>

            {ticket.is_adhoc && (
              <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-purple-100 dark:bg-purple-900 text-purple-700 dark:text-purple-300">
                ADHOC
              </span>
            )}

            {ticket.external_id && (
              <span className="text-sm text-muted-foreground font-mono">
                {ticket.external_id}
              </span>
            )}
          </div>

          {/* Title */}
          {isEditingTitle ? (
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
              <input
                type="text"
                value={editTitle}
                onChange={(e) => setEditTitle(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') handleUpdateTitle();
                  if (e.key === 'Escape') setIsEditingTitle(false);
                }}
                className="form-input"
                style={{ fontSize: '1.5rem', fontWeight: 'bold' }}
                autoFocus
              />
              <button
                onClick={handleUpdateTitle}
                disabled={updateTitle.isPending}
                className="icon-btn"
                style={{ color: 'var(--success)' }}
                title="Save"
              >
                <CheckIcon style={{ width: '1.25rem', height: '1.25rem' }} />
              </button>
              <button
                onClick={() => setIsEditingTitle(false)}
                className="icon-btn"
                title="Cancel"
              >
                <XIcon style={{ width: '1.25rem', height: '1.25rem' }} />
              </button>
            </div>
          ) : (
            <h1 className="ticket-detail__title">
              {ticket.title}
              {ticket.is_adhoc && (
                <button
                  onClick={() => {
                    setEditTitle(ticket.title);
                    setIsEditingTitle(true);
                  }}
                  className="icon-btn"
                  title="Edit title"
                >
                  <PencilIcon style={{ width: '1rem', height: '1rem' }} />
                </button>
              )}
            </h1>
          )}

          {/* File path */}
          <p className="ticket-detail__path">
            <FileTextIcon style={{ width: '1rem', height: '1rem' }} />
            {ticket.file_path}
          </p>
        </div>

        {/* Action Buttons */}
        <div className="ticket-detail__actions">
          {/* Start Session button */}
          {!hasRunningSession && ticket.state !== 'done' && (
            <button
              onClick={handleStartSession}
              disabled={startTicket.isPending}
              className="btn btn--primary"
            >
              <PlayIcon style={{ width: '1rem', height: '1rem' }} />
              {startTicket.isPending ? 'Starting...' : 'Start Session'}
            </button>
          )}

          {/* View Sessions link if running */}
          {hasRunningSession && (
            <Link to="/sessions" className="btn btn--info">
              <ExternalLinkIcon style={{ width: '1rem', height: '1rem' }} />
              View Sessions
            </Link>
          )}

          {/* Review state buttons */}
          {ticket.state === 'review' && (
            <>
              <Link
                to={`/projects/${projectId}/tickets/${ticketId}/review`}
                className="btn btn--secondary"
              >
                <ExternalLinkIcon style={{ width: '1rem', height: '1rem' }} />
                Review Changes
              </Link>
              <button
                onClick={handleApprove}
                disabled={approveTicket.isPending || rejectTicket.isPending}
                className="btn btn--success"
              >
                <CheckCircleIcon style={{ width: '1rem', height: '1rem' }} />
                {approveTicket.isPending ? 'Approving...' : 'Approve'}
              </button>
              <button
                onClick={() => setShowRejectModal(true)}
                disabled={approveTicket.isPending || rejectTicket.isPending}
                className="btn btn--danger"
              >
                <XCircleIcon style={{ width: '1rem', height: '1rem' }} />
                Reject
              </button>
            </>
          )}

          {/* Done state indicator */}
          {ticket.state === 'done' && (
            <span className="badge badge--success" style={{ padding: '0.5rem 1rem' }}>
              <CheckCircleIcon style={{ width: '1rem', height: '1rem' }} />
              Completed
            </span>
          )}

          {/* Delete button */}
          {!hasRunningSession && (
            <button
              onClick={() => setShowDeleteModal(true)}
              className="btn btn--danger-outline"
              title="Delete ticket"
            >
              <TrashIcon style={{ width: '1rem', height: '1rem' }} />
              Delete
            </button>
          )}
        </div>
      </div>

      {/* Ticket Content */}
      <div className="ticket-detail__card">
        <div className="ticket-detail__card-header">
          <h2>Ticket Content</h2>
          {!isEditing && (
            <button
              onClick={() => {
                setEditContent(ticketContent?.content || ticket.content);
                setIsEditing(true);
              }}
              className="btn btn--secondary btn--sm"
            >
              <PencilIcon className="h-4 w-4" />
              Edit
            </button>
          )}
        </div>
        {isEditing ? (
          <div className="ticket-detail__card-body">
            <textarea
              value={editContent}
              onChange={(e) => setEditContent(e.target.value)}
              className="form-textarea"
              style={{ height: '24rem', fontFamily: 'monospace' }}
              placeholder="Enter ticket content in markdown..."
            />
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.5rem', marginTop: '1rem' }}>
              <button
                onClick={() => setIsEditing(false)}
                className="btn btn--secondary"
              >
                <XIcon className="h-4 w-4" />
                Cancel
              </button>
              <button
                onClick={handleUpdateContent}
                disabled={updateContent.isPending}
                className="btn btn--primary"
              >
                <SaveIcon className="h-4 w-4" />
                {updateContent.isPending ? 'Saving...' : 'Save'}
              </button>
            </div>
          </div>
        ) : (
          <div className="ticket-detail__card-body">
            <MarkdownContent>{ticket.content}</MarkdownContent>
          </div>
        )}
      </div>

      {/* Timestamps */}
      <div className="ticket-detail__timestamps">
        <div className="ticket-detail__timestamps-grid">
          <div>
            <p className="ticket-detail__timestamp-label">Created</p>
            <p className="ticket-detail__timestamp-value">
              {new Date(ticket.created_at).toLocaleString()}
            </p>
          </div>
          <div>
            <p className="ticket-detail__timestamp-label">Updated</p>
            <p className="ticket-detail__timestamp-value">
              {new Date(ticket.updated_at).toLocaleString()}
            </p>
          </div>
          {ticket.started_at && (
            <div>
              <p className="ticket-detail__timestamp-label">Started</p>
              <p className="ticket-detail__timestamp-value">
                {new Date(ticket.started_at).toLocaleString()}
              </p>
            </div>
          )}
          {reviewedAt && (
            <div>
              <p className="ticket-detail__timestamp-label">Moved to Review</p>
              <span className="badge badge--warning">
                {new Date(reviewedAt).toLocaleString()}
              </span>
            </div>
          )}
          {ticket.completed_at && (
            <div>
              <p className="ticket-detail__timestamp-label">Completed</p>
              <p className="ticket-detail__timestamp-value">
                {new Date(ticket.completed_at).toLocaleString()}
              </p>
            </div>
          )}
        </div>
      </div>

      {/* AI Analysis Section */}
      {latestSession && (
        <div className="space-y-4">
          <div className="flex items-center gap-2">
            <SparklesIcon className="h-5 w-5 text-purple-500" />
            <h2 className="text-lg font-semibold">AI Analysis</h2>
            <Link
              to={`/sessions/${latestSession.id}`}
              className="text-sm text-muted-foreground hover:text-foreground ml-auto"
            >
              View Session
            </Link>
          </div>

          <div className="grid gap-4 lg:grid-cols-2">
            {/* Session Summary */}
            <SessionSummaryCard sessionId={latestSession.id} />

            {/* Review Report - Show if ticket is in review or done */}
            {(ticket.state === 'review' || ticket.state === 'done') && (
              <ReviewReportPanel sessionId={latestSession.id} />
            )}
          </div>
        </div>
      )}

      {/* Reject Modal */}
      {showRejectModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
          <div className="bg-gray-800 rounded-lg border border-gray-700 shadow-lg p-6 w-full max-w-md mx-4">
            <h3 className="text-lg font-semibold mb-4 text-gray-100">Reject Ticket</h3>
            <p className="text-sm text-gray-400 mb-4">
              Please provide feedback explaining why this ticket is being rejected.
              This will be sent back to the session for revision.
            </p>
            <textarea
              value={rejectFeedback}
              onChange={(e) => setRejectFeedback(e.target.value)}
              placeholder="Enter feedback..."
              className="w-full h-32 rounded-md border border-gray-600 bg-gray-900 px-3 py-2 text-sm resize-none focus:outline-none focus:ring-2 focus:ring-blue-500 text-gray-200"
            />
            <div className="flex justify-end gap-2 mt-4">
              <button
                onClick={() => {
                  setShowRejectModal(false);
                  setRejectFeedback('');
                }}
                className="px-4 py-2 text-sm rounded-md border border-gray-600 hover:bg-gray-700 text-gray-200"
              >
                Cancel
              </button>
              <button
                onClick={handleReject}
                disabled={!rejectFeedback.trim() || rejectTicket.isPending}
                className="px-4 py-2 text-sm rounded-md bg-red-600 text-white hover:bg-red-700 disabled:opacity-50"
              >
                {rejectTicket.isPending ? 'Rejecting...' : 'Reject'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Delete Confirmation Modal */}
      {showDeleteModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
          <div className="bg-gray-800 rounded-lg border border-gray-700 shadow-lg p-6 w-full max-w-md mx-4">
            <h3 className="text-lg font-semibold mb-4 flex items-center gap-2 text-red-500">
              <TrashIcon className="h-5 w-5" />
              Delete Ticket
            </h3>
            <p className="text-sm text-gray-400 mb-4">
              Are you sure you want to delete this ticket? This action cannot be undone.
              The ticket file and all associated data will be permanently removed.
            </p>
            <div className="rounded-md bg-gray-900 p-3 mb-4">
              <p className="font-medium text-sm text-gray-200">{ticket.title}</p>
              <p className="text-xs text-gray-500">{ticket.file_path}</p>
            </div>
            <div className="flex justify-end gap-2">
              <button
                onClick={() => setShowDeleteModal(false)}
                className="px-4 py-2 text-sm rounded-md border border-gray-600 hover:bg-gray-700 text-gray-200"
              >
                Cancel
              </button>
              <button
                onClick={handleDelete}
                disabled={deleteTicket.isPending}
                className="px-4 py-2 text-sm rounded-md bg-red-600 text-white hover:bg-red-700 disabled:opacity-50"
              >
                {deleteTicket.isPending ? 'Deleting...' : 'Delete'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// Icon components using inline SVG for consistency with Tailwind approach
type IconProps = { className?: string; style?: React.CSSProperties };

function ArrowLeftIcon({ className, style }: IconProps) {
  return (
    <svg className={className} style={style} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <line x1="19" y1="12" x2="5" y2="12" />
      <polyline points="12 19 5 12 12 5" />
    </svg>
  );
}

function ChevronDownIcon({ className, style }: IconProps) {
  return (
    <svg className={className} style={style} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="6 9 12 15 18 9" />
    </svg>
  );
}

function CheckIcon({ className, style }: IconProps) {
  return (
    <svg className={className} style={style} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="20 6 9 17 4 12" />
    </svg>
  );
}

function XIcon({ className, style }: IconProps) {
  return (
    <svg className={className} style={style} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <line x1="18" y1="6" x2="6" y2="18" />
      <line x1="6" y1="6" x2="18" y2="18" />
    </svg>
  );
}

function PencilIcon({ className, style }: IconProps) {
  return (
    <svg className={className} style={style} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" />
      <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" />
    </svg>
  );
}

function FileTextIcon({ className, style }: IconProps) {
  return (
    <svg className={className} style={style} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
      <polyline points="14 2 14 8 20 8" />
      <line x1="16" y1="13" x2="8" y2="13" />
      <line x1="16" y1="17" x2="8" y2="17" />
      <polyline points="10 9 9 9 8 9" />
    </svg>
  );
}

function PlayIcon({ className, style }: IconProps) {
  return (
    <svg className={className} style={style} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <polygon points="5 3 19 12 5 21 5 3" />
    </svg>
  );
}

function ExternalLinkIcon({ className, style }: IconProps) {
  return (
    <svg className={className} style={style} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6" />
      <polyline points="15 3 21 3 21 9" />
      <line x1="10" y1="14" x2="21" y2="3" />
    </svg>
  );
}

function CheckCircleIcon({ className, style }: IconProps) {
  return (
    <svg className={className} style={style} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14" />
      <polyline points="22 4 12 14.01 9 11.01" />
    </svg>
  );
}

function XCircleIcon({ className, style }: IconProps) {
  return (
    <svg className={className} style={style} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="10" />
      <line x1="15" y1="9" x2="9" y2="15" />
      <line x1="9" y1="9" x2="15" y2="15" />
    </svg>
  );
}

function TrashIcon({ className, style }: IconProps) {
  return (
    <svg className={className} style={style} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="3 6 5 6 21 6" />
      <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
      <line x1="10" y1="11" x2="10" y2="17" />
      <line x1="14" y1="11" x2="14" y2="17" />
    </svg>
  );
}

function SaveIcon({ className, style }: IconProps) {
  return (
    <svg className={className} style={style} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z" />
      <polyline points="17 21 17 13 7 13 7 21" />
      <polyline points="7 3 7 8 15 8" />
    </svg>
  );
}

function SparklesIcon({ className, style }: IconProps) {
  return (
    <svg className={className} style={style} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2" />
    </svg>
  );
}
