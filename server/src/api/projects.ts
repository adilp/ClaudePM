import { Router, Request, Response, NextFunction } from 'express';
import { ZodError } from 'zod';
import {
  createProjectSchema,
  updateProjectSchema,
  listProjectsQuerySchema,
  projectIdSchema,
  type CreateProjectInput,
  type UpdateProjectInput,
  type ProjectResponse,
  type ProjectDetailResponse,
  type PaginatedResponse,
  type ErrorResponse,
} from './projects-schemas.js';
import {
  createProject,
  listProjects,
  getProjectById,
  updateProject,
  deleteProject,
  ProjectNotFoundError,
  ProjectValidationError,
  ProjectConflictError,
} from '../services/projects.js';
import type { Project } from '../generated/prisma/index.js';

const router = Router();

// Helper to convert Prisma Project to API response format
function toProjectResponse(project: Project): ProjectResponse {
  return {
    id: project.id,
    name: project.name,
    repo_path: project.repoPath,
    tickets_path: project.ticketsPath,
    handoff_path: project.handoffPath,
    tmux_session: project.tmuxSession,
    tmux_window: project.tmuxWindow,
    created_at: project.createdAt.toISOString(),
    updated_at: project.updatedAt.toISOString(),
  };
}

// Helper to format Zod errors
function formatZodError(error: ZodError): ErrorResponse {
  const details: Record<string, string[]> = {};
  for (const issue of error.issues) {
    const path = issue.path.join('.');
    details[path] ??= [];
    details[path].push(issue.message);
  }
  return {
    error: 'Validation error',
    details,
  };
}

// Error handler for project routes
function handleProjectError(
  err: Error,
  res: Response<ErrorResponse>
): void {
  if (err instanceof ZodError) {
    res.status(400).json(formatZodError(err));
    return;
  }

  if (err instanceof ProjectNotFoundError) {
    res.status(404).json({ error: err.message });
    return;
  }

  if (err instanceof ProjectValidationError) {
    res.status(400).json({ error: err.message });
    return;
  }

  if (err instanceof ProjectConflictError) {
    res.status(409).json({ error: err.message });
    return;
  }

  // Log unexpected errors
  console.error('Unexpected error in projects API:', err);
  res.status(500).json({ error: 'Internal server error' });
}

// Async handler wrapper
function asyncHandler<T>(
  fn: (req: Request, res: Response<T>, next: NextFunction) => Promise<void>
) {
  return (req: Request, res: Response<T>, next: NextFunction): void => {
    Promise.resolve(fn(req, res, next)).catch((err) => {
      handleProjectError(err as Error, res as Response<ErrorResponse>);
    });
  };
}

/**
 * POST /api/projects
 * Create a new project
 */
router.post(
  '/',
  asyncHandler<ProjectResponse | ErrorResponse>(async (req, res) => {
    const input: CreateProjectInput = createProjectSchema.parse(req.body);

    const createData: Parameters<typeof createProject>[0] = {
      name: input.name,
      repoPath: input.repo_path,
      tmuxSession: input.tmux_session,
    };

    if (input.tmux_window !== undefined) {
      createData.tmuxWindow = input.tmux_window;
    }
    if (input.tickets_path !== undefined) {
      createData.ticketsPath = input.tickets_path;
    }
    if (input.handoff_path !== undefined) {
      createData.handoffPath = input.handoff_path;
    }

    const project = await createProject(createData);

    res.status(201).json(toProjectResponse(project));
  })
);

/**
 * GET /api/projects
 * List all projects with pagination
 */
router.get(
  '/',
  asyncHandler<PaginatedResponse<ProjectResponse> | ErrorResponse>(async (req, res) => {
    const query = listProjectsQuerySchema.parse(req.query);

    const result = await listProjects({
      page: query.page,
      limit: query.limit,
    });

    res.json({
      data: result.projects.map(toProjectResponse),
      pagination: {
        page: result.page,
        limit: result.limit,
        total: result.total,
        total_pages: result.totalPages,
      },
    });
  })
);

/**
 * GET /api/projects/:id
 * Get project details with ticket counts and active session
 */
router.get(
  '/:id',
  asyncHandler<ProjectDetailResponse | ErrorResponse>(async (req, res) => {
    const { id } = projectIdSchema.parse(req.params);

    const project = await getProjectById(id);

    const response: ProjectDetailResponse = {
      ...toProjectResponse(project),
      ticket_counts: project.ticketCounts,
      active_session: project.activeSession
        ? {
            id: project.activeSession.id,
            status: project.activeSession.status,
            context_percent: project.activeSession.contextPercent,
            started_at: project.activeSession.startedAt?.toISOString() ?? null,
          }
        : null,
    };

    res.json(response);
  })
);

/**
 * PATCH /api/projects/:id
 * Update a project
 */
router.patch(
  '/:id',
  asyncHandler<ProjectResponse | ErrorResponse>(async (req, res) => {
    const { id } = projectIdSchema.parse(req.params);
    const input: UpdateProjectInput = updateProjectSchema.parse(req.body);

    const updateData: Parameters<typeof updateProject>[1] = {};

    if (input.name !== undefined) {
      updateData.name = input.name;
    }
    if (input.tmux_session !== undefined) {
      updateData.tmuxSession = input.tmux_session;
    }
    if (input.tmux_window !== undefined) {
      updateData.tmuxWindow = input.tmux_window;
    }
    if (input.tickets_path !== undefined) {
      updateData.ticketsPath = input.tickets_path;
    }
    if (input.handoff_path !== undefined) {
      updateData.handoffPath = input.handoff_path;
    }

    const project = await updateProject(id, updateData);

    res.json(toProjectResponse(project));
  })
);

/**
 * DELETE /api/projects/:id
 * Delete a project
 */
router.delete(
  '/:id',
  asyncHandler<void | ErrorResponse>(async (req, res) => {
    const { id } = projectIdSchema.parse(req.params);

    await deleteProject(id);

    res.status(204).send();
  })
);

export default router;
