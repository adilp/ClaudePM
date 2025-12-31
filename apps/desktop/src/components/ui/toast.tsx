/**
 * Toast Component
 * Individual toast notification display
 */

import { useEffect } from 'react';
import { cn } from '../../lib/utils';
import type { ToastType } from '../../hooks/use-toast';

interface ToastProps {
  id: string;
  type: ToastType;
  title: string;
  message?: string;
  duration?: number;
  onDismiss: () => void;
}

const typeStyles: Record<ToastType, { bg: string; icon: string }> = {
  success: { bg: 'border-l-green-500', icon: 'text-green-500' },
  error: { bg: 'border-l-red-500', icon: 'text-red-500' },
  warning: { bg: 'border-l-amber-500', icon: 'text-amber-500' },
  info: { bg: 'border-l-indigo-500', icon: 'text-indigo-500' },
};

// SVG Icons inline to avoid external dependencies
const icons: Record<ToastType, React.ReactNode> = {
  success: (
    <svg
      width="20"
      height="20"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14" />
      <polyline points="22 4 12 14.01 9 11.01" />
    </svg>
  ),
  error: (
    <svg
      width="20"
      height="20"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <circle cx="12" cy="12" r="10" />
      <line x1="12" y1="8" x2="12" y2="12" />
      <line x1="12" y1="16" x2="12.01" y2="16" />
    </svg>
  ),
  warning: (
    <svg
      width="20"
      height="20"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3Z" />
      <line x1="12" y1="9" x2="12" y2="13" />
      <line x1="12" y1="17" x2="12.01" y2="17" />
    </svg>
  ),
  info: (
    <svg
      width="20"
      height="20"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <circle cx="12" cy="12" r="10" />
      <line x1="12" y1="16" x2="12" y2="12" />
      <line x1="12" y1="8" x2="12.01" y2="8" />
    </svg>
  ),
};

export function Toast({ type, title, message, duration = 5000, onDismiss }: ToastProps) {
  useEffect(() => {
    if (duration > 0) {
      const timer = setTimeout(onDismiss, duration);
      return () => clearTimeout(timer);
    }
  }, [duration, onDismiss]);

  return (
    <div
      className={cn(
        'flex items-start gap-3 p-4 bg-surface-secondary border border-line border-l-4 rounded-lg shadow-lg',
        'animate-[toast-slide-in_0.3s_ease-out]',
        typeStyles[type].bg
      )}
    >
      <div className={cn('shrink-0', typeStyles[type].icon)}>
        {icons[type]}
      </div>
      <div className="flex-1 min-w-0">
        <p className="font-medium text-content-primary">{title}</p>
        {message && <p className="text-sm text-content-secondary mt-0.5">{message}</p>}
      </div>
      <button
        className="shrink-0 p-1 bg-transparent border-none text-content-muted cursor-pointer rounded transition-colors hover:text-content-primary hover:bg-surface-tertiary"
        onClick={onDismiss}
        aria-label="Dismiss"
      >
        <svg
          width="16"
          height="16"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <line x1="18" y1="6" x2="6" y2="18" />
          <line x1="6" y1="6" x2="18" y2="18" />
        </svg>
      </button>
    </div>
  );
}
