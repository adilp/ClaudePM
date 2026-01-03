/**
 * SessionList Component
 * Main list container for displaying all sessions with keyboard navigation
 * Sessions are grouped by project with collapsible headers
 */

import { useEffect, useState, useCallback, useRef, useMemo } from 'react';
import { useSessionStore } from '../stores/sessionStore';
import { useWebSocket } from '../hooks/useWebSocket';
import { SessionCard } from './SessionCard';
import { SessionDetailModal } from './SessionDetailModal';
import { focusSession, showErrorNotification } from '../services/session-controller';
import { cn } from '../lib/utils';
import type { Session } from '../types/api';

// ============================================================================
// Constants
// ============================================================================

const COLLAPSED_PROJECTS_KEY = 'sessionList.collapsedProjects';

// ============================================================================
// Types
// ============================================================================

interface ProjectGroup {
  projectName: string;
  projectId: string | null;
  sessions: Session[];
  mostRecentActivity: Date;
}

// ============================================================================
// Helper Functions
// ============================================================================

function loadCollapsedProjects(): Set<string> {
  try {
    const stored = localStorage.getItem(COLLAPSED_PROJECTS_KEY);
    if (stored) {
      return new Set(JSON.parse(stored));
    }
  } catch {
    // Ignore parse errors
  }
  return new Set();
}

function saveCollapsedProjects(collapsed: Set<string>): void {
  localStorage.setItem(COLLAPSED_PROJECTS_KEY, JSON.stringify([...collapsed]));
}

function groupSessionsByProject(sessions: Session[]): ProjectGroup[] {
  const groups = new Map<string, ProjectGroup>();

  for (const session of sessions) {
    const projectName = session.project?.name ?? 'Unassigned';
    const projectId = session.project?.id ?? null;
    const key = projectId ?? 'unassigned';

    if (!groups.has(key)) {
      groups.set(key, {
        projectName,
        projectId,
        sessions: [],
        mostRecentActivity: new Date(0),
      });
    }

    const group = groups.get(key)!;
    group.sessions.push(session);

    // Track most recent activity for sorting
    const updatedAt = new Date(session.updated_at);
    if (updatedAt > group.mostRecentActivity) {
      group.mostRecentActivity = updatedAt;
    }
  }

  // Sort groups by most recent activity (descending)
  return Array.from(groups.values()).sort(
    (a, b) => b.mostRecentActivity.getTime() - a.mostRecentActivity.getTime()
  );
}

// ============================================================================
// CollapsibleProjectGroup Component
// ============================================================================

interface CollapsibleProjectGroupProps {
  group: ProjectGroup;
  isCollapsed: boolean;
  onToggle: () => void;
  selectedSessionId: string | null;
  onSelectSession: (session: Session) => void;
  onDoubleClickSession: (session: Session) => void;
}

function CollapsibleProjectGroup({
  group,
  isCollapsed,
  onToggle,
  selectedSessionId,
  onSelectSession,
  onDoubleClickSession,
}: CollapsibleProjectGroupProps) {
  return (
    <div className="space-y-2">
      <button
        onClick={onToggle}
        className="flex items-center gap-2 w-full text-left py-2 px-1 rounded hover:bg-surface-tertiary transition-colors group"
      >
        <span
          className={cn(
            'text-content-muted transition-transform text-sm',
            !isCollapsed && 'rotate-90'
          )}
        >
          ▶
        </span>
        <span className="font-medium text-content-primary">{group.projectName}</span>
      </button>
      {!isCollapsed && (
        <div className="flex flex-col gap-2 pl-5">
          {group.sessions.map((session) => (
            <SessionCard
              key={session.id}
              session={session}
              isSelected={session.id === selectedSessionId}
              onSelect={() => onSelectSession(session)}
              onDoubleClick={() => onDoubleClickSession(session)}
            />
          ))}
        </div>
      )}
    </div>
  );
}

export function SessionList() {
  const { sessions, loading, error, fetchSessions, clearError } = useSessionStore();
  const [selectedSessionId, setSelectedSessionId] = useState<string | null>(null);
  const [detailSession, setDetailSession] = useState<Session | null>(null);
  const [collapsedProjects, setCollapsedProjects] = useState<Set<string>>(loadCollapsedProjects);
  const listRef = useRef<HTMLDivElement>(null);

  // Filter out completed sessions
  const activeSessions = useMemo(
    () => sessions.filter((s) => s.status !== 'completed'),
    [sessions]
  );

  // Group sessions by project, sorted by recent activity
  const groupedSessions = useMemo(
    () => groupSessionsByProject(activeSessions),
    [activeSessions]
  );

  // Flatten sessions for keyboard navigation (respecting collapsed state)
  const flattenedSessions = useMemo(() => {
    const result: Session[] = [];
    for (const group of groupedSessions) {
      const key = group.projectId ?? 'unassigned';
      if (!collapsedProjects.has(key)) {
        result.push(...group.sessions);
      }
    }
    return result;
  }, [groupedSessions, collapsedProjects]);

  // Toggle project collapse state
  const toggleProjectCollapse = useCallback((projectId: string | null) => {
    const key = projectId ?? 'unassigned';
    setCollapsedProjects((prev) => {
      const next = new Set(prev);
      if (next.has(key)) {
        next.delete(key);
      } else {
        next.add(key);
      }
      saveCollapsedProjects(next);
      return next;
    });
  }, []);

  // Connect to WebSocket for real-time updates
  useWebSocket();

  // Fetch sessions on mount
  useEffect(() => {
    fetchSessions();
  }, [fetchSessions]);

  // Select first session when sessions load
  useEffect(() => {
    if (flattenedSessions.length > 0 && selectedSessionId === null) {
      setSelectedSessionId(flattenedSessions[0].id);
    }
  }, [flattenedSessions, selectedSessionId]);

  // Reset selection if selected session is no longer visible
  useEffect(() => {
    if (selectedSessionId !== null) {
      const stillVisible = flattenedSessions.some((s) => s.id === selectedSessionId);
      if (!stillVisible && flattenedSessions.length > 0) {
        setSelectedSessionId(flattenedSessions[0].id);
      } else if (!stillVisible) {
        setSelectedSessionId(null);
      }
    }
  }, [flattenedSessions, selectedSessionId]);

  const selectNextSession = useCallback(() => {
    if (flattenedSessions.length === 0) return;
    const currentIndex = flattenedSessions.findIndex((s) => s.id === selectedSessionId);
    const nextIndex = currentIndex === -1 ? 0 : Math.min(currentIndex + 1, flattenedSessions.length - 1);
    setSelectedSessionId(flattenedSessions[nextIndex].id);
  }, [flattenedSessions, selectedSessionId]);

  const selectPreviousSession = useCallback(() => {
    if (flattenedSessions.length === 0) return;
    const currentIndex = flattenedSessions.findIndex((s) => s.id === selectedSessionId);
    const prevIndex = currentIndex === -1 ? 0 : Math.max(currentIndex - 1, 0);
    setSelectedSessionId(flattenedSessions[prevIndex].id);
  }, [flattenedSessions, selectedSessionId]);

  const handleFocusSelected = useCallback(async () => {
    if (selectedSessionId === null) return;

    try {
      await focusSession(selectedSessionId);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to focus session';
      await showErrorNotification(message);
    }
  }, [selectedSessionId]);

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
          if (flattenedSessions.length > 0) setSelectedSessionId(flattenedSessions[0].id);
          break;
        case 'End':
          e.preventDefault();
          if (flattenedSessions.length > 0) setSelectedSessionId(flattenedSessions[flattenedSessions.length - 1].id);
          break;
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [handleFocusSelected, selectNextSession, selectPreviousSession, flattenedSessions]);

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

      <div className="flex flex-col gap-4" role="listbox" aria-label="Sessions">
        {groupedSessions.map((group) => (
          <CollapsibleProjectGroup
            key={group.projectId ?? 'unassigned'}
            group={group}
            isCollapsed={collapsedProjects.has(group.projectId ?? 'unassigned')}
            onToggle={() => toggleProjectCollapse(group.projectId)}
            selectedSessionId={selectedSessionId}
            onSelectSession={(session) => setSelectedSessionId(session.id)}
            onDoubleClickSession={handleSessionDoubleClick}
          />
        ))}
      </div>

      {detailSession && (
        <SessionDetailModal session={detailSession} onClose={handleCloseDetail} />
      )}
    </div>
  );
}
