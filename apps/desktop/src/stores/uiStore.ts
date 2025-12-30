/**
 * UI Store
 * Zustand store for managing UI state like sidebar expansion
 */

import { create } from 'zustand';
import { persist } from 'zustand/middleware';

interface UIStore {
  // Section expansion state (e.g., { projects: true })
  expandedSections: Record<string, boolean>;

  // Check if a section is expanded
  isSectionExpanded: (sectionId: string) => boolean;

  // Toggle a section's expansion state
  toggleSection: (sectionId: string) => void;

  // Set a section's expansion state
  setSectionExpanded: (sectionId: string, expanded: boolean) => void;
}

export const useUIStore = create<UIStore>()(
  persist(
    (set, get) => ({
      expandedSections: {
        projects: true, // Projects expanded by default
      },

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
    }),
    {
      name: 'claude-pm-ui-state',
    }
  )
);
