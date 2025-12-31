/**
 * TicketReview Page
 * Comprehensive review interface for approving/rejecting tickets
 * Shows code changes and git status in a tabbed view
 */

import { useState, useEffect } from 'react';
import { useParams, Link, useNavigate } from 'react-router-dom';
import { useTicket, useApproveTicket, useRejectTicket } from '../hooks/useTickets';
import { useGitDiff, useGitStatus, useBranchInfo } from '../hooks/useGit';
import { DiffViewer } from '../components/review/DiffViewer';
import { GitStatusDisplay } from '../components/review/GitStatus';
import { cn } from '../lib/utils';
import {
  ArrowLeft,
  GitCompare,
  GitBranch,
  CheckCircle,
  XCircle,
  AlertTriangle,
  RefreshCw,
} from 'lucide-react';

type Tab = 'diff' | 'status';

export function TicketReview() {
  const { projectId, ticketId } = useParams<{ projectId: string; ticketId: string }>();
  const navigate = useNavigate();
  const [activeTab, setActiveTab] = useState<Tab>('diff');
  const [showRejectModal, setShowRejectModal] = useState(false);
  const [rejectFeedback, setRejectFeedback] = useState('');

  const { data: ticket, isLoading: ticketLoading } = useTicket(projectId!, ticketId!);
  const {
    data: diff,
    isLoading: diffLoading,
    refetch: refetchDiff,
  } = useGitDiff(projectId!);
  const {
    data: status,
    isLoading: statusLoading,
    refetch: refetchStatus,
  } = useGitStatus(projectId!);
  const { data: branch } = useBranchInfo(projectId!);
  const approveTicket = useApproveTicket();
  const rejectTicket = useRejectTicket();

  const isLoading = ticketLoading || diffLoading || statusLoading;

  // Redirect if ticket is not in review state
  useEffect(() => {
    if (ticket && ticket.state !== 'review') {
      navigate(`/projects/${projectId}/tickets/${ticketId}`);
    }
  }, [ticket, projectId, ticketId, navigate]);

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="w-8 h-8 border-2 border-surface-tertiary border-t-indigo-500 rounded-full animate-spin" />
      </div>
    );
  }

  if (!ticket) {
    return (
      <div className="p-6 space-y-4">
        <Link
          to={`/projects/${projectId}`}
          className="inline-flex items-center gap-1 text-sm text-content-secondary hover:text-content-primary"
        >
          <ArrowLeft className="h-4 w-4" />
          Back to Project
        </Link>
        <div className="rounded-lg border border-red-500/30 bg-red-500/10 p-6 text-center">
          <p className="text-red-400">Ticket not found</p>
        </div>
      </div>
    );
  }

  // Check if ticket is in review state
  if (ticket.state !== 'review') {
    return (
      <div className="p-6 space-y-4">
        <Link
          to={`/projects/${projectId}/tickets/${ticketId}`}
          className="inline-flex items-center gap-1 text-sm text-content-secondary hover:text-content-primary"
        >
          <ArrowLeft className="h-4 w-4" />
          Back to Ticket
        </Link>
        <div className="rounded-lg border border-yellow-500/30 bg-yellow-500/10 p-6 text-center">
          <AlertTriangle className="h-8 w-8 mx-auto text-yellow-400 mb-2" />
          <p className="text-yellow-400 font-medium">Ticket not in review state</p>
          <p className="text-sm text-content-muted mt-1">
            This ticket is currently in "{ticket.state}" state
          </p>
        </div>
      </div>
    );
  }

  const handleApprove = () => {
    approveTicket.mutate(ticketId!, {
      onSuccess: () => {
        navigate(`/projects/${projectId}`);
      },
    });
  };

  const handleReject = () => {
    if (!rejectFeedback.trim()) return;
    rejectTicket.mutate(
      { ticketId: ticketId!, feedback: rejectFeedback },
      {
        onSuccess: () => {
          setShowRejectModal(false);
          setRejectFeedback('');
          navigate(`/sessions`);
        },
      }
    );
  };

  const handleRefresh = () => {
    refetchDiff();
    refetchStatus();
  };

  const tabs = [
    { id: 'diff' as Tab, label: 'Code Changes', icon: GitCompare },
    { id: 'status' as Tab, label: 'Git Status', icon: GitBranch },
  ];

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4">
        <div>
          <Link
            to={`/projects/${projectId}/tickets/${ticketId}`}
            className="inline-flex items-center gap-1 text-sm text-content-secondary hover:text-content-primary mb-2"
          >
            <ArrowLeft className="h-4 w-4" />
            Back to Ticket
          </Link>
          <h1 className="text-2xl font-bold text-content-primary">
            Review: {ticket.title}
          </h1>
          <p className="text-content-muted font-mono text-sm">{ticket.external_id}</p>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={handleRefresh}
            className="inline-flex items-center gap-2 rounded-lg border border-line px-3 py-2 text-sm text-content-secondary hover:bg-surface-secondary hover:text-content-primary transition-colors"
          >
            <RefreshCw className="h-4 w-4" />
            Refresh
          </button>
          <button
            onClick={() => setShowRejectModal(true)}
            disabled={rejectTicket.isPending || approveTicket.isPending}
            className="inline-flex items-center gap-2 rounded-lg bg-red-600 px-4 py-2 text-sm font-medium text-white hover:bg-red-700 disabled:opacity-50 transition-colors"
          >
            <XCircle className="h-4 w-4" />
            Reject
          </button>
          <button
            onClick={handleApprove}
            disabled={approveTicket.isPending || rejectTicket.isPending}
            className="inline-flex items-center gap-2 rounded-lg bg-green-600 px-4 py-2 text-sm font-medium text-white hover:bg-green-700 disabled:opacity-50 transition-colors"
          >
            <CheckCircle className="h-4 w-4" />
            {approveTicket.isPending ? 'Approving...' : 'Approve'}
          </button>
        </div>
      </div>

      {/* Tabs */}
      <div className="border-b border-line">
        <div className="flex gap-4">
          {tabs.map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={cn(
                'flex items-center gap-2 px-4 py-3 text-sm font-medium border-b-2 -mb-px transition-colors',
                activeTab === tab.id
                  ? 'border-indigo-500 text-indigo-400'
                  : 'border-transparent text-content-secondary hover:text-content-primary hover:border-content-muted'
              )}
            >
              <tab.icon className="h-4 w-4" />
              {tab.label}
            </button>
          ))}
        </div>
      </div>

      {/* Tab Content */}
      <div>
        {/* Diff Tab */}
        {activeTab === 'diff' && (
          <div>
            {diff ? (
              <DiffViewer diff={diff} excludePatterns={['*.md', '*.MD', 'README*']} />
            ) : (
              <div className="rounded-lg border border-line bg-surface-secondary p-8 text-center">
                <GitCompare className="h-12 w-12 mx-auto text-content-muted mb-3" />
                <p className="text-content-secondary">Unable to load diff</p>
              </div>
            )}
          </div>
        )}

        {/* Status Tab */}
        {activeTab === 'status' && (
          <div>
            {status ? (
              <GitStatusDisplay status={status} branch={branch} />
            ) : (
              <div className="rounded-lg border border-line bg-surface-secondary p-8 text-center">
                <GitBranch className="h-12 w-12 mx-auto text-content-muted mb-3" />
                <p className="text-content-secondary">Unable to load git status</p>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Reject Modal */}
      {showRejectModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70">
          <div className="bg-surface-secondary rounded-lg border border-line shadow-lg p-6 w-full max-w-lg mx-4">
            <h3 className="text-lg font-semibold text-content-primary mb-2">
              Reject Ticket
            </h3>
            <p className="text-sm text-content-secondary mb-4">
              Please provide detailed feedback explaining what needs to be changed. This
              will be sent back to the Claude session for revision.
            </p>
            <textarea
              value={rejectFeedback}
              onChange={(e) => setRejectFeedback(e.target.value)}
              placeholder="Describe what needs to be fixed or improved..."
              className="w-full h-40 rounded-lg border border-line bg-surface-primary px-3 py-2 text-sm text-content-primary placeholder:text-content-muted resize-none focus:outline-none focus:ring-2 focus:ring-indigo-500"
            />
            <div className="flex justify-end gap-2 mt-4">
              <button
                onClick={() => {
                  setShowRejectModal(false);
                  setRejectFeedback('');
                }}
                className="px-4 py-2 text-sm rounded-lg border border-line text-content-secondary hover:bg-surface-tertiary transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handleReject}
                disabled={!rejectFeedback.trim() || rejectTicket.isPending}
                className="px-4 py-2 text-sm rounded-lg bg-red-600 text-white hover:bg-red-700 disabled:opacity-50 transition-colors"
              >
                {rejectTicket.isPending ? 'Rejecting...' : 'Reject with Feedback'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
