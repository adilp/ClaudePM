/**
 * Button Component
 * Reusable button with multiple variants
 */

import clsx from 'clsx';
import type { ButtonHTMLAttributes, ReactNode } from 'react';

export type ButtonVariant = 'primary' | 'secondary' | 'destructive' | 'ghost';
export type ButtonSize = 'sm' | 'md' | 'lg';

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: ButtonSize;
  children: ReactNode;
  loading?: boolean;
}

export function Button({
  variant = 'primary',
  size = 'md',
  children,
  loading = false,
  disabled,
  className,
  ...props
}: ButtonProps) {
  return (
    <button
      className={clsx(
        'btn',
        `btn--${variant}`,
        `btn--${size}`,
        loading && 'btn--loading',
        className
      )}
      disabled={disabled || loading}
      {...props}
    >
      {loading && <span className="spinner spinner--small" />}
      {children}
    </button>
  );
}
