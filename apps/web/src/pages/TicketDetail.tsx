/**
 * Ticket Detail Page
 */

import { useState } from 'react';
import { useParams, Link, useNavigate } from 'react-router-dom';
import Markdown from 'react-markdown';
import { useTicket, useApproveTicket, useRejectTicket, useUpdateTicketState, useTicketContent, useUpdateTicketContent, useStartTicket, useUpdateTicketTitle, useDeleteTicket, useTicketHistory } from '@/hooks/useTickets';
import { useSessions } from '@/hooks/useSessions';
import { useGitDiff } from '@/hooks/useGit';
import { cn } from '@/lib/utils';
import type { TicketState } from '@/types/api';
import { SessionSummaryCard, ReviewReportPanel } from '@/components/session';
import { DiffViewer } from '@/components/review/DiffViewer';
import {
  ArrowLeft,
  Play,
  CheckCircle,
  XCircle,
  Clock,
  AlertCircle,
  FileText,
  ExternalLink,
  Pencil,
  X,
  Save,
  Sparkles,
  Trash2,
  Check,
  ChevronDown,
  ChevronRight,
  GitCompare,
  RefreshCw,
} from 'lucide-react';

const stateConfig: Record<TicketState, { label: string; color: string; bgColor: string; icon: typeof Clock }> = {
  backlog: { label: 'Backlog', color: 'text-gray-700', bgColor: 'bg-gray-100', icon: Clock },
  in_progress: { label: 'In Progress', color: 'text-blue-700', bgColor: 'bg-blue-100', icon: Play },
  review: { label: 'Review', color: 'text-yellow-700', bgColor: 'bg-yellow-100', icon: AlertCircle },
  done: { label: 'Done', color: 'text-green-700', bgColor: 'bg-green-100', icon: CheckCircle },
};

export function TicketDetail() {
  const { projectId, ticketId } = useParams<{ projectId: string; ticketId: string }>();
  const navigate = useNavigate();
  const { data: ticket, isLoading, error } = useTicket(projectId!, ticketId!);
  const { data: sessions } = useSessions(projectId);
  const startTicket = useStartTicket();
  const approveTicket = useApproveTicket();
  const rejectTicket = useRejectTicket();
  const updateState = useUpdateTicketState();

  // Check if this ticket has a running session
  const hasRunningSession = sessions?.some(
    (s) => s.ticket_id === ticketId && s.status === 'running'
  ) ?? false;

  // Get the most recent session for this ticket
  const ticketSessions = sessions?.filter((s) => s.ticket_id === ticketId) ?? [];
  const latestSession = ticketSessions.length > 0
    ? ticketSessions.reduce((latest, s) =>
        new Date(s.created_at) > new Date(latest.created_at) ? s : latest
      )
    : null;

  const [showRejectModal, setShowRejectModal] = useState(false);
  const [rejectFeedback, setRejectFeedback] = useState('');
  const [isEditing, setIsEditing] = useState(false);
  const [editContent, setEditContent] = useState('');
  const [isEditingTitle, setIsEditingTitle] = useState(false);
  const [editTitle, setEditTitle] = useState('');
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [isDiffExpanded, setIsDiffExpanded] = useState(false);

  // Fetch git diff for review state tickets
  const { data: diff, isLoading: diffLoading, refetch: refetchDiff } = useGitDiff(projectId!);

  // Query for ticket content (used for adhoc editing)
  const { data: ticketContent } = useTicketContent(ticketId!);
  const updateContent = useUpdateTicketContent();
  const updateTitle = useUpdateTicketTitle();
  const deleteTicket = useDeleteTicket();
  const { data: ticketHistory } = useTicketHistory(ticketId!);

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

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" />
      </div>
    );
  }

  if (error || !ticket) {
    return (
      <div className="space-y-4">
        <Link
          to={`/projects/${projectId}`}
          className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="h-4 w-4" />
          Back to Project
        </Link>
        <div className="rounded-lg border border-destructive bg-destructive/10 p-6 text-center">
          <p className="text-destructive">Ticket not found</p>
        </div>
      </div>
    );
  }

  const stateInfo = stateConfig[ticket.state];
  const StateIcon = stateInfo.icon;

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

  const handleDelete = () => {
    deleteTicket.mutate(ticketId!, {
      onSuccess: () => {
        navigate(`/projects/${projectId}`);
      },
    });
  };

  return (
    <div className="space-y-6">
      {/* Breadcrumb */}
      <Link
        to={`/projects/${projectId}`}
        className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="h-4 w-4" />
        Back to Project
      </Link>

      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-3 mb-2">
            <div className="relative">
              <select
                value={ticket.state}
                onChange={(e) => handleStateChange(e.target.value as TicketState)}
                disabled={updateState.isPending}
                className={cn(
                  'appearance-none cursor-pointer inline-flex items-center gap-1.5 pl-8 pr-8 py-1 rounded-full text-sm font-medium border-0 focus:outline-none focus:ring-2 focus:ring-ring',
                  stateInfo.bgColor,
                  stateInfo.color,
                  updateState.isPending && 'opacity-50 cursor-wait'
                )}
              >
                <option value="backlog">Backlog</option>
                <option value="in_progress">In Progress</option>
                <option value="review">Review</option>
                <option value="done">Done</option>
              </select>
              <StateIcon className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 pointer-events-none" />
              <svg className="absolute right-2 top-1/2 -translate-y-1/2 h-4 w-4 pointer-events-none" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
              </svg>
            </div>
            {ticket.is_adhoc && (
              <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-purple-100 text-purple-700">
                ADHOC
              </span>
            )}
            {ticket.external_id && (
              <span className="text-sm text-muted-foreground font-mono">
                {ticket.external_id}
              </span>
            )}
          </div>
          {isEditingTitle ? (
            <div className="flex items-center gap-2">
              <input
                type="text"
                value={editTitle}
                onChange={(e) => setEditTitle(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') handleUpdateTitle();
                  if (e.key === 'Escape') setIsEditingTitle(false);
                }}
                className="text-2xl font-bold bg-background border rounded-md px-2 py-1 focus:outline-none focus:ring-2 focus:ring-primary"
                autoFocus
              />
              <button
                onClick={handleUpdateTitle}
                disabled={updateTitle.isPending}
                className="p-1.5 rounded-md hover:bg-accent text-green-600"
                title="Save"
              >
                <Check className="h-5 w-5" />
              </button>
              <button
                onClick={() => setIsEditingTitle(false)}
                className="p-1.5 rounded-md hover:bg-accent text-muted-foreground"
                title="Cancel"
              >
                <X className="h-5 w-5" />
              </button>
            </div>
          ) : (
            <div className="flex items-center gap-2">
              <h1 className="text-2xl font-bold">{ticket.title}</h1>
              {ticket.is_adhoc && (
                <button
                  onClick={() => {
                    setEditTitle(ticket.title);
                    setIsEditingTitle(true);
                  }}
                  className="p-1.5 rounded-md hover:bg-accent text-muted-foreground"
                  title="Edit title"
                >
                  <Pencil className="h-4 w-4" />
                </button>
              )}
            </div>
          )}
          <p className="text-sm text-muted-foreground mt-1 flex items-center gap-1">
            <FileText className="h-4 w-4" />
            {ticket.file_path}
          </p>
        </div>

        {/* Action Buttons */}
        <div className="flex flex-wrap items-center gap-2">
          {/* Show Start Session button if no running session */}
          {!hasRunningSession && ticket.state !== 'done' && (
            <button
              onClick={handleStartSession}
              disabled={startTicket.isPending}
              className="inline-flex items-center gap-2 rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
            >
              <Play className="h-4 w-4" />
              {startTicket.isPending ? 'Starting...' : 'Start Session'}
            </button>
          )}

          {/* Show View Sessions link if there's a running session */}
          {hasRunningSession && (
            <Link
              to={`/sessions`}
              className="inline-flex items-center gap-2 rounded-md bg-blue-500 px-4 py-2 text-sm font-medium text-white hover:bg-blue-600"
            >
              <ExternalLink className="h-4 w-4" />
              View Sessions
            </Link>
          )}

          {ticket.state === 'review' && (
            <>
              <Link
                to={`/projects/${projectId}/tickets/${ticketId}/review`}
                className="inline-flex items-center gap-2 rounded-md border px-4 py-2 text-sm font-medium hover:bg-accent"
              >
                <ExternalLink className="h-4 w-4" />
                Review Changes
              </Link>
              <button
                onClick={handleApprove}
                disabled={approveTicket.isPending || rejectTicket.isPending}
                className="inline-flex items-center gap-2 rounded-md bg-green-600 px-4 py-2 text-sm font-medium text-white hover:bg-green-700 disabled:opacity-50"
              >
                <CheckCircle className="h-4 w-4" />
                {approveTicket.isPending ? 'Approving...' : 'Approve'}
              </button>
              <button
                onClick={() => setShowRejectModal(true)}
                disabled={approveTicket.isPending || rejectTicket.isPending}
                className="inline-flex items-center gap-2 rounded-md bg-red-600 px-4 py-2 text-sm font-medium text-white hover:bg-red-700 disabled:opacity-50"
              >
                <XCircle className="h-4 w-4" />
                Reject
              </button>
            </>
          )}

          {ticket.state === 'done' && (
            <span className="inline-flex items-center gap-2 rounded-md bg-green-100 px-4 py-2 text-sm font-medium text-green-700">
              <CheckCircle className="h-4 w-4" />
              Completed
            </span>
          )}

          {/* Delete button - only show if no running session */}
          {!hasRunningSession && (
            <button
              onClick={() => setShowDeleteModal(true)}
              className="inline-flex items-center gap-2 rounded-md border border-red-200 px-4 py-2 text-sm font-medium text-red-600 hover:bg-red-50 hover:border-red-300"
              title="Delete ticket"
            >
              <Trash2 className="h-4 w-4" />
              Delete
            </button>
          )}
        </div>
      </div>

      {/* Ticket Content */}
      <div className="rounded-lg border bg-card">
        <div className="border-b px-4 py-3 flex items-center justify-between">
          <h2 className="font-semibold">Ticket Content</h2>
          {ticket.is_adhoc && !isEditing && (
            <button
              onClick={() => {
                setEditContent(ticketContent?.content || ticket.content);
                setIsEditing(true);
              }}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md text-sm font-medium border hover:bg-accent transition-colors"
            >
              <Pencil className="h-4 w-4" />
              Edit
            </button>
          )}
        </div>
        {isEditing ? (
          <div className="p-6 space-y-4">
            <textarea
              value={editContent}
              onChange={(e) => setEditContent(e.target.value)}
              className="w-full h-96 rounded-md border bg-background px-3 py-2 text-sm font-mono resize-none focus:outline-none focus:ring-2 focus:ring-primary"
              placeholder="Enter ticket content in markdown..."
            />
            <div className="flex justify-end gap-2">
              <button
                onClick={() => setIsEditing(false)}
                className="inline-flex items-center gap-1.5 px-4 py-2 rounded-md text-sm font-medium border hover:bg-accent transition-colors"
              >
                <X className="h-4 w-4" />
                Cancel
              </button>
              <button
                onClick={() => {
                  updateContent.mutate(
                    { ticketId: ticketId!, content: editContent },
                    {
                      onSuccess: () => {
                        setIsEditing(false);
                      },
                    }
                  );
                }}
                disabled={updateContent.isPending}
                className="inline-flex items-center gap-1.5 px-4 py-2 rounded-md text-sm font-medium bg-primary text-primary-foreground hover:bg-primary/90 disabled:opacity-50 transition-colors"
              >
                <Save className="h-4 w-4" />
                {updateContent.isPending ? 'Saving...' : 'Save'}
              </button>
            </div>
          </div>
        ) : (
          <div className="p-6 prose prose-sm dark:prose-invert max-w-none">
            <Markdown>{ticket.content}</Markdown>
          </div>
        )}
      </div>

      {/* Timestamps */}
      <div className="rounded-lg border bg-card p-4">
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
          <div>
            <p className="text-sm text-muted-foreground">Created</p>
            <p className="font-medium">{new Date(ticket.created_at).toLocaleString()}</p>
          </div>
          <div>
            <p className="text-sm text-muted-foreground">Updated</p>
            <p className="font-medium">{new Date(ticket.updated_at).toLocaleString()}</p>
          </div>
          {ticket.started_at && (
            <div>
              <p className="text-sm text-muted-foreground">Started</p>
              <p className="font-medium">{new Date(ticket.started_at).toLocaleString()}</p>
            </div>
          )}
          {reviewedAt && (
            <div>
              <p className="text-sm text-muted-foreground">Moved to Review</p>
              <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-sm font-medium bg-yellow-100 text-yellow-800">
                <AlertCircle className="h-3.5 w-3.5" />
                {new Date(reviewedAt).toLocaleString()}
              </span>
            </div>
          )}
          {ticket.completed_at && (
            <div>
              <p className="text-sm text-muted-foreground">Completed</p>
              <p className="font-medium">{new Date(ticket.completed_at).toLocaleString()}</p>
            </div>
          )}
        </div>
      </div>

      {/* AI Analysis Section - Show if there's a session for this ticket */}
      {latestSession && (
        <div className="space-y-4">
          <div className="flex items-center gap-2">
            <Sparkles className="h-5 w-5 text-purple-500" />
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

      {/* Code Changes Section - Show for review state tickets */}
      {ticket.state === 'review' && (
        <div className="rounded-lg border bg-card overflow-hidden max-w-full">
          <button
            onClick={() => setIsDiffExpanded(!isDiffExpanded)}
            className="w-full flex items-center justify-between px-4 py-3 hover:bg-accent/50 transition-colors"
          >
            <div className="flex items-center gap-2">
              {isDiffExpanded ? (
                <ChevronDown className="h-5 w-5" />
              ) : (
                <ChevronRight className="h-5 w-5" />
              )}
              <GitCompare className="h-5 w-5 text-blue-500" />
              <span className="font-semibold">Code Changes</span>
              {diff && (
                <span className="text-sm text-muted-foreground">
                  ({diff.files.length} file{diff.files.length !== 1 ? 's' : ''})
                </span>
              )}
            </div>
            <div className="flex items-center gap-2">
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  refetchDiff();
                }}
                className="p-1.5 rounded-md hover:bg-accent text-muted-foreground"
                title="Refresh diff"
              >
                <RefreshCw className={cn('h-4 w-4', diffLoading && 'animate-spin')} />
              </button>
              <Link
                to={`/projects/${projectId}/tickets/${ticketId}/review`}
                onClick={(e) => e.stopPropagation()}
                className="text-sm text-muted-foreground hover:text-foreground"
              >
                Full Review →
              </Link>
            </div>
          </button>

          {isDiffExpanded && (
            <div className="border-t p-2 sm:p-4 overflow-hidden">
              {diffLoading ? (
                <div className="flex items-center justify-center py-8">
                  <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-primary" />
                </div>
              ) : diff ? (
                <DiffViewer diff={diff} excludePatterns={['*.md', '*.MD', 'README*']} />
              ) : (
                <div className="text-center py-8 text-muted-foreground">
                  <GitCompare className="h-10 w-10 mx-auto mb-2 opacity-50" />
                  <p>Unable to load diff</p>
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* Reject Modal */}
      {showRejectModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
          <div className="bg-card rounded-lg border shadow-lg p-6 w-full max-w-md mx-4">
            <h3 className="text-lg font-semibold mb-4">Reject Ticket</h3>
            <p className="text-sm text-muted-foreground mb-4">
              Please provide feedback explaining why this ticket is being rejected.
              This will be sent back to the session for revision.
            </p>
            <textarea
              value={rejectFeedback}
              onChange={(e) => setRejectFeedback(e.target.value)}
              placeholder="Enter feedback..."
              className="w-full h-32 rounded-md border bg-background px-3 py-2 text-sm resize-none focus:outline-none focus:ring-2 focus:ring-primary"
            />
            <div className="flex justify-end gap-2 mt-4">
              <button
                onClick={() => {
                  setShowRejectModal(false);
                  setRejectFeedback('');
                }}
                className="px-4 py-2 text-sm rounded-md border hover:bg-accent"
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
          <div className="bg-card rounded-lg border shadow-lg p-6 w-full max-w-md mx-4">
            <h3 className="text-lg font-semibold mb-4 flex items-center gap-2 text-red-600">
              <Trash2 className="h-5 w-5" />
              Delete Ticket
            </h3>
            <p className="text-sm text-muted-foreground mb-4">
              Are you sure you want to delete this ticket? This action cannot be undone.
              The ticket file and all associated data will be permanently removed.
            </p>
            <div className="rounded-md bg-muted p-3 mb-4">
              <p className="font-medium text-sm">{ticket.title}</p>
              <p className="text-xs text-muted-foreground">{ticket.file_path}</p>
            </div>
            <div className="flex justify-end gap-2">
              <button
                onClick={() => setShowDeleteModal(false)}
                className="px-4 py-2 text-sm rounded-md border hover:bg-accent"
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
