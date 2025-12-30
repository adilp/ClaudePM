/**
 * NotFound Page
 * 404 error page
 */

import { Link } from 'react-router-dom';

export function NotFound() {
  return (
    <div className="page page--placeholder page--not-found">
      <div className="placeholder-content">
        <svg
          width="64"
          height="64"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.5"
          strokeLinecap="round"
          strokeLinejoin="round"
          className="placeholder-icon placeholder-icon--error"
        >
          <circle cx="12" cy="12" r="10" />
          <line x1="12" y1="8" x2="12" y2="12" />
          <line x1="12" y1="16" x2="12.01" y2="16" />
        </svg>
        <h1 className="placeholder-title">404</h1>
        <p className="placeholder-text">Page not found</p>
        <Link to="/" className="placeholder-link">
          Go to Dashboard
        </Link>
      </div>
    </div>
  );
}
