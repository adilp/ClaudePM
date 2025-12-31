/**
 * StatusBadge Component
 * Displays a color-coded status indicator for sessions
 */

import { cn } from '../lib/utils';
import type { SessionStatus } from '../types/api';

interface StatusBadgeProps {
  status: SessionStatus;
}

const STATUS_CONFIG: Record<SessionStatus, { label: string; className: string }> = {
  running: {
    label: 'Active',
    className: 'bg-green-500/15 text-green-500',
  },
  paused: {
    label: 'Paused',
    className: 'bg-amber-500/15 text-amber-500',
  },
  completed: {
    label: 'Completed',
    className: 'bg-indigo-500/15 text-indigo-500',
  },
  error: {
    label: 'Error',
    className: 'bg-red-500/15 text-red-500',
  },
};

export function StatusBadge({ status }: StatusBadgeProps) {
  const config = STATUS_CONFIG[status];

  return (
    <span
      className={cn(
        'inline-flex items-center px-2 py-1 text-xs font-medium rounded-full capitalize whitespace-nowrap',
        config.className
      )}
    >
      {config.label}
    </span>
  );
}
