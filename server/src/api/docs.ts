/**
 * Docs API Routes
 * Endpoints for browsing project documentation
 */

import { Router, Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import { docsService } from '../services/docs.js';
import {
  DocsNotFoundError,
  DocFileNotFoundError,
  DocAccessDeniedError,
  DocTree,
  DocContent,
} from '../services/docs-types.js';
import { getProjectById, ProjectNotFoundError } from '../services/projects.js';

const router = Router();

// ============================================================================
// Schemas
// ============================================================================

const projectIdSchema = z.object({
  projectId: z.string().uuid('Invalid project ID'),
});

// ============================================================================
// Response Types
// ============================================================================

interface DocTreeResponse {
  tree: Array<{
    name: string;
    type: 'file' | 'directory';
    path: string;
    children?: DocTreeResponse['tree'];
  }>;
}

interface DocContentResponse {
  path: string;
  content: string;
  name: string;
}

interface ErrorResponse {
  error: string;
  code?: string;
}

// ============================================================================
// Helpers
// ============================================================================

function toDocTreeResponse(result: DocTree): DocTreeResponse {
  return result;
}

function toDocContentResponse(result: DocContent): DocContentResponse {
  return {
    path: result.path,
    content: result.content,
    name: result.name,
  };
}

function handleDocsError(err: Error, res: Response<ErrorResponse>): void {
  if (err instanceof z.ZodError) {
    const message = err.issues.map((i) => i.message).join(', ');
    res.status(400).json({ error: message, code: 'VALIDATION_ERROR' });
    return;
  }

  if (err instanceof ProjectNotFoundError) {
    res.status(404).json({ error: err.message, code: 'PROJECT_NOT_FOUND' });
    return;
  }

  if (err instanceof DocsNotFoundError) {
    res.status(404).json({ error: err.message, code: err.code });
    return;
  }

  if (err instanceof DocFileNotFoundError) {
    res.status(404).json({ error: err.message, code: err.code });
    return;
  }

  if (err instanceof DocAccessDeniedError) {
    res.status(403).json({ error: err.message, code: err.code });
    return;
  }

  console.error('Unexpected error in docs API:', err);
  res.status(500).json({ error: 'Internal server error' });
}

function asyncHandler<T>(
  fn: (req: Request, res: Response<T>, next: NextFunction) => Promise<void>
) {
  return (req: Request, res: Response<T>, next: NextFunction): void => {
    Promise.resolve(fn(req, res, next)).catch((err) => {
      handleDocsError(err as Error, res as Response<ErrorResponse>);
    });
  };
}

// ============================================================================
// Routes
// ============================================================================

/**
 * GET /api/projects/:projectId/docs
 * Get the documentation tree for a project
 */
router.get(
  '/:projectId/docs',
  asyncHandler<DocTreeResponse | ErrorResponse>(async (req, res) => {
    const { projectId } = projectIdSchema.parse(req.params);

    // Get project to find repo path
    const project = await getProjectById(projectId);

    // Get docs tree
    const result = await docsService.getDocTree(project.repoPath);

    res.json(toDocTreeResponse(result));
  })
);

/**
 * GET /api/projects/:projectId/docs/*
 * Get the content of a specific document
 */
router.get(
  '/:projectId/docs/*',
  asyncHandler<DocContentResponse | ErrorResponse>(async (req, res) => {
    const { projectId } = projectIdSchema.parse(req.params);

    // Get the doc path from the wildcard
    const docPath = req.params[0];

    if (!docPath) {
      res.status(400).json({ error: 'Document path is required', code: 'MISSING_PATH' });
      return;
    }

    // Get project to find repo path
    const project = await getProjectById(projectId);

    // Get doc content
    const result = await docsService.getDocContent(project.repoPath, docPath);

    res.json(toDocContentResponse(result));
  })
);

export default router;
