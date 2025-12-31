/**
 * NotFound Page
 * 404 error page
 */

import { Link } from 'react-router-dom';

export function NotFound() {
  return (
    <div className="p-6">
      <div className="flex flex-col items-center justify-center min-h-[400px] text-center">
        <svg
          width="64"
          height="64"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.5"
          strokeLinecap="round"
          strokeLinejoin="round"
          className="text-red-500 mb-6"
        >
          <circle cx="12" cy="12" r="10" />
          <line x1="12" y1="8" x2="12" y2="12" />
          <line x1="12" y1="16" x2="12.01" y2="16" />
        </svg>
        <h1 className="text-4xl font-bold text-content-primary mb-2">404</h1>
        <p className="text-content-secondary mb-6">Page not found</p>
        <Link
          to="/"
          className="inline-flex items-center justify-center px-4 py-2 bg-indigo-500 text-white rounded-lg text-sm font-medium hover:bg-indigo-600 transition-colors"
        >
          Go to Dashboard
        </Link>
      </div>
    </div>
  );
}
