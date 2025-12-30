/**
 * Project Store
 * Zustand store for managing project state
 */

import { create } from 'zustand';
import type { Project } from '../types/api';
import { getProjects } from '../services/api';

interface ProjectStore {
  projects: Project[];
  loading: boolean;
  error: string | null;

  setProjects: (projects: Project[]) => void;
  fetchProjects: () => Promise<void>;
  clearError: () => void;
}

export const useProjectStore = create<ProjectStore>((set) => ({
  projects: [],
  loading: false,
  error: null,

  setProjects: (projects) => set({ projects }),

  fetchProjects: async () => {
    set({ loading: true, error: null });
    try {
      const response = await getProjects(1, 50);
      set({ projects: response.data, loading: false });
    } catch (error) {
      const message =
        error instanceof Error ? error.message : 'Failed to fetch projects';
      set({ error: message, loading: false });
    }
  },

  clearError: () => set({ error: null }),
}));
