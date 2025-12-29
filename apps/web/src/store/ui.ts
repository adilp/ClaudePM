/**
 * UI State Store
 * Zustand store for UI-related state
 */

import { create } from 'zustand';

// ============================================================================
// Types
// ============================================================================

interface UIState {
  // Sidebar
  sidebarOpen: boolean;
  setSidebarOpen: (open: boolean) => void;
  toggleSidebar: () => void;

  // Sidebar expanded sections
  expandedSections: string[];
  toggleSection: (section: string) => void;
  isSectionExpanded: (section: string) => boolean;

  // Theme
  theme: 'light' | 'dark' | 'system';
  setTheme: (theme: 'light' | 'dark' | 'system') => void;

  // Active session subscription
  activeSessionId: string | null;
  setActiveSessionId: (sessionId: string | null) => void;

  // Notifications
  notifications: Notification[];
  addNotification: (notification: Omit<Notification, 'id'>) => void;
  removeNotification: (id: string) => void;
  clearNotifications: () => void;
}

interface Notification {
  id: string;
  type: 'info' | 'success' | 'warning' | 'error';
  title: string;
  message?: string;
  duration?: number; // ms, undefined = persistent
}

// ============================================================================
// Store
// ============================================================================

// Helper to get initial expanded sections from localStorage
const getInitialExpandedSections = (): string[] => {
  try {
    const stored = localStorage.getItem('sidebar-expanded-sections');
    if (stored) {
      return JSON.parse(stored);
    }
  } catch {
    // Ignore parse errors
  }
  // Default: Projects section expanded
  return ['projects'];
};

export const useUIStore = create<UIState>((set, get) => ({
  // Sidebar
  sidebarOpen: false,
  setSidebarOpen: (open) => set({ sidebarOpen: open }),
  toggleSidebar: () => set((state) => ({ sidebarOpen: !state.sidebarOpen })),

  // Sidebar expanded sections
  expandedSections: getInitialExpandedSections(),
  toggleSection: (section) => {
    const { expandedSections } = get();
    const isExpanded = expandedSections.includes(section);
    const newSections = isExpanded
      ? expandedSections.filter((s) => s !== section)
      : [...expandedSections, section];

    // Persist to localStorage
    localStorage.setItem('sidebar-expanded-sections', JSON.stringify(newSections));
    set({ expandedSections: newSections });
  },
  isSectionExpanded: (section) => get().expandedSections.includes(section),

  // Theme
  theme: 'system',
  setTheme: (theme) => {
    set({ theme });
    // Apply theme to document
    const root = document.documentElement;
    if (theme === 'dark') {
      root.classList.add('dark');
    } else if (theme === 'light') {
      root.classList.remove('dark');
    } else {
      // System preference
      if (window.matchMedia('(prefers-color-scheme: dark)').matches) {
        root.classList.add('dark');
      } else {
        root.classList.remove('dark');
      }
    }
  },

  // Active session
  activeSessionId: null,
  setActiveSessionId: (sessionId) => set({ activeSessionId: sessionId }),

  // Notifications
  notifications: [],
  addNotification: (notification) =>
    set((state) => ({
      notifications: [
        ...state.notifications,
        { ...notification, id: crypto.randomUUID() },
      ],
    })),
  removeNotification: (id) =>
    set((state) => ({
      notifications: state.notifications.filter((n) => n.id !== id),
    })),
  clearNotifications: () => set({ notifications: [] }),
}));
