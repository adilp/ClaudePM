/**
 * Review Result Banner
 * Displays the latest review result prominently at the top of the ticket
 */

import { CheckCircle, XCircle, HelpCircle, Clock, Zap, Hand, Play } from 'lucide-react';
import type { ReviewResultEntry } from '../../types/api';
import { cn } from '../../lib/utils';

interface ReviewResultBannerProps {
  result: ReviewResultEntry;
  className?: string;
}

const decisionConfig = {
  complete: {
    icon: CheckCircle,
    label: 'Complete',
    bgColor: 'bg-green-500/10',
    borderColor: 'border-green-500/30',
    iconColor: 'text-green-400',
    textColor: 'text-green-300',
  },
  not_complete: {
    icon: XCircle,
    label: 'Not Complete',
    bgColor: 'bg-amber-500/10',
    borderColor: 'border-amber-500/30',
    iconColor: 'text-amber-400',
    textColor: 'text-amber-300',
  },
  needs_clarification: {
    icon: HelpCircle,
    label: 'Needs Clarification',
    bgColor: 'bg-blue-500/10',
    borderColor: 'border-blue-500/30',
    iconColor: 'text-blue-400',
    textColor: 'text-blue-300',
  },
};

const triggerConfig = {
  stop_hook: { icon: Hand, label: 'Stop Hook' },
  idle_timeout: { icon: Clock, label: 'Idle Timeout' },
  completion_signal: { icon: Zap, label: 'Completion Signal' },
  manual: { icon: Play, label: 'Manual' },
};

export function ReviewResultBanner({ result, className }: ReviewResultBannerProps) {
  const config = decisionConfig[result.decision];
  const trigger = triggerConfig[result.trigger];
  const DecisionIcon = config.icon;
  const TriggerIcon = trigger.icon;

  const timeAgo = getTimeAgo(new Date(result.created_at));

  return (
    <div
      className={cn(
        'rounded-lg border p-4',
        config.bgColor,
        config.borderColor,
        className
      )}
    >
      <div className="flex items-start gap-3">
        <DecisionIcon className={cn('h-5 w-5 mt-0.5 shrink-0', config.iconColor)} />
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className={cn('font-semibold', config.textColor)}>
              {config.label}
            </span>
            <span className="text-xs text-content-muted flex items-center gap-1">
              <TriggerIcon className="h-3 w-3" />
              {trigger.label}
            </span>
            <span className="text-xs text-content-muted">
              {timeAgo}
            </span>
          </div>
          <p className={cn('mt-1 text-sm', config.textColor)}>
            {result.reasoning}
          </p>
        </div>
      </div>
    </div>
  );
}

function getTimeAgo(date: Date): string {
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffMins = Math.floor(diffMs / 60000);
  const diffHours = Math.floor(diffMs / 3600000);
  const diffDays = Math.floor(diffMs / 86400000);

  if (diffMins < 1) return 'just now';
  if (diffMins < 60) return `${diffMins}m ago`;
  if (diffHours < 24) return `${diffHours}h ago`;
  if (diffDays < 7) return `${diffDays}d ago`;
  return date.toLocaleDateString();
}

export default ReviewResultBanner;
