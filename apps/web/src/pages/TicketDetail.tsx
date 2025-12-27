/**
 * Ticket Detail Page
 */

import { useState } from 'react';
import { useParams, Link, useNavigate } from 'react-router-dom';
import Markdown from 'react-markdown';
import { useTicket, useApproveTicket, useRejectTicket } from '@/hooks/useTickets';
import { useStartSession } from '@/hooks/useSessions';
import { cn } from '@/lib/utils';
import type { TicketState } from '@/types/api';
import {
  ArrowLeft,
  Play,
  CheckCircle,
  XCircle,
  Clock,
  AlertCircle,
  FileText,
  ExternalLink,
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
  const startSession = useStartSession();
  const approveTicket = useApproveTicket();
  const rejectTicket = useRejectTicket();

  const [showRejectModal, setShowRejectModal] = useState(false);
  const [rejectFeedback, setRejectFeedback] = useState('');

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
    startSession.mutate(
      { project_id: projectId!, ticket_id: ticketId! },
      {
        onSuccess: (session) => {
          navigate(`/sessions/${session.id}`);
        },
      }
    );
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
      <div className="flex items-start justify-between gap-4">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-3 mb-2">
            <span className={cn(
              'inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-sm font-medium',
              stateInfo.bgColor,
              stateInfo.color
            )}>
              <StateIcon className="h-4 w-4" />
              {stateInfo.label}
            </span>
            <span className="text-sm text-muted-foreground font-mono">
              {ticket.external_id}
            </span>
          </div>
          <h1 className="text-2xl font-bold">{ticket.title}</h1>
          <p className="text-sm text-muted-foreground mt-1 flex items-center gap-1">
            <FileText className="h-4 w-4" />
            {ticket.file_path}
          </p>
        </div>

        {/* Action Buttons */}
        <div className="flex items-center gap-2 flex-shrink-0">
          {ticket.state === 'backlog' && (
            <button
              onClick={handleStartSession}
              disabled={startSession.isPending}
              className="inline-flex items-center gap-2 rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
            >
              <Play className="h-4 w-4" />
              {startSession.isPending ? 'Starting...' : 'Start Session'}
            </button>
          )}

          {ticket.state === 'in_progress' && (
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
        </div>
      </div>

      {/* Ticket Content */}
      <div className="rounded-lg border bg-card">
        <div className="border-b px-4 py-3">
          <h2 className="font-semibold">Ticket Content</h2>
        </div>
        <div className="p-6 prose prose-sm dark:prose-invert max-w-none">
          <Markdown>{ticket.content}</Markdown>
        </div>
      </div>

      {/* Timestamps */}
      <div className="rounded-lg border bg-card p-4">
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
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
          {ticket.completed_at && (
            <div>
              <p className="text-sm text-muted-foreground">Completed</p>
              <p className="font-medium">{new Date(ticket.completed_at).toLocaleString()}</p>
            </div>
          )}
        </div>
      </div>

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
    </div>
  );
}
