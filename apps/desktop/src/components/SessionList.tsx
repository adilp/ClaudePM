/**
 * SessionList Component
 * Main list container for displaying all sessions with keyboard navigation
 */

import { useEffect, useState, useCallback, useRef, useMemo } from 'react';
import { useSessionStore } from '../stores/sessionStore';
import { useWebSocket } from '../hooks/useWebSocket';
import { SessionCard } from './SessionCard';
import { SessionDetailModal } from './SessionDetailModal';
import { focusSession, showErrorNotification } from '../services/session-controller';
import { cn } from '../lib/utils';
import type { Session } from '../types/api';

export function SessionList() {
  const { sessions, loading, error, fetchSessions, clearError } = useSessionStore();
  const [selectedIndex, setSelectedIndex] = useState<number | null>(null);
  const [detailSession, setDetailSession] = useState<Session | null>(null);
  const listRef = useRef<HTMLDivElement>(null);

  // Filter out completed sessions
  const activeSessions = useMemo(
    () => sessions.filter((s) => s.status !== 'completed'),
    [sessions]
  );

  // Connect to WebSocket for real-time updates
  useWebSocket();

  // Fetch sessions on mount
  useEffect(() => {
    fetchSessions();
  }, [fetchSessions]);

  // Select first session when sessions load
  useEffect(() => {
    if (activeSessions.length > 0 && selectedIndex === null) {
      setSelectedIndex(0);
    }
  }, [activeSessions.length, selectedIndex]);

  // Reset selection if sessions change and index is out of bounds
  useEffect(() => {
    if (selectedIndex !== null && selectedIndex >= activeSessions.length) {
      setSelectedIndex(activeSessions.length > 0 ? activeSessions.length - 1 : null);
    }
  }, [activeSessions.length, selectedIndex]);

  const selectNextSession = useCallback(() => {
    if (activeSessions.length === 0) return;
    setSelectedIndex((prev) => {
      if (prev === null) return 0;
      return Math.min(prev + 1, activeSessions.length - 1);
    });
  }, [activeSessions.length]);

  const selectPreviousSession = useCallback(() => {
    if (activeSessions.length === 0) return;
    setSelectedIndex((prev) => {
      if (prev === null) return 0;
      return Math.max(prev - 1, 0);
    });
  }, [activeSessions.length]);

  const handleFocusSelected = useCallback(async () => {
    if (selectedIndex === null || !activeSessions[selectedIndex]) return;

    try {
      await focusSession(activeSessions[selectedIndex].id);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to focus session';
      await showErrorNotification(message);
    }
  }, [selectedIndex, activeSessions]);

  const handleSessionDoubleClick = useCallback((session: Session) => {
    setDetailSession(session);
  }, []);

  const handleCloseDetail = useCallback(() => {
    setDetailSession(null);
  }, []);

  // Keyboard navigation
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Only handle if the list or a card is focused
      if (!listRef.current?.contains(document.activeElement) &&
          document.activeElement !== document.body) {
        return;
      }

      switch (e.key) {
        case 'Enter':
          e.preventDefault();
          handleFocusSelected();
          break;
        case 'ArrowDown':
        case 'j':
          e.preventDefault();
          selectNextSession();
          break;
        case 'ArrowUp':
        case 'k':
          e.preventDefault();
          selectPreviousSession();
          break;
        case 'Home':
          e.preventDefault();
          if (activeSessions.length > 0) setSelectedIndex(0);
          break;
        case 'End':
          e.preventDefault();
          if (activeSessions.length > 0) setSelectedIndex(activeSessions.length - 1);
          break;
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [handleFocusSelected, selectNextSession, selectPreviousSession, activeSessions.length]);

  const handleRetry = () => {
    clearError();
    fetchSessions();
  };

  if (loading && sessions.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center gap-4 min-h-[300px] text-content-secondary">
        <div className="w-5 h-5 border-2 border-surface-tertiary border-t-indigo-500 rounded-full animate-spin" />
        <span>Loading sessions...</span>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex flex-col items-center justify-center gap-4 min-h-[300px] text-content-secondary">
        <div className="text-red-500">
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
        <span className="text-red-500 text-center">{error}</span>
        <button
          className="inline-flex items-center justify-center gap-2 px-5 py-2.5 bg-indigo-500 text-white rounded-lg text-sm font-medium cursor-pointer transition-colors hover:bg-indigo-600 disabled:opacity-60 disabled:cursor-not-allowed"
          onClick={handleRetry}
        >
          Retry
        </button>
      </div>
    );
  }

  if (activeSessions.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center gap-4 min-h-[300px] text-content-secondary">
        <span>No active sessions</span>
        <button
          className="inline-flex items-center justify-center gap-2 px-5 py-2.5 bg-indigo-500 text-white rounded-lg text-sm font-medium cursor-pointer transition-colors hover:bg-indigo-600"
          onClick={fetchSessions}
        >
          Refresh
        </button>
      </div>
    );
  }

  return (
    <div className="max-w-[800px] mx-auto" ref={listRef}>
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-lg font-semibold text-content-primary">Sessions</h2>
        <span className="text-xs text-content-muted ml-auto mr-3">
          Press Enter to focus selected session
        </span>
        <button
          className={cn(
            'p-2 bg-transparent rounded-md text-content-secondary cursor-pointer transition-colors',
            'hover:text-content-primary hover:bg-surface-tertiary',
            'disabled:opacity-60 disabled:cursor-not-allowed'
          )}
          onClick={fetchSessions}
          disabled={loading}
          title="Refresh sessions"
        >
          <svg
            className={loading ? 'animate-spin' : ''}
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

      <div className="flex flex-col gap-3" role="listbox" aria-label="Sessions">
        {activeSessions.map((session, index) => (
          <SessionCard
            key={session.id}
            session={session}
            isSelected={index === selectedIndex}
            onSelect={() => setSelectedIndex(index)}
            onDoubleClick={() => handleSessionDoubleClick(session)}
          />
        ))}
      </div>

      {detailSession && (
        <SessionDetailModal session={detailSession} onClose={handleCloseDetail} />
      )}
    </div>
  );
}
