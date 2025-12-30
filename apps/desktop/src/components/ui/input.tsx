/**
 * Input Component
 * Styled text input with consistent appearance
 */

import clsx from 'clsx';
import { forwardRef, type InputHTMLAttributes } from 'react';

interface InputProps extends InputHTMLAttributes<HTMLInputElement> {
  error?: boolean;
}

export const Input = forwardRef<HTMLInputElement, InputProps>(
  ({ className, error, ...props }, ref) => {
    return (
      <input
        ref={ref}
        className={clsx('input', error && 'input--error', className)}
        {...props}
      />
    );
  }
);

Input.displayName = 'Input';
