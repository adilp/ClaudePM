/**
 * Badge Component
 * Displays status indicators with appropriate colors
 */

import { cn } from '../../lib/utils';
import type { ReactNode } from 'react';

export type BadgeVariant = 'default' | 'success' | 'warning' | 'error' | 'info';

interface BadgeProps {
  variant?: BadgeVariant;
  children: ReactNode;
  className?: string;
}

const variantStyles: Record<BadgeVariant, string> = {
  default: 'bg-surface-tertiary text-content-secondary',
  success: 'bg-green-500/15 text-green-500',
  warning: 'bg-amber-500/15 text-amber-500',
  error: 'bg-red-500/15 text-red-500',
  info: 'bg-indigo-500/15 text-indigo-500',
};

export function Badge({ variant = 'default', children, className }: BadgeProps) {
  return (
    <span
      className={cn(
        'inline-flex items-center px-2 py-0.5 text-xs font-medium rounded-full whitespace-nowrap',
        variantStyles[variant],
        className
      )}
    >
      {children}
    </span>
  );
}
