/**
 * Session Summary Card
 * Displays AI-generated summary of a session's work
 */

import { cn } from '../../lib/utils';
import {
  useSessionSummary,
  useRegenerateSummary,
} from '../../hooks/useSessions';
import { useAiAnalysisStatus } from '../../hooks/useAiAnalysisStatus';
import type { SessionAction, FileChange } from '../../types/api';

interface SessionSummaryCardProps {
  sessionId: string;
}

const actionIcons: Record<SessionAction['type'], React.ReactNode> = {
  read: <FileTextIcon className="w-3 h-3" />,
  write: <CodeIcon className="w-3 h-3" />,
  edit: <CodeIcon className="w-3 h-3" />,
  bash: <TerminalIcon className="w-3 h-3" />,
  test: <CheckCircleIcon className="w-3 h-3" />,
  other: <FileTextIcon className="w-3 h-3" />,
};

const statusConfig = {
  completed: { icon: CheckCircleIcon, color: 'text-green-500', bg: 'bg-green-500/10' },
  in_progress: { icon: ClockIcon, color: 'text-blue-500', bg: 'bg-blue-500/10' },
  blocked: { icon: AlertCircleIcon, color: 'text-yellow-500', bg: 'bg-yellow-500/10' },
  failed: { icon: XCircleIcon, color: 'text-red-500', bg: 'bg-red-500/10' },
};

export function SessionSummaryCard({ sessionId }: SessionSummaryCardProps) {
  const {
    data: summary,
    isLoading,
    error,
    refetch,
    isFetching,
  } = useSessionSummary(sessionId, true);
  const regenerateMutation = useRegenerateSummary();
  const { isSummaryGenerating } = useAiAnalysisStatus();
  const isGenerating = isSummaryGenerating(sessionId);

  const handleRegenerate = () => {
    regenerateMutation.mutate(sessionId);
  };

  const isRegenerating = regenerateMutation.isPending;

  // Show generating state if AI is actively generating
  if (isGenerating) {
    return (
      <div className="bg-surface-secondary rounded-lg p-4 border border-purple-500/50">
        <div className="flex items-center gap-3">
          <div className="relative">
            <SparklesIcon className="w-5 h-5 text-purple-400" />
            <div className="absolute -top-1 -right-1 w-2 h-2 bg-purple-500 rounded-full animate-pulse" />
          </div>
          <div className="flex-1">
            <div className="flex items-center gap-2">
              <span className="text-sm font-medium text-content-primary">Generating AI Summary</span>
              <LoaderIcon className="w-4 h-4 animate-spin text-purple-400" />
            </div>
            <p className="text-xs text-content-muted mt-0.5">Analyzing session activity...</p>
          </div>
        </div>
      </div>
    );
  }

  if (isLoading) {
    return (
      <div className="bg-surface-secondary rounded-lg p-4 border border-line">
        <div className="flex items-center gap-2 text-content-muted">
          <LoaderIcon className="w-4 h-4 animate-spin" />
          <span className="text-sm">Loading summary...</span>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="bg-surface-secondary rounded-lg p-4 border border-line">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2 text-red-400">
            <AlertCircleIcon className="w-4 h-4" />
            <span className="text-sm">Failed to load summary</span>
          </div>
          <button
            onClick={() => refetch()}
            className="text-xs text-blue-400 hover:text-blue-300"
          >
            Retry
          </button>
        </div>
      </div>
    );
  }

  if (!summary) return null;

  const StatusIcon = statusConfig[summary.status].icon;

  return (
    <div className="bg-surface-secondary rounded-lg border border-line overflow-hidden">
      {/* Header */}
      <div className="px-4 py-3 border-b border-line flex items-center justify-between">
        <div className="flex items-center gap-2">
          <SparklesIcon className="w-4 h-4 text-purple-400" />
          <span className="text-sm font-medium text-content-primary">AI Summary</span>
          <button
            onClick={handleRegenerate}
            disabled={isRegenerating || isFetching}
            className="p-1 rounded hover:bg-surface-tertiary text-content-muted hover:text-content-primary disabled:opacity-50"
            title="Regenerate summary"
          >
            <RefreshIcon className={cn('w-3.5 h-3.5', isRegenerating && 'animate-spin')} />
          </button>
        </div>
        <div className={cn(
          'flex items-center gap-1.5 px-2 py-0.5 rounded-full text-xs',
          statusConfig[summary.status].bg,
          statusConfig[summary.status].color
        )}>
          <StatusIcon className="w-3 h-3" />
          {summary.status.replace('_', ' ')}
        </div>
      </div>

      {/* Content */}
      <div className="p-4 space-y-4">
        {/* Headline */}
        <div>
          <h3 className="text-base font-medium text-content-primary">{summary.headline}</h3>
          <p className="text-sm text-content-secondary mt-1">{summary.description}</p>
        </div>

        {/* Actions */}
        {summary.actions.length > 0 && (
          <div>
            <h4 className="text-xs font-medium text-content-muted uppercase mb-2">Actions</h4>
            <div className="space-y-1.5">
              {summary.actions.slice(0, 5).map((action, i) => (
                <div key={i} className="flex items-center gap-2 text-sm">
                  <span className="text-content-muted">{actionIcons[action.type]}</span>
                  <span className="text-content-secondary">{action.description}</span>
                  {action.target && (
                    <span className="text-content-muted text-xs font-mono truncate max-w-[150px]">
                      {action.target}
                    </span>
                  )}
                </div>
              ))}
              {summary.actions.length > 5 && (
                <span className="text-xs text-content-muted">
                  +{summary.actions.length - 5} more
                </span>
              )}
            </div>
          </div>
        )}

        {/* Files Changed */}
        {summary.files_changed.length > 0 && (
          <div>
            <h4 className="text-xs font-medium text-content-muted uppercase mb-2">
              Files Changed ({summary.files_changed.length})
            </h4>
            <div className="space-y-1">
              {summary.files_changed.slice(0, 5).map((file, i) => (
                <FileChangeItem key={i} file={file} />
              ))}
              {summary.files_changed.length > 5 && (
                <span className="text-xs text-content-muted">
                  +{summary.files_changed.length - 5} more
                </span>
              )}
            </div>
          </div>
        )}

        {/* Timestamp */}
        <div className="text-sm text-content-secondary pt-2 border-t border-line">
          Analyzed {new Date(summary.analyzed_at).toLocaleString()}
        </div>
      </div>
    </div>
  );
}

function FileChangeItem({ file }: { file: FileChange }) {
  const changeColors = {
    created: 'text-green-400',
    modified: 'text-yellow-400',
    deleted: 'text-red-400',
  };

  return (
    <div className="flex items-center gap-2 text-sm">
      <span className={`text-xs ${changeColors[file.changeType]}`}>
        {file.changeType === 'created' ? '+' : file.changeType === 'deleted' ? '-' : '~'}
      </span>
      <span className="text-content-secondary font-mono text-xs truncate">{file.path}</span>
    </div>
  );
}

// Icon components
function FileTextIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
      <polyline points="14 2 14 8 20 8" />
      <line x1="16" y1="13" x2="8" y2="13" />
      <line x1="16" y1="17" x2="8" y2="17" />
    </svg>
  );
}

function CodeIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="16 18 22 12 16 6" />
      <polyline points="8 6 2 12 8 18" />
    </svg>
  );
}

function TerminalIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="4 17 10 11 4 5" />
      <line x1="12" y1="19" x2="20" y2="19" />
    </svg>
  );
}

function CheckCircleIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14" />
      <polyline points="22 4 12 14.01 9 11.01" />
    </svg>
  );
}

function ClockIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="10" />
      <polyline points="12 6 12 12 16 14" />
    </svg>
  );
}

function AlertCircleIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="10" />
      <line x1="12" y1="8" x2="12" y2="12" />
      <line x1="12" y1="16" x2="12.01" y2="16" />
    </svg>
  );
}

function XCircleIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="10" />
      <line x1="15" y1="9" x2="9" y2="15" />
      <line x1="9" y1="9" x2="15" y2="15" />
    </svg>
  );
}

function SparklesIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2" />
    </svg>
  );
}

function RefreshIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="23 4 23 10 17 10" />
      <polyline points="1 20 1 14 7 14" />
      <path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15" />
    </svg>
  );
}

function LoaderIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <line x1="12" y1="2" x2="12" y2="6" />
      <line x1="12" y1="18" x2="12" y2="22" />
      <line x1="4.93" y1="4.93" x2="7.76" y2="7.76" />
      <line x1="16.24" y1="16.24" x2="19.07" y2="19.07" />
      <line x1="2" y1="12" x2="6" y2="12" />
      <line x1="18" y1="12" x2="22" y2="12" />
      <line x1="4.93" y1="19.07" x2="7.76" y2="16.24" />
      <line x1="16.24" y1="7.76" x2="19.07" y2="4.93" />
    </svg>
  );
}

export default SessionSummaryCard;
