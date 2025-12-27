import { z } from 'zod';

// Request schemas

export const createProjectSchema = z.object({
  name: z.string().min(1, 'Name is required').max(255),
  repo_path: z.string().min(1, 'Repository path is required').max(500),
  tmux_session: z.string().min(1, 'tmux session is required').max(255),
  tmux_window: z.string().max(255).optional(),
  tickets_path: z.string().max(500).optional(),
  handoff_path: z.string().max(500).optional(),
});

export const updateProjectSchema = z.object({
  name: z.string().min(1).max(255).optional(),
  tmux_session: z.string().min(1).max(255).optional(),
  tmux_window: z.string().max(255).nullable().optional(),
  tickets_path: z.string().max(500).optional(),
  handoff_path: z.string().max(500).optional(),
});

export const listProjectsQuerySchema = z.object({
  page: z.coerce.number().int().positive().default(1),
  limit: z.coerce.number().int().positive().max(100).default(20),
});

export const projectIdSchema = z.object({
  id: z.string().uuid('Invalid project ID'),
});

// Types derived from schemas
export type CreateProjectInput = z.infer<typeof createProjectSchema>;
export type UpdateProjectInput = z.infer<typeof updateProjectSchema>;
export type ListProjectsQuery = z.infer<typeof listProjectsQuerySchema>;

// Response types
export interface ProjectResponse {
  id: string;
  name: string;
  repo_path: string;
  tickets_path: string;
  handoff_path: string;
  tmux_session: string;
  tmux_window: string | null;
  created_at: string;
  updated_at: string;
}

export interface ProjectDetailResponse extends ProjectResponse {
  ticket_counts: {
    backlog: number;
    in_progress: number;
    review: number;
    done: number;
  };
  active_session: {
    id: string;
    status: string;
    context_percent: number;
    started_at: string | null;
  } | null;
}

export interface PaginatedResponse<T> {
  data: T[];
  pagination: {
    page: number;
    limit: number;
    total: number;
    total_pages: number;
  };
}

export interface ErrorResponse {
  error: string;
  details?: Record<string, string[]>;
}
