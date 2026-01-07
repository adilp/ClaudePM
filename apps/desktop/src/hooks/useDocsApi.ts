/**
 * Documentation API Hooks
 * React Query hooks for project documentation endpoints
 */

import { useQuery } from '@tanstack/react-query';
import { queryKeys } from './query-keys.js';
import * as api from '../services/api.js';

// ============================================================================
// Types
// ============================================================================

export interface DocTreeItem {
  name: string;
  type: 'file' | 'directory';
  path: string;
  children?: DocTreeItem[];
}

export interface DocTreeResponse {
  tree: DocTreeItem[];
}

export interface DocContentResponse {
  path: string;
  content: string;
  name: string;
}

// ============================================================================
// API Functions
// ============================================================================

async function getDocsTree(projectId: string): Promise<DocTreeResponse> {
  const baseUrl = await api.getApiUrl();
  const apiKey = await api.getApiKey();

  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
  };

  if (apiKey) {
    headers['X-API-Key'] = apiKey;
  }

  const response = await fetch(`${baseUrl}/api/projects/${projectId}/docs`, {
    headers,
  });

  if (!response.ok) {
    const error = await response.json().catch(() => ({
      error: `HTTP ${response.status}: ${response.statusText}`,
    }));
    throw new api.ApiError(error.error || error.message || 'Unknown error', response.status);
  }

  return response.json();
}

async function getDocContent(projectId: string, docPath: string): Promise<DocContentResponse> {
  const baseUrl = await api.getApiUrl();
  const apiKey = await api.getApiKey();

  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
  };

  if (apiKey) {
    headers['X-API-Key'] = apiKey;
  }

  const response = await fetch(`${baseUrl}/api/projects/${projectId}/docs/${docPath}`, {
    headers,
  });

  if (!response.ok) {
    const error = await response.json().catch(() => ({
      error: `HTTP ${response.status}: ${response.statusText}`,
    }));
    throw new api.ApiError(error.error || error.message || 'Unknown error', response.status);
  }

  return response.json();
}

// ============================================================================
// Query Key Extensions
// ============================================================================

// Extend queryKeys with docs keys
export const docsQueryKeys = {
  all: (projectId: string) => [...queryKeys.projects.detail(projectId), 'docs'] as const,
  tree: (projectId: string) => [...docsQueryKeys.all(projectId), 'tree'] as const,
  content: (projectId: string, docPath: string) =>
    [...docsQueryKeys.all(projectId), 'content', docPath] as const,
};

// ============================================================================
// Query Hooks
// ============================================================================

export function useDocsTree(projectId: string) {
  return useQuery({
    queryKey: docsQueryKeys.tree(projectId),
    queryFn: () => getDocsTree(projectId),
    enabled: !!projectId,
    staleTime: 5 * 60 * 1000, // 5 minutes
  });
}

export function useDocContent(projectId: string, docPath: string | null) {
  return useQuery({
    queryKey: docsQueryKeys.content(projectId, docPath || ''),
    queryFn: () => getDocContent(projectId, docPath!),
    enabled: !!projectId && !!docPath,
    staleTime: 5 * 60 * 1000, // 5 minutes
  });
}
