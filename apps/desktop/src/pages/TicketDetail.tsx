/**
 * Ticket Detail Page
 * Comprehensive ticket view with state management, content editing, and AI analysis
 */

import { useState, useCallback, useEffect, useRef } from 'react';
import { useParams, Link, useNavigate } from 'react-router-dom';
import { readImage } from '@tauri-apps/plugin-clipboard-manager';
import { useShortcutScope } from '../shortcuts';
import { cn } from '../lib/utils';
import { MarkdownContent } from '../components/MarkdownContent';
import { VimEditor } from '../components/VimEditor';
import { ReviewReportPanel } from '../components/session';
import { ReviewResultBanner } from '../components/ticket/ReviewResultBanner';
import { ReviewHistoryPanel } from '../components/ticket/ReviewHistoryPanel';
import { FileStager } from '../components/git';
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
import { useSessions, useFocusSession } from '../hooks/useSessions';
import { activateAlacritty } from '../services/window-manager';
import { getApiUrl } from '../services/api';
import { toast } from '../hooks/use-toast';
import { useWebSocket } from '../hooks/useWebSocket';
import { useReviewResults, useTriggerReview } from '../hooks/useReviewResults';
import { useUploadImage } from '../hooks/useImageUpload';
import type { TicketState } from '../types/api';
import {
  ArrowLeft,
  ChevronDown,
  Check,
  X,
  Pencil,
  FileText,
  Play,
  ExternalLink,
  CheckCircle,
  XCircle,
  Trash2,
  Save,
  Sparkles,
  AlertCircle,
  ClipboardCheck,
  Loader2,
} from 'lucide-react';

const stateStyles: Record<TicketState, string> = {
  backlog: 'bg-gray-500/10 text-gray-400',
  in_progress: 'bg-blue-500/10 text-blue-400',
  review: 'bg-yellow-500/10 text-yellow-400',
  done: 'bg-green-500/10 text-green-400',
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
  const { lastMessage } = useWebSocket();

  // Mutations
  const updateState = useUpdateTicketState();
  const updateContent = useUpdateTicketContent();
  const updateTitle = useUpdateTicketTitle();
  const approveTicket = useApproveTicket();
  const rejectTicket = useRejectTicket();
  const deleteTicket = useDeleteTicket();
  const startTicket = useStartTicket();
  const focusSession = useFocusSession();

  // Review results with real-time WebSocket updates
  const { latestResult, results: reviewResults, isLoading: reviewResultsLoading, refresh: refreshReviewResults } = useReviewResults(ticketId, lastMessage);
  const triggerReview = useTriggerReview(ticketId);

  // Image upload mutation
  const uploadImage = useUploadImage();

  // Local state
  const [showRejectModal, setShowRejectModal] = useState(false);
  const [rejectFeedback, setRejectFeedback] = useState('');
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [showStartConfirm, setShowStartConfirm] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const [editContent, setEditContent] = useState('');
  const [isEditingTitle, setIsEditingTitle] = useState(false);
  const [editTitle, setEditTitle] = useState('');
  const [showFileStager, setShowFileStager] = useState(false);
  const [apiBaseUrl, setApiBaseUrl] = useState<string>('');

  // Fetch API URL on mount for image resolution
  useEffect(() => {
    getApiUrl().then(setApiBaseUrl);
  }, []);

  // Scroll container ref
  const scrollContainerRef = useRef<HTMLDivElement>(null);

  // Vim-style keyboard scrolling
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Don't scroll when editing or in a modal
      if (isEditing || isEditingTitle || showRejectModal || showDeleteModal || showStartConfirm || showFileStager) {
        return;
      }

      // Don't scroll when focused on input elements
      const target = e.target as HTMLElement;
      if (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.tagName === 'SELECT') {
        return;
      }

      const container = scrollContainerRef.current;
      if (!container) return;

      const lineHeight = 40; // Approximate line height for small scrolls
      const pageHeight = container.clientHeight * 0.5; // Half-page for Ctrl+u/d

      switch (e.key) {
        case 'j':
          if (!e.ctrlKey && !e.metaKey) {
            e.preventDefault();
            container.scrollBy({ top: lineHeight, behavior: 'smooth' });
          }
          break;
        case 'k':
          if (!e.ctrlKey && !e.metaKey) {
            e.preventDefault();
            container.scrollBy({ top: -lineHeight, behavior: 'smooth' });
          }
          break;
        case 'd':
          if (e.ctrlKey) {
            e.preventDefault();
            container.scrollBy({ top: pageHeight, behavior: 'smooth' });
          }
          break;
        case 'u':
          if (e.ctrlKey) {
            e.preventDefault();
            container.scrollBy({ top: -pageHeight, behavior: 'smooth' });
          }
          break;
        case 'G':
          if (!e.ctrlKey && !e.metaKey) {
            e.preventDefault();
            container.scrollTo({ top: container.scrollHeight, behavior: 'smooth' });
          }
          break;
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isEditing, isEditingTitle, showRejectModal, showDeleteModal, showStartConfirm, showFileStager]);

  // Handle paste for images
  const handlePaste = useCallback(async () => {
    if (!isEditing || !ticketId) return;

    try {
      // Read image from clipboard via Tauri
      const image = await readImage();

      if (image) {
        // Get image data using Tauri Image API methods
        const [rgbaData, imageSize] = await Promise.all([
          image.rgba(),
          image.size(),
        ]);

        // Convert RGBA to PNG blob
        const canvas = document.createElement('canvas');
        canvas.width = imageSize.width;
        canvas.height = imageSize.height;
        const ctx = canvas.getContext('2d');
        if (!ctx) return;

        const imgData = new ImageData(
          new Uint8ClampedArray(rgbaData),
          imageSize.width,
          imageSize.height
        );
        ctx.putImageData(imgData, 0, 0);

        canvas.toBlob(async (blob) => {
          if (!blob) return;

          try {
            const result = await uploadImage.mutateAsync({
              ticketId,
              imageBlob: blob,
              filename: `screenshot-${Date.now()}.png`,
            });

            // Insert markdown reference at cursor position or end
            setEditContent((prev) => prev + '\n\n' + result.markdownRef + '\n');
          } catch (err) {
            console.error('Upload failed:', (err as Error).message);
          }
        }, 'image/png');
      }
    } catch (err) {
      // No image in clipboard or read failed - this is fine, just ignore
      console.debug('No image in clipboard:', err);
    }
  }, [isEditing, ticketId, uploadImage]);

  // Listen for Cmd+V paste in edit mode
  useEffect(() => {
    const handleKeyDown = async (e: KeyboardEvent) => {
      // Only handle Cmd+V / Ctrl+V when editing
      if (!isEditing) return;
      if (!((e.metaKey || e.ctrlKey) && e.key === 'v')) return;

      // Check if we have image in clipboard
      // The native paste will still work for text
      await handlePaste();
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isEditing, handlePaste]);

  // Get sessions for this ticket
  const ticketSessions = sessions?.filter((s) => s.ticket_id === ticketId) ?? [];

  // Check if this ticket has a running session
  const runningSession = ticketSessions.find((s) => s.status === 'running');
  const hasRunningSession = !!runningSession;

  // Keyboard shortcut handlers
  const handleGoBack = useCallback(() => {
    navigate(`/projects/${projectId}`);
  }, [navigate, projectId]);

  const handleStartWithShortcut = useCallback(() => {
    if (ticket && !hasRunningSession && ticket.state !== 'done') {
      setShowStartConfirm(true);
    }
  }, [ticket, hasRunningSession]);

  const handleApproveWithShortcut = useCallback(() => {
    if (ticket?.state === 'review') {
      approveTicket.mutate(ticketId!);
    }
  }, [ticket, approveTicket, ticketId]);

  const handleRejectWithShortcut = useCallback(() => {
    if (ticket?.state === 'review') {
      setShowRejectModal(true);
    }
  }, [ticket]);

  const handleEditTicketWithShortcut = useCallback(() => {
    if (ticket && ticketContent) {
      setEditContent(ticketContent.content || '');
      setIsEditing(true);
    }
  }, [ticket, ticketContent]);

  // Handler for opening file stager
  const handleOpenFileStager = useCallback(() => {
    setShowFileStager(true);
  }, []);

  // Register keyboard shortcuts
  useShortcutScope('ticketDetail', {
    startSession: handleStartWithShortcut,
    approve: handleApproveWithShortcut,
    reject: handleRejectWithShortcut,
    editTicket: handleEditTicketWithShortcut,
    openFileStager: handleOpenFileStager,
    goBack: handleGoBack,
  });

  // Get the most recent session for this ticket (prefer running, then latest)
  const latestSession = runningSession ?? (ticketSessions.length > 0
    ? ticketSessions.reduce((latest, s) =>
        new Date(s.created_at) > new Date(latest.created_at) ? s : latest
      )
    : null);

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
    setShowStartConfirm(true);
  };

  const confirmStartSession = () => {
    setShowStartConfirm(false);
    startTicket.mutate(ticketId!, {
      onSuccess: (result) => {
        // Focus the session in tmux and switch to Alacritty
        focusSession.mutate(result.session.id, {
          onSuccess: async () => {
            try {
              await activateAlacritty();
              toast.success('Session started', `Ticket ${ticket?.external_id || ticketId} is now running`);
            } catch (e) {
              console.warn('Failed to activate Alacritty:', e);
              toast.success('Session started', 'Session created and focused');
            }
          },
          onError: () => {
            toast.success('Session started', 'Session created');
          },
        });
      },
      onError: (err: Error) => {
        toast.error('Failed to start session', err.message);
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
      <div className="flex flex-col items-center justify-center min-h-[400px] gap-4">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-indigo-500" />
        <p className="text-content-secondary">Loading ticket...</p>
      </div>
    );
  }

  if (error || !ticket) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[400px] gap-4 text-center p-8">
        <AlertCircle className="h-12 w-12 text-red-500" />
        <h2 className="text-xl font-semibold text-content-primary">
          {error ? 'Failed to load ticket' : 'Ticket not found'}
        </h2>
        <p className="text-content-secondary text-sm max-w-md">
          {error instanceof Error ? error.message : 'The ticket you are looking for could not be loaded.'}
        </p>
        <Link
          to={`/projects/${projectId}`}
          className="inline-flex items-center gap-2 px-4 py-2 bg-surface-tertiary text-content-primary border border-line rounded-lg text-sm font-medium hover:bg-line transition-colors"
        >
          <ArrowLeft className="h-4 w-4" />
          Back to Project
        </Link>
      </div>
    );
  }

  return (
    <div
      ref={scrollContainerRef}
      className="h-full overflow-y-auto"
    >
    <div className="p-6 max-w-[1200px] mx-auto space-y-6">
      {/* Breadcrumb */}
      <Link
        to={`/projects/${projectId}`}
        className="inline-flex items-center gap-2 text-sm text-content-secondary hover:text-content-primary transition-colors"
      >
        <ArrowLeft className="h-4 w-4" />
        Back to Project
      </Link>

      {/* Header */}
      <div className="flex flex-col lg:flex-row lg:items-start lg:justify-between gap-4">
        <div className="space-y-3">
          {/* State and badges */}
          <div className="flex items-center gap-3 flex-wrap">
            <div className="relative">
              <select
                value={ticket.state}
                onChange={(e) => handleStateChange(e.target.value as TicketState)}
                disabled={updateState.isPending}
                className={cn(
                  'appearance-none cursor-pointer inline-flex items-center gap-1.5 pl-3 pr-8 py-1.5 rounded-full text-sm font-medium border-0 outline-none focus:ring-2 focus:ring-indigo-500',
                  stateStyles[ticket.state],
                  updateState.isPending && 'opacity-50 cursor-wait'
                )}
              >
                <option value="backlog">Backlog</option>
                <option value="in_progress">In Progress</option>
                <option value="review">Review</option>
                <option value="done">Done</option>
              </select>
              <ChevronDown className="absolute right-2 top-1/2 -translate-y-1/2 h-4 w-4 pointer-events-none" />
            </div>

            {ticket.is_adhoc && (
              <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-purple-500/15 text-purple-400">
                ADHOC
              </span>
            )}

            {ticket.external_id && (
              <span className="text-sm text-content-muted font-mono">
                {ticket.external_id}
              </span>
            )}
          </div>

          {/* Title */}
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
                className="flex-1 px-3 py-2 text-xl font-bold bg-surface-secondary border border-line rounded-lg text-content-primary outline-none focus:ring-2 focus:ring-indigo-500"
                autoFocus
              />
              <button
                onClick={handleUpdateTitle}
                disabled={updateTitle.isPending}
                className="p-2 rounded-lg text-green-500 hover:bg-green-500/10 transition-colors"
                title="Save"
              >
                <Check className="h-5 w-5" />
              </button>
              <button
                onClick={() => setIsEditingTitle(false)}
                className="p-2 rounded-lg text-content-secondary hover:bg-surface-tertiary transition-colors"
                title="Cancel"
              >
                <X className="h-5 w-5" />
              </button>
            </div>
          ) : (
            <h1 className="text-2xl font-bold text-content-primary flex items-center gap-2">
              {ticket.title}
              {ticket.is_adhoc && (
                <button
                  onClick={() => {
                    setEditTitle(ticket.title);
                    setIsEditingTitle(true);
                  }}
                  className="p-1.5 rounded-lg text-content-muted hover:text-content-primary hover:bg-surface-tertiary transition-colors"
                  title="Edit title"
                >
                  <Pencil className="h-4 w-4" />
                </button>
              )}
            </h1>
          )}

          {/* File path */}
          <p className="flex items-center gap-2 text-sm text-content-muted">
            <FileText className="h-4 w-4" />
            {ticket.file_path}
          </p>
        </div>

        {/* Action Buttons */}
        <div className="flex items-center gap-2 flex-wrap">
          {/* Start Session button */}
          {!hasRunningSession && ticket.state !== 'done' && (
            <button
              onClick={handleStartSession}
              disabled={startTicket.isPending}
              className="inline-flex items-center gap-2 px-4 py-2 bg-indigo-500 text-white rounded-lg text-sm font-medium hover:bg-indigo-600 transition-colors disabled:opacity-50"
            >
              <Play className="h-4 w-4" />
              {startTicket.isPending ? 'Starting...' : 'Start Session'}
            </button>
          )}

          {/* View Sessions link if running */}
          {hasRunningSession && (
            <Link
              to="/sessions"
              className="inline-flex items-center gap-2 px-4 py-2 bg-blue-500 text-white rounded-lg text-sm font-medium hover:bg-blue-600 transition-colors"
            >
              <ExternalLink className="h-4 w-4" />
              View Sessions
            </Link>
          )}

          {/* Trigger Review button - show when there's a session for this ticket */}
          {latestSession && ticket.state !== 'done' && (
            <button
              onClick={() => triggerReview.mutate(latestSession.id)}
              disabled={triggerReview.isPending}
              className="inline-flex items-center gap-2 px-4 py-2 bg-purple-500/15 text-purple-400 border border-purple-500/30 rounded-lg text-sm font-medium hover:bg-purple-500/25 transition-colors disabled:opacity-50"
              title="Manually trigger a review to check if work is complete"
            >
              {triggerReview.isPending ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <ClipboardCheck className="h-4 w-4" />
              )}
              {triggerReview.isPending ? 'Reviewing...' : 'Trigger Review'}
            </button>
          )}

          {/* Review state buttons */}
          {ticket.state === 'review' && (
            <>
              <Link
                to={`/projects/${projectId}/tickets/${ticketId}/review`}
                className="inline-flex items-center gap-2 px-4 py-2 bg-surface-tertiary text-content-primary border border-line rounded-lg text-sm font-medium hover:bg-surface-secondary transition-colors"
              >
                <ExternalLink className="h-4 w-4" />
                Review Changes
              </Link>
              <button
                onClick={handleApprove}
                disabled={approveTicket.isPending || rejectTicket.isPending}
                className="inline-flex items-center gap-2 px-4 py-2 bg-green-600 text-white rounded-lg text-sm font-medium hover:bg-green-700 transition-colors disabled:opacity-50"
              >
                <CheckCircle className="h-4 w-4" />
                {approveTicket.isPending ? 'Approving...' : 'Approve'}
              </button>
              <button
                onClick={() => setShowRejectModal(true)}
                disabled={approveTicket.isPending || rejectTicket.isPending}
                className="inline-flex items-center gap-2 px-4 py-2 bg-red-600 text-white rounded-lg text-sm font-medium hover:bg-red-700 transition-colors disabled:opacity-50"
              >
                <XCircle className="h-4 w-4" />
                Reject
              </button>
            </>
          )}

          {/* Done state indicator */}
          {ticket.state === 'done' && (
            <span className="inline-flex items-center gap-2 px-4 py-2 bg-green-500/15 text-green-500 rounded-lg text-sm font-medium">
              <CheckCircle className="h-4 w-4" />
              Completed
            </span>
          )}

          {/* Delete button */}
          {!hasRunningSession && (
            <button
              onClick={() => setShowDeleteModal(true)}
              className="inline-flex items-center gap-2 px-4 py-2 bg-transparent text-red-500 border border-red-500/50 rounded-lg text-sm font-medium hover:bg-red-500/10 transition-colors"
              title="Delete ticket"
            >
              <Trash2 className="h-4 w-4" />
              Delete
            </button>
          )}
        </div>
      </div>

      {/* Latest Review Result Banner */}
      {latestResult && (
        <ReviewResultBanner result={latestResult} />
      )}

      {/* Ticket Content */}
      <div className="bg-surface-secondary border border-line rounded-xl overflow-hidden">
        <div className="flex items-center justify-between px-5 py-4 border-b border-line">
          <h2 className="text-lg font-semibold text-content-primary">Ticket Content</h2>
          {!isEditing && (
            <button
              onClick={() => {
                setEditContent(ticketContent?.content || ticket.content);
                setIsEditing(true);
              }}
              className="inline-flex items-center gap-2 px-3 py-1.5 bg-surface-tertiary text-content-primary border border-line rounded-lg text-sm font-medium hover:bg-line transition-colors"
            >
              <Pencil className="h-4 w-4" />
              Edit
            </button>
          )}
        </div>
        {isEditing ? (
          <div className="p-5">
            <div className="h-96">
              <VimEditor
                value={editContent}
                onChange={setEditContent}
                placeholder="Enter ticket content in markdown..."
                onSave={handleUpdateContent}
                onCancel={() => setIsEditing(false)}
              />
            </div>
            <div className="flex justify-end gap-2 mt-4">
              <button
                onClick={() => setIsEditing(false)}
                className="inline-flex items-center gap-2 px-4 py-2 bg-surface-tertiary text-content-primary border border-line rounded-lg text-sm font-medium hover:bg-line transition-colors"
              >
                <X className="h-4 w-4" />
                Cancel
              </button>
              <button
                onClick={handleUpdateContent}
                disabled={updateContent.isPending}
                className="inline-flex items-center gap-2 px-4 py-2 bg-indigo-500 text-white rounded-lg text-sm font-medium hover:bg-indigo-600 transition-colors disabled:opacity-50"
              >
                <Save className="h-4 w-4" />
                {updateContent.isPending ? 'Saving...' : 'Save'}
              </button>
            </div>
          </div>
        ) : (
          <div className="p-5">
            <MarkdownContent projectId={projectId} baseUrl={apiBaseUrl}>{ticket.content}</MarkdownContent>
          </div>
        )}
      </div>

      {/* Timestamps */}
      <div className="bg-surface-secondary border border-line rounded-xl p-5">
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-4">
          <div>
            <p className="text-xs text-content-muted uppercase tracking-wide mb-1">Created</p>
            <p className="text-sm text-content-primary">
              {new Date(ticket.created_at).toLocaleString()}
            </p>
          </div>
          <div>
            <p className="text-xs text-content-muted uppercase tracking-wide mb-1">Updated</p>
            <p className="text-sm text-content-primary">
              {new Date(ticket.updated_at).toLocaleString()}
            </p>
          </div>
          {ticket.started_at && (
            <div>
              <p className="text-xs text-content-muted uppercase tracking-wide mb-1">Started</p>
              <p className="text-sm text-content-primary">
                {new Date(ticket.started_at).toLocaleString()}
              </p>
            </div>
          )}
          {reviewedAt && (
            <div>
              <p className="text-xs text-content-muted uppercase tracking-wide mb-1">Moved to Review</p>
              <span className="inline-flex px-2 py-0.5 bg-yellow-500/15 text-yellow-500 rounded text-xs">
                {new Date(reviewedAt).toLocaleString()}
              </span>
            </div>
          )}
          {ticket.completed_at && (
            <div>
              <p className="text-xs text-content-muted uppercase tracking-wide mb-1">Completed</p>
              <p className="text-sm text-content-primary">
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
            <Sparkles className="h-5 w-5 text-purple-500" />
            <h2 className="text-lg font-semibold text-content-primary">AI Analysis</h2>
            <Link
              to={`/sessions/${latestSession.id}`}
              className="text-sm text-content-muted hover:text-content-primary ml-auto"
            >
              View Session
            </Link>
          </div>

          {/* Review Report - Show if ticket is in review or done */}
          {(ticket.state === 'review' || ticket.state === 'done') && (
            <ReviewReportPanel sessionId={latestSession.id} projectId={projectId} />
          )}

          {/* Review History - Show all review attempts */}
          {reviewResults.length > 0 && (
            <ReviewHistoryPanel
              results={reviewResults}
              isLoading={reviewResultsLoading}
              onRefresh={refreshReviewResults}
            />
          )}
        </div>
      )}

      {/* Reject Modal */}
      {showRejectModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
          <div className="bg-surface-secondary rounded-xl border border-line shadow-xl p-6 w-full max-w-md mx-4">
            <h3 className="text-lg font-semibold mb-4 text-content-primary">Reject Ticket</h3>
            <p className="text-sm text-content-secondary mb-4">
              Please provide feedback explaining why this ticket is being rejected.
              This will be sent back to the session for revision.
            </p>
            <textarea
              value={rejectFeedback}
              onChange={(e) => setRejectFeedback(e.target.value)}
              placeholder="Enter feedback..."
              className="w-full h-32 px-3 py-2 bg-surface-primary border border-line rounded-lg text-sm text-content-primary resize-none outline-none focus:ring-2 focus:ring-indigo-500"
            />
            <div className="flex justify-end gap-2 mt-4">
              <button
                onClick={() => {
                  setShowRejectModal(false);
                  setRejectFeedback('');
                }}
                className="px-4 py-2 text-sm rounded-lg border border-line hover:bg-surface-tertiary text-content-primary transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handleReject}
                disabled={!rejectFeedback.trim() || rejectTicket.isPending}
                className="px-4 py-2 text-sm rounded-lg bg-red-600 text-white hover:bg-red-700 disabled:opacity-50 transition-colors"
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
          <div className="bg-surface-secondary rounded-xl border border-line shadow-xl p-6 w-full max-w-md mx-4">
            <h3 className="text-lg font-semibold mb-4 flex items-center gap-2 text-red-500">
              <Trash2 className="h-5 w-5" />
              Delete Ticket
            </h3>
            <p className="text-sm text-content-secondary mb-4">
              Are you sure you want to delete this ticket? This action cannot be undone.
              The ticket file and all associated data will be permanently removed.
            </p>
            <div className="rounded-lg bg-surface-primary p-3 mb-4">
              <p className="font-medium text-sm text-content-primary">{ticket.title}</p>
              <p className="text-xs text-content-muted">{ticket.file_path}</p>
            </div>
            <div className="flex justify-end gap-2">
              <button
                onClick={() => setShowDeleteModal(false)}
                className="px-4 py-2 text-sm rounded-lg border border-line hover:bg-surface-tertiary text-content-primary transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handleDelete}
                disabled={deleteTicket.isPending}
                className="px-4 py-2 text-sm rounded-lg bg-red-600 text-white hover:bg-red-700 disabled:opacity-50 transition-colors"
              >
                {deleteTicket.isPending ? 'Deleting...' : 'Delete'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Start Session Confirmation Modal */}
      {showStartConfirm && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/50"
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault();
              confirmStartSession();
            } else if (e.key === 'Escape') {
              setShowStartConfirm(false);
            }
          }}
        >
          <div className="bg-surface-secondary rounded-xl border border-line shadow-xl p-6 w-full max-w-md mx-4">
            <h3 className="text-lg font-semibold mb-4 flex items-center gap-2 text-content-primary">
              <Play className="h-5 w-5 text-green-500" />
              Start Session
            </h3>
            <p className="text-sm text-content-secondary mb-4">
              Start a Claude session for this ticket? This will open Alacritty and focus the tmux pane.
            </p>
            <div className="rounded-lg bg-surface-primary p-3 mb-4">
              <p className="font-medium text-sm text-content-primary">{ticket?.title}</p>
              <p className="text-xs text-content-muted">{ticket?.external_id}</p>
            </div>
            <div className="flex justify-end gap-2">
              <button
                onClick={() => setShowStartConfirm(false)}
                className="px-4 py-2 text-sm rounded-lg border border-line hover:bg-surface-tertiary text-content-primary transition-colors"
              >
                Cancel <span className="text-content-muted ml-1">(Esc)</span>
              </button>
              <button
                onClick={confirmStartSession}
                disabled={startTicket.isPending}
                autoFocus
                className="px-4 py-2 text-sm rounded-lg bg-green-600 text-white hover:bg-green-700 disabled:opacity-50 transition-colors"
              >
                {startTicket.isPending ? 'Starting...' : 'Start'} <span className="opacity-70 ml-1">(Enter)</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* File Stager Modal (gg to open) */}
      {projectId && (
        <FileStager
          projectId={projectId}
          open={showFileStager}
          onClose={() => setShowFileStager(false)}
          initialCommitMessage={ticket ? `feat(${ticket.external_id || ticket.id.slice(0, 8)}): ${ticket.title}` : undefined}
        />
      )}
    </div>
    </div>
  );
}
