/**
 * Project Hooks
 * React Query hooks for project data
 */

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '@/services/api';
import type { Project, ProjectDetail } from '@/types/api';

// Query keys
export const projectKeys = {
  all: ['projects'] as const,
  lists: () => [...projectKeys.all, 'list'] as const,
  list: (page: number, limit: number) => [...projectKeys.lists(), { page, limit }] as const,
  details: () => [...projectKeys.all, 'detail'] as const,
  detail: (id: string) => [...projectKeys.details(), id] as const,
};

// Hooks
export function useProjects(page = 1, limit = 20) {
  return useQuery({
    queryKey: projectKeys.list(page, limit),
    queryFn: () => api.getProjects(page, limit),
  });
}

export function useProject(id: string) {
  return useQuery({
    queryKey: projectKeys.detail(id),
    queryFn: () => api.getProject(id),
    enabled: !!id,
  });
}

export function useCreateProject() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (data: Parameters<typeof api.createProject>[0]) =>
      api.createProject(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: projectKeys.lists() });
    },
  });
}

export function useUpdateProject() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ id, data }: { id: string; data: Parameters<typeof api.updateProject>[1] }) =>
      api.updateProject(id, data),
    onSuccess: (updatedProject: Project) => {
      queryClient.invalidateQueries({ queryKey: projectKeys.lists() });
      queryClient.setQueryData(projectKeys.detail(updatedProject.id), (old: ProjectDetail | undefined) => {
        if (!old) return old;
        return { ...old, ...updatedProject };
      });
    },
  });
}

export function useDeleteProject() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (id: string) => api.deleteProject(id),
    onSuccess: (_, id) => {
      queryClient.invalidateQueries({ queryKey: projectKeys.lists() });
      queryClient.removeQueries({ queryKey: projectKeys.detail(id) });
    },
  });
}
