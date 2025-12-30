/**
 * useProjects Hook
 * Hook for accessing and loading projects data
 */

import { useEffect } from 'react';
import { useProjectStore } from '../stores/projectStore';

export function useProjects() {
  const { projects, loading, error, fetchProjects, clearError } =
    useProjectStore();

  useEffect(() => {
    // Only fetch if we don't have projects yet and not currently loading
    if (projects.length === 0 && !loading && !error) {
      fetchProjects();
    }
  }, [projects.length, loading, error, fetchProjects]);

  return {
    data: projects,
    isLoading: loading,
    isError: !!error,
    error,
    refetch: fetchProjects,
    clearError,
  };
}
