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

  // Keyboard navigation state for Kanban board
  selectedColumnIndex: number;
  selectedTicketIndex: number;

  // Kanban filter state per project (projectId -> selected prefixes)
  kanbanFilters: Record<string, string[]>;

  // Check if a section is expanded
  isSectionExpanded: (sectionId: string) => boolean;

  // Toggle a section's expansion state
  toggleSection: (sectionId: string) => void;

  // Set a section's expansion state
  setSectionExpanded: (sectionId: string, expanded: boolean) => void;

  // Set highlighted ticket (auto-clears after animation duration)
  setHighlightedTicket: (ticketId: string | null) => void;

  // Keyboard navigation actions
  setSelectedColumn: (index: number) => void;
  setSelectedTicket: (index: number) => void;
  resetKanbanSelection: () => void;

  // Kanban filter actions
  getKanbanFilters: (projectId: string) => string[];
  setKanbanFilters: (projectId: string, filters: string[]) => void;
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

      // Keyboard navigation defaults
      selectedColumnIndex: 0,
      selectedTicketIndex: 0,

      // Kanban filters per project
      kanbanFilters: {},

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

      setSelectedColumn: (index: number) => {
        set({ selectedColumnIndex: index, selectedTicketIndex: 0 });
      },

      setSelectedTicket: (index: number) => {
        set({ selectedTicketIndex: index });
      },

      resetKanbanSelection: () => {
        set({ selectedColumnIndex: 0, selectedTicketIndex: 0 });
      },

      getKanbanFilters: (projectId: string) => {
        return get().kanbanFilters[projectId] ?? [];
      },

      setKanbanFilters: (projectId: string, filters: string[]) => {
        set((state) => ({
          kanbanFilters: {
            ...state.kanbanFilters,
            [projectId]: filters,
          },
        }));
      },
    }),
    {
      name: 'claude-pm-ui-state',
      // Persist expandedSections and kanbanFilters, but not transient state
      partialize: (state) => ({
        expandedSections: state.expandedSections,
        kanbanFilters: state.kanbanFilters,
      }),
    }
  )
);
