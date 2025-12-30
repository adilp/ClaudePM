/**
 * Dialog Component
 * Modal dialog for confirmations and forms
 */

import clsx from 'clsx';
import { useEffect, useCallback, type ReactNode } from 'react';

interface DialogProps {
  open: boolean;
  onClose: () => void;
  children: ReactNode;
  className?: string;
}

export function Dialog({ open, onClose, children, className }: DialogProps) {
  // Handle escape key
  const handleEscape = useCallback(
    (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose();
      }
    },
    [onClose]
  );

  useEffect(() => {
    if (open) {
      document.addEventListener('keydown', handleEscape);
      // Prevent body scroll
      document.body.style.overflow = 'hidden';
    }
    return () => {
      document.removeEventListener('keydown', handleEscape);
      document.body.style.overflow = '';
    };
  }, [open, handleEscape]);

  if (!open) {
    return null;
  }

  return (
    <div className="dialog-backdrop" onClick={onClose}>
      <div
        className={clsx('dialog', className)}
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
      >
        {children}
      </div>
    </div>
  );
}

interface DialogHeaderProps {
  children: ReactNode;
  className?: string;
}

export function DialogHeader({ children, className }: DialogHeaderProps) {
  return <div className={clsx('dialog__header', className)}>{children}</div>;
}

interface DialogTitleProps {
  children: ReactNode;
  className?: string;
}

export function DialogTitle({ children, className }: DialogTitleProps) {
  return <h2 className={clsx('dialog__title', className)}>{children}</h2>;
}

interface DialogDescriptionProps {
  children: ReactNode;
  className?: string;
}

export function DialogDescription({ children, className }: DialogDescriptionProps) {
  return <p className={clsx('dialog__description', className)}>{children}</p>;
}

interface DialogContentProps {
  children: ReactNode;
  className?: string;
}

export function DialogContent({ children, className }: DialogContentProps) {
  return <div className={clsx('dialog__content', className)}>{children}</div>;
}

interface DialogFooterProps {
  children: ReactNode;
  className?: string;
}

export function DialogFooter({ children, className }: DialogFooterProps) {
  return <div className={clsx('dialog__footer', className)}>{children}</div>;
}

interface DialogCloseProps {
  onClick: () => void;
  className?: string;
}

export function DialogClose({ onClick, className }: DialogCloseProps) {
  return (
    <button
      className={clsx('dialog__close', className)}
      onClick={onClick}
      aria-label="Close dialog"
    >
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
        <line x1="18" y1="6" x2="6" y2="18" />
        <line x1="6" y1="6" x2="18" y2="18" />
      </svg>
    </button>
  );
}
