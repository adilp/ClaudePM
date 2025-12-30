/**
 * StatusBadge Component
 * Displays a color-coded status indicator for sessions
 */

import type { SessionStatus } from '../types/api';

interface StatusBadgeProps {
  status: SessionStatus;
}

const STATUS_CONFIG: Record<SessionStatus, { label: string; className: string }> = {
  running: { label: 'Active', className: 'status-badge--running' },
  paused: { label: 'Paused', className: 'status-badge--paused' },
  completed: { label: 'Completed', className: 'status-badge--completed' },
  error: { label: 'Error', className: 'status-badge--error' },
};

export function StatusBadge({ status }: StatusBadgeProps) {
  const config = STATUS_CONFIG[status];

  return (
    <span className={`status-badge ${config.className}`}>
      {config.label}
    </span>
  );
}
