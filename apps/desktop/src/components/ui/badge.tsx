/**
 * Badge Component
 * Displays status indicators with appropriate colors
 */

import clsx from 'clsx';
import type { ReactNode } from 'react';

export type BadgeVariant = 'default' | 'success' | 'warning' | 'error' | 'info';

interface BadgeProps {
  variant?: BadgeVariant;
  children: ReactNode;
  className?: string;
}

export function Badge({ variant = 'default', children, className }: BadgeProps) {
  return (
    <span className={clsx('badge', `badge--${variant}`, className)}>
      {children}
    </span>
  );
}
