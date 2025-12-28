/**
 * Session Summary Card
 * Displays AI-generated summary of a session's work
 */

import { FileText, Code, Terminal, CheckCircle, Clock, AlertCircle, XCircle, Loader2, Sparkles } from 'lucide-react';
import { useSessionSummary } from '@/hooks/useSessions';
import type { SessionAction, FileChange } from '@/types/api';

interface SessionSummaryCardProps {
  sessionId: string;
  onRefresh?: () => void;
}

const actionIcons: Record<SessionAction['type'], React.ReactNode> = {
  read: <FileText className="w-3 h-3" />,
  write: <Code className="w-3 h-3" />,
  edit: <Code className="w-3 h-3" />,
  bash: <Terminal className="w-3 h-3" />,
  test: <CheckCircle className="w-3 h-3" />,
  other: <FileText className="w-3 h-3" />,
};

const statusConfig = {
  completed: { icon: CheckCircle, color: 'text-green-500', bg: 'bg-green-500/10' },
  in_progress: { icon: Clock, color: 'text-blue-500', bg: 'bg-blue-500/10' },
  blocked: { icon: AlertCircle, color: 'text-yellow-500', bg: 'bg-yellow-500/10' },
  failed: { icon: XCircle, color: 'text-red-500', bg: 'bg-red-500/10' },
};

export function SessionSummaryCard({ sessionId }: SessionSummaryCardProps) {
  const { data: summary, isLoading, error, refetch } = useSessionSummary(sessionId);

  if (isLoading) {
    return (
      <div className="bg-gray-800 rounded-lg p-4 border border-gray-700">
        <div className="flex items-center gap-2 text-gray-400">
          <Loader2 className="w-4 h-4 animate-spin" />
          <span className="text-sm">Generating summary...</span>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="bg-gray-800 rounded-lg p-4 border border-gray-700">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2 text-red-400">
            <AlertCircle className="w-4 h-4" />
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
    <div className="bg-gray-800 rounded-lg border border-gray-700 overflow-hidden">
      {/* Header */}
      <div className="px-4 py-3 border-b border-gray-700 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Sparkles className="w-4 h-4 text-purple-400" />
          <span className="text-sm font-medium text-gray-200">AI Summary</span>
        </div>
        <div className={`flex items-center gap-1.5 px-2 py-0.5 rounded-full text-xs ${statusConfig[summary.status].bg} ${statusConfig[summary.status].color}`}>
          <StatusIcon className="w-3 h-3" />
          {summary.status.replace('_', ' ')}
        </div>
      </div>

      {/* Content */}
      <div className="p-4 space-y-4">
        {/* Headline */}
        <div>
          <h3 className="text-base font-medium text-white">{summary.headline}</h3>
          <p className="text-sm text-gray-400 mt-1">{summary.description}</p>
        </div>

        {/* Actions */}
        {summary.actions.length > 0 && (
          <div>
            <h4 className="text-xs font-medium text-gray-500 uppercase mb-2">Actions</h4>
            <div className="space-y-1.5">
              {summary.actions.slice(0, 5).map((action, i) => (
                <div key={i} className="flex items-center gap-2 text-sm">
                  <span className="text-gray-500">{actionIcons[action.type]}</span>
                  <span className="text-gray-300">{action.description}</span>
                  {action.target && (
                    <span className="text-gray-500 text-xs font-mono truncate max-w-[150px]">
                      {action.target}
                    </span>
                  )}
                </div>
              ))}
              {summary.actions.length > 5 && (
                <span className="text-xs text-gray-500">
                  +{summary.actions.length - 5} more
                </span>
              )}
            </div>
          </div>
        )}

        {/* Files Changed */}
        {summary.files_changed.length > 0 && (
          <div>
            <h4 className="text-xs font-medium text-gray-500 uppercase mb-2">
              Files Changed ({summary.files_changed.length})
            </h4>
            <div className="space-y-1">
              {summary.files_changed.slice(0, 5).map((file, i) => (
                <FileChangeItem key={i} file={file} />
              ))}
              {summary.files_changed.length > 5 && (
                <span className="text-xs text-gray-500">
                  +{summary.files_changed.length - 5} more
                </span>
              )}
            </div>
          </div>
        )}

        {/* Timestamp */}
        <div className="text-xs text-gray-500 pt-2 border-t border-gray-700">
          Analyzed {new Date(summary.analyzed_at).toLocaleTimeString()}
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
      <span className="text-gray-300 font-mono text-xs truncate">{file.path}</span>
    </div>
  );
}

export default SessionSummaryCard;
