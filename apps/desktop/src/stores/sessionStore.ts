/**
 * Session Store
 * Zustand store for managing session state
 */

import { create } from 'zustand';
import type { Session, SessionStatus } from '../types/api';
import { getSessions } from '../services/api';

interface SessionStore {
  sessions: Session[];
  loading: boolean;
  error: string | null;

  setSessions: (sessions: Session[]) => void;
  updateStatus: (sessionId: string, status: SessionStatus, contextPercent?: number) => void;
  fetchSessions: () => Promise<void>;
  clearError: () => void;
}

export const useSessionStore = create<SessionStore>((set) => ({
  sessions: [],
  loading: false,
  error: null,

  setSessions: (sessions) => set({ sessions }),

  updateStatus: (sessionId, status, contextPercent) =>
    set((state) => ({
      sessions: state.sessions.map((session) =>
        session.id === sessionId
          ? {
              ...session,
              status,
              context_percent: contextPercent ?? session.context_percent,
            }
          : session
      ),
    })),

  fetchSessions: async () => {
    set({ loading: true, error: null });
    try {
      const sessions = await getSessions();
      set({ sessions, loading: false });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to fetch sessions';
      set({ error: message, loading: false });
    }
  },

  clearError: () => set({ error: null }),
}));
