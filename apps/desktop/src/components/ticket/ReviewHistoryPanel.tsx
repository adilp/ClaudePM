/**
 * Review History Panel
 * Collapsible panel showing the full history of review results for a ticket
 */

import { useState } from 'react';
import {
  CheckCircle,
  XCircle,
  HelpCircle,
  Clock,
  Zap,
  Hand,
  Play,
  ChevronDown,
  ChevronRight,
  History,
  RefreshCw,
} from 'lucide-react';
import type { ReviewResultEntry } from '../../types/api';
import { cn } from '../../lib/utils';

interface ReviewHistoryPanelProps {
  results: ReviewResultEntry[];
  isLoading?: boolean;
  onRefresh?: () => void;
  className?: string;
}

const decisionConfig = {
  complete: {
    icon: CheckCircle,
    label: 'Complete',
    color: 'text-green-400',
    bgColor: 'bg-green-500/20',
  },
  not_complete: {
    icon: XCircle,
    label: 'Not Complete',
    color: 'text-amber-400',
    bgColor: 'bg-amber-500/20',
  },
  needs_clarification: {
    icon: HelpCircle,
    label: 'Needs Clarification',
    color: 'text-blue-400',
    bgColor: 'bg-blue-500/20',
  },
};

const triggerConfig = {
  stop_hook: { icon: Hand, label: 'Stop Hook' },
  idle_timeout: { icon: Clock, label: 'Idle Timeout' },
  completion_signal: { icon: Zap, label: 'Completion Signal' },
  manual: { icon: Play, label: 'Manual' },
};

export function ReviewHistoryPanel({
  results,
  isLoading,
  onRefresh,
  className,
}: ReviewHistoryPanelProps) {
  const [isExpanded, setIsExpanded] = useState(false);

  if (results.length === 0 && !isLoading) {
    return null;
  }

  return (
    <div className={cn('rounded-xl border border-line bg-surface-secondary overflow-hidden', className)}>
      <button
        onClick={() => setIsExpanded(!isExpanded)}
        className="w-full flex items-center justify-between px-4 py-3 hover:bg-surface-tertiary transition-colors"
      >
        <div className="flex items-center gap-2">
          {isExpanded ? (
            <ChevronDown className="h-5 w-5 text-content-secondary" />
          ) : (
            <ChevronRight className="h-5 w-5 text-content-secondary" />
          )}
          <History className="h-5 w-5 text-purple-400" />
          <span className="font-semibold text-content-primary">Review History</span>
          <span className="text-sm text-content-muted">
            ({results.length} review{results.length !== 1 ? 's' : ''})
          </span>
        </div>
        {onRefresh && (
          <button
            onClick={(e) => {
              e.stopPropagation();
              onRefresh();
            }}
            className="p-1.5 rounded-md hover:bg-surface-tertiary text-content-muted"
            title="Refresh history"
          >
            <RefreshCw className={cn('h-4 w-4', isLoading && 'animate-spin')} />
          </button>
        )}
      </button>

      {isExpanded && (
        <div className="border-t border-line">
          {isLoading && results.length === 0 ? (
            <div className="flex items-center justify-center py-8">
              <div className="w-6 h-6 border-2 border-surface-tertiary border-t-indigo-500 rounded-full animate-spin" />
            </div>
          ) : (
            <div className="divide-y divide-line">
              {results.map((result, index) => (
                <ReviewHistoryItem
                  key={result.id}
                  result={result}
                  isLatest={index === 0}
                />
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

interface ReviewHistoryItemProps {
  result: ReviewResultEntry;
  isLatest?: boolean;
}

function ReviewHistoryItem({ result, isLatest }: ReviewHistoryItemProps) {
  const config = decisionConfig[result.decision];
  const trigger = triggerConfig[result.trigger];
  const DecisionIcon = config.icon;
  const TriggerIcon = trigger.icon;

  return (
    <div className={cn('px-4 py-3', isLatest && 'bg-surface-tertiary/50')}>
      <div className="flex items-start gap-3">
        <div className={cn('p-1.5 rounded-full', config.bgColor)}>
          <DecisionIcon className={cn('h-4 w-4', config.color)} />
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className={cn('font-medium text-sm', config.color)}>
              {config.label}
            </span>
            {isLatest && (
              <span className="text-xs px-1.5 py-0.5 rounded bg-purple-500/20 text-purple-300">
                Latest
              </span>
            )}
            <span className="text-xs text-content-muted flex items-center gap-1">
              <TriggerIcon className="h-3 w-3" />
              {trigger.label}
            </span>
          </div>
          <p className="mt-1 text-sm text-content-secondary line-clamp-2">
            {result.reasoning}
          </p>
          <div className="mt-1.5 flex items-center gap-3 text-xs text-content-muted">
            <span>{formatDate(new Date(result.created_at))}</span>
            {result.session_status && (
              <span className="capitalize">Session: {result.session_status}</span>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

function formatDate(date: Date): string {
  return date.toLocaleString(undefined, {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

export default ReviewHistoryPanel;
