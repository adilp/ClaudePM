/**
 * Project Hooks
 * React Query hooks for project data
 */

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import * as api from '../services/api';
import { queryKeys } from './query-keys';
import type { Project, ProjectDetail } from '../types/api';

// ============================================================================
// Query Hooks
// ============================================================================

export function useProjects(page = 1, limit = 20) {
  return useQuery({
    queryKey: queryKeys.projects.list(page, limit),
    queryFn: () => api.getProjects(page, limit),
  });
}

export function useProject(id: string) {
  return useQuery({
    queryKey: queryKeys.projects.detail(id),
    queryFn: () => api.getProject(id),
    enabled: !!id,
  });
}

// ============================================================================
// Mutation Hooks
// ============================================================================

export function useCreateProject() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (data: Parameters<typeof api.createProject>[0]) =>
      api.createProject(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.projects.lists() });
    },
  });
}

export function useUpdateProject() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({
      id,
      data,
    }: {
      id: string;
      data: Parameters<typeof api.updateProject>[1];
    }) => api.updateProject(id, data),
    onSuccess: (updatedProject: Project) => {
      queryClient.invalidateQueries({ queryKey: queryKeys.projects.lists() });
      queryClient.setQueryData(
        queryKeys.projects.detail(updatedProject.id),
        (old: ProjectDetail | undefined) => {
          if (!old) return old;
          return { ...old, ...updatedProject };
        }
      );
    },
  });
}

export function useDeleteProject() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (id: string) => api.deleteProject(id),
    onSuccess: (_, id) => {
      queryClient.invalidateQueries({ queryKey: queryKeys.projects.lists() });
      queryClient.removeQueries({ queryKey: queryKeys.projects.detail(id) });
    },
  });
}
