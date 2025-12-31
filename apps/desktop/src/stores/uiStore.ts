/**
 * UI Store
 * Zustand store for managing UI state like sidebar expansion
 */

import { create } from 'zustand';
import { persist } from 'zustand/middleware';

// Duration in ms for the highlight animation
const HIGHLIGHT_DURATION = 2000;

interface UIStore {
  // Section expansion state (e.g., { projects: true })
  expandedSections: Record<string, boolean>;

  // Highlighted ticket ID (for real-time state change animation)
  highlightedTicketId: string | null;

  // Check if a section is expanded
  isSectionExpanded: (sectionId: string) => boolean;

  // Toggle a section's expansion state
  toggleSection: (sectionId: string) => void;

  // Set a section's expansion state
  setSectionExpanded: (sectionId: string, expanded: boolean) => void;

  // Set highlighted ticket (auto-clears after animation duration)
  setHighlightedTicket: (ticketId: string | null) => void;
}

// Track timeout for clearing highlight
let highlightTimeout: ReturnType<typeof setTimeout> | null = null;

export const useUIStore = create<UIStore>()(
  persist(
    (set, get) => ({
      expandedSections: {
        projects: true, // Projects expanded by default
      },

      highlightedTicketId: null,

      isSectionExpanded: (sectionId: string) => {
        return get().expandedSections[sectionId] ?? false;
      },

      toggleSection: (sectionId: string) => {
        set((state) => ({
          expandedSections: {
            ...state.expandedSections,
            [sectionId]: !state.expandedSections[sectionId],
          },
        }));
      },

      setSectionExpanded: (sectionId: string, expanded: boolean) => {
        set((state) => ({
          expandedSections: {
            ...state.expandedSections,
            [sectionId]: expanded,
          },
        }));
      },

      setHighlightedTicket: (ticketId: string | null) => {
        // Clear any existing timeout
        if (highlightTimeout) {
          clearTimeout(highlightTimeout);
          highlightTimeout = null;
        }

        set({ highlightedTicketId: ticketId });

        // Auto-clear highlight after animation duration
        if (ticketId) {
          highlightTimeout = setTimeout(() => {
            set({ highlightedTicketId: null });
            highlightTimeout = null;
          }, HIGHLIGHT_DURATION);
        }
      },
    }),
    {
      name: 'claude-pm-ui-state',
      // Don't persist highlightedTicketId
      partialize: (state) => ({ expandedSections: state.expandedSections }),
    }
  )
);
