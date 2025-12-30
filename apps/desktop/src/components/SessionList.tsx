/**
 * SessionList Component
 * Main list container for displaying all sessions
 */

import { useEffect } from 'react';
import { useSessionStore } from '../stores/sessionStore';
import { useWebSocket } from '../hooks/useWebSocket';
import { SessionCard } from './SessionCard';

export function SessionList() {
  const { sessions, loading, error, fetchSessions, clearError } = useSessionStore();

  // Connect to WebSocket for real-time updates
  useWebSocket();

  // Fetch sessions on mount
  useEffect(() => {
    fetchSessions();
  }, [fetchSessions]);

  const handleRetry = () => {
    clearError();
    fetchSessions();
  };

  if (loading && sessions.length === 0) {
    return (
      <div className="session-list session-list--loading">
        <div className="spinner" />
        <span>Loading sessions...</span>
      </div>
    );
  }

  if (error) {
    return (
      <div className="session-list session-list--error">
        <div className="error-icon">
          <svg
            width="48"
            height="48"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.5"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <circle cx="12" cy="12" r="10" />
            <line x1="12" y1="8" x2="12" y2="12" />
            <line x1="12" y1="16" x2="12.01" y2="16" />
          </svg>
        </div>
        <span className="error-message">{error}</span>
        <button className="retry-button" onClick={handleRetry}>
          Retry
        </button>
      </div>
    );
  }

  if (sessions.length === 0) {
    return (
      <div className="session-list session-list--empty">
        <span>No sessions found</span>
        <button className="refresh-button" onClick={fetchSessions}>
          Refresh
        </button>
      </div>
    );
  }

  return (
    <div className="session-list">
      <div className="session-list__header">
        <h2 className="session-list__title">Sessions</h2>
        <button
          className="refresh-button refresh-button--icon"
          onClick={fetchSessions}
          disabled={loading}
          title="Refresh sessions"
        >
          <svg
            className={loading ? 'spinning' : ''}
            width="20"
            height="20"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <path d="M21 12a9 9 0 11-9-9c2.52 0 4.93 1 6.74 2.74L21 8" />
            <path d="M21 3v5h-5" />
          </svg>
        </button>
      </div>

      <div className="session-list__content">
        {sessions.map((session) => (
          <SessionCard key={session.id} session={session} />
        ))}
      </div>
    </div>
  );
}
