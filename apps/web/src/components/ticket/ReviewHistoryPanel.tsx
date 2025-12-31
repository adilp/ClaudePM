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
import type { ReviewResultEntry } from '@/types/api';
import { cn } from '@/lib/utils';

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
    color: 'text-green-600 dark:text-green-400',
    bgColor: 'bg-green-100 dark:bg-green-900/30',
  },
  not_complete: {
    icon: XCircle,
    label: 'Not Complete',
    color: 'text-amber-600 dark:text-amber-400',
    bgColor: 'bg-amber-100 dark:bg-amber-900/30',
  },
  needs_clarification: {
    icon: HelpCircle,
    label: 'Needs Clarification',
    color: 'text-blue-600 dark:text-blue-400',
    bgColor: 'bg-blue-100 dark:bg-blue-900/30',
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
    <div className={cn('rounded-lg border bg-card overflow-hidden', className)}>
      <button
        onClick={() => setIsExpanded(!isExpanded)}
        className="w-full flex items-center justify-between px-4 py-3 hover:bg-accent/50 transition-colors"
      >
        <div className="flex items-center gap-2">
          {isExpanded ? (
            <ChevronDown className="h-5 w-5" />
          ) : (
            <ChevronRight className="h-5 w-5" />
          )}
          <History className="h-5 w-5 text-purple-500" />
          <span className="font-semibold">Review History</span>
          <span className="text-sm text-muted-foreground">
            ({results.length} review{results.length !== 1 ? 's' : ''})
          </span>
        </div>
        {onRefresh && (
          <button
            onClick={(e) => {
              e.stopPropagation();
              onRefresh();
            }}
            className="p-1.5 rounded-md hover:bg-accent text-muted-foreground"
            title="Refresh history"
          >
            <RefreshCw className={cn('h-4 w-4', isLoading && 'animate-spin')} />
          </button>
        )}
      </button>

      {isExpanded && (
        <div className="border-t">
          {isLoading && results.length === 0 ? (
            <div className="flex items-center justify-center py-8">
              <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-primary" />
            </div>
          ) : (
            <div className="divide-y">
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
    <div className={cn('px-4 py-3', isLatest && 'bg-accent/30')}>
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
              <span className="text-xs px-1.5 py-0.5 rounded bg-purple-100 dark:bg-purple-900/30 text-purple-700 dark:text-purple-300">
                Latest
              </span>
            )}
            <span className="text-xs text-muted-foreground flex items-center gap-1">
              <TriggerIcon className="h-3 w-3" />
              {trigger.label}
            </span>
          </div>
          <p className="mt-1 text-sm text-muted-foreground line-clamp-2">
            {result.reasoning}
          </p>
          <div className="mt-1.5 flex items-center gap-3 text-xs text-muted-foreground">
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
