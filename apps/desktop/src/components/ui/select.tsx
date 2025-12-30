/**
 * Select Component
 * Styled dropdown select with consistent appearance
 */

import clsx from 'clsx';
import { forwardRef, type SelectHTMLAttributes } from 'react';

interface SelectProps extends SelectHTMLAttributes<HTMLSelectElement> {
  error?: boolean;
}

export const Select = forwardRef<HTMLSelectElement, SelectProps>(
  ({ className, error, children, ...props }, ref) => {
    return (
      <div className="select-wrapper">
        <select
          ref={ref}
          className={clsx('select', error && 'select--error', className)}
          {...props}
        >
          {children}
        </select>
        <svg
          className="select__chevron"
          width="16"
          height="16"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <polyline points="6 9 12 15 18 9" />
        </svg>
      </div>
    );
  }
);

Select.displayName = 'Select';
