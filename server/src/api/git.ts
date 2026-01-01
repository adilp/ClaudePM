/**
 * Git API Routes
 * Endpoints for git operations on project repositories
 */

import { Router, Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import { gitService } from '../services/git.js';
import {
  NotAGitRepositoryError,
  GitCommandError,
  GitTimeoutError,
  DiffResult,
  StatusResult,
  BranchInfo,
} from '../services/git-types.js';
import { getProjectById, ProjectNotFoundError } from '../services/projects.js';

const router = Router();

// ============================================================================
// Schemas
// ============================================================================

const projectIdSchema = z.object({
  projectId: z.string().uuid('Invalid project ID'),
});

const diffQuerySchema = z.object({
  base_branch: z.string().optional(),
});

const stageFilesSchema = z.object({
  files: z.array(z.string()).min(1, 'At least one file is required'),
});

const unstageFilesSchema = z.object({
  files: z.array(z.string()).min(1, 'At least one file is required'),
});

const commitSchema = z.object({
  message: z.string().min(1, 'Commit message is required'),
});

const pushSchema = z.object({
  set_upstream: z.boolean().optional(),
});

// ============================================================================
// Response Types
// ============================================================================

interface DiffResponse {
  files: Array<{
    file_path: string;
    old_file_path?: string;
    change_type: 'added' | 'modified' | 'deleted' | 'renamed';
    hunks: Array<{
      old_start: number;
      old_count: number;
      new_start: number;
      new_count: number;
      content: string;
    }>;
  }>;
  truncated: boolean;
  total_lines: number;
}

interface StatusResponse {
  branch: string | null;
  upstream: string | null;
  detached: boolean;
  staged: Array<{ path: string; status: string }>;
  unstaged: Array<{ path: string; status: string }>;
  untracked: string[];
  clean: boolean;
  ahead: number;
  behind: number;
}

interface BranchResponse {
  name: string;
  remote: string | null;
  is_main_branch: boolean;
  recent_commits: Array<{
    hash: string;
    message: string;
    date: string;
  }>;
}

interface ErrorResponse {
  error: string;
  code?: string;
}

interface StageResponse {
  success: boolean;
  files_staged: string[];
}

interface UnstageResponse {
  success: boolean;
  files_unstaged: string[];
}

interface CommitResponse {
  success: boolean;
  hash: string;
  message: string;
}

interface PushResponse {
  success: boolean;
  branch: string;
}

// ============================================================================
// Helpers
// ============================================================================

function toDiffResponse(result: DiffResult): DiffResponse {
  return {
    files: result.files.map((file) => {
      const response: DiffResponse['files'][0] = {
        file_path: file.filePath,
        change_type: file.changeType,
        hunks: file.hunks.map((hunk) => ({
          old_start: hunk.oldStart,
          old_count: hunk.oldCount,
          new_start: hunk.newStart,
          new_count: hunk.newCount,
          content: hunk.content,
        })),
      };
      if (file.oldFilePath) {
        response.old_file_path = file.oldFilePath;
      }
      return response;
    }),
    truncated: result.truncated,
    total_lines: result.totalLines,
  };
}

function toStatusResponse(result: StatusResult): StatusResponse {
  return {
    branch: result.branch,
    upstream: result.upstream,
    detached: result.detached,
    staged: result.staged.map((f) => ({ path: f.path, status: f.status })),
    unstaged: result.unstaged.map((f) => ({ path: f.path, status: f.status })),
    untracked: result.untracked,
    clean: result.clean,
    ahead: result.ahead,
    behind: result.behind,
  };
}

function toBranchResponse(result: BranchInfo): BranchResponse {
  return {
    name: result.name,
    remote: result.remote,
    is_main_branch: result.isMainBranch,
    recent_commits: result.recentCommits.map((c) => ({
      hash: c.hash,
      message: c.message,
      date: c.date.toISOString(),
    })),
  };
}

function handleGitError(err: Error, res: Response<ErrorResponse>): void {
  if (err instanceof z.ZodError) {
    const message = err.issues.map((i) => i.message).join(', ');
    res.status(400).json({ error: message, code: 'VALIDATION_ERROR' });
    return;
  }

  if (err instanceof ProjectNotFoundError) {
    res.status(404).json({ error: err.message, code: 'PROJECT_NOT_FOUND' });
    return;
  }

  if (err instanceof NotAGitRepositoryError) {
    res.status(400).json({ error: err.message, code: err.code });
    return;
  }

  if (err instanceof GitTimeoutError) {
    res.status(504).json({ error: err.message, code: err.code });
    return;
  }

  if (err instanceof GitCommandError) {
    res.status(500).json({ error: err.message, code: err.code });
    return;
  }

  console.error('Unexpected error in git API:', err);
  res.status(500).json({ error: 'Internal server error' });
}

function asyncHandler<T>(
  fn: (req: Request, res: Response<T>, next: NextFunction) => Promise<void>
) {
  return (req: Request, res: Response<T>, next: NextFunction): void => {
    Promise.resolve(fn(req, res, next)).catch((err) => {
      handleGitError(err as Error, res as Response<ErrorResponse>);
    });
  };
}

// ============================================================================
// Routes
// ============================================================================

/**
 * GET /api/projects/:projectId/git/diff
 * Get diff for the project repository
 */
router.get(
  '/:projectId/git/diff',
  asyncHandler<DiffResponse | ErrorResponse>(async (req, res) => {
    const { projectId } = projectIdSchema.parse(req.params);
    const query = diffQuerySchema.parse(req.query);

    // Get project to find repo path
    const project = await getProjectById(projectId);

    // Get diff
    const options: { baseBranch?: string } = {};
    if (query.base_branch) {
      options.baseBranch = query.base_branch;
    }
    const result = await gitService.getDiff(project.repoPath, options);

    res.json(toDiffResponse(result));
  })
);

/**
 * GET /api/projects/:projectId/git/status
 * Get git status for the project repository
 */
router.get(
  '/:projectId/git/status',
  asyncHandler<StatusResponse | ErrorResponse>(async (req, res) => {
    const { projectId } = projectIdSchema.parse(req.params);

    // Get project to find repo path
    const project = await getProjectById(projectId);

    // Get status
    const result = await gitService.getStatus(project.repoPath);

    res.json(toStatusResponse(result));
  })
);

/**
 * GET /api/projects/:projectId/git/branch
 * Get branch info for the project repository
 */
router.get(
  '/:projectId/git/branch',
  asyncHandler<BranchResponse | ErrorResponse>(async (req, res) => {
    const { projectId } = projectIdSchema.parse(req.params);

    // Get project to find repo path
    const project = await getProjectById(projectId);

    // Get branch info
    const result = await gitService.getBranchInfo(project.repoPath);

    res.json(toBranchResponse(result));
  })
);

/**
 * POST /api/projects/:projectId/git/stage
 * Stage specific files
 */
router.post(
  '/:projectId/git/stage',
  asyncHandler<StageResponse | ErrorResponse>(async (req, res) => {
    const { projectId } = projectIdSchema.parse(req.params);
    const { files } = stageFilesSchema.parse(req.body);

    // Get project to find repo path
    const project = await getProjectById(projectId);

    // Stage files
    await gitService.stageFiles(project.repoPath, files);

    res.json({
      success: true,
      files_staged: files,
    });
  })
);

/**
 * POST /api/projects/:projectId/git/unstage
 * Unstage specific files
 */
router.post(
  '/:projectId/git/unstage',
  asyncHandler<UnstageResponse | ErrorResponse>(async (req, res) => {
    const { projectId } = projectIdSchema.parse(req.params);
    const { files } = unstageFilesSchema.parse(req.body);

    // Get project to find repo path
    const project = await getProjectById(projectId);

    // Unstage files
    await gitService.unstageFiles(project.repoPath, files);

    res.json({
      success: true,
      files_unstaged: files,
    });
  })
);

/**
 * POST /api/projects/:projectId/git/stage-all
 * Stage all changes
 */
router.post(
  '/:projectId/git/stage-all',
  asyncHandler<StageResponse | ErrorResponse>(async (req, res) => {
    const { projectId } = projectIdSchema.parse(req.params);

    // Get project to find repo path
    const project = await getProjectById(projectId);

    // Stage all
    await gitService.stageAll(project.repoPath);

    res.json({
      success: true,
      files_staged: ['all'],
    });
  })
);

/**
 * POST /api/projects/:projectId/git/unstage-all
 * Unstage all staged changes
 */
router.post(
  '/:projectId/git/unstage-all',
  asyncHandler<UnstageResponse | ErrorResponse>(async (req, res) => {
    const { projectId } = projectIdSchema.parse(req.params);

    // Get project to find repo path
    const project = await getProjectById(projectId);

    // Unstage all
    await gitService.unstageAll(project.repoPath);

    res.json({
      success: true,
      files_unstaged: ['all'],
    });
  })
);

/**
 * POST /api/projects/:projectId/git/commit
 * Commit staged changes
 */
router.post(
  '/:projectId/git/commit',
  asyncHandler<CommitResponse | ErrorResponse>(async (req, res) => {
    const { projectId } = projectIdSchema.parse(req.params);
    const { message } = commitSchema.parse(req.body);

    // Get project to find repo path
    const project = await getProjectById(projectId);

    // Commit
    const result = await gitService.commit(project.repoPath, message);

    res.json({
      success: true,
      hash: result.hash,
      message: result.message,
    });
  })
);

/**
 * POST /api/projects/:projectId/git/push
 * Push to remote
 */
router.post(
  '/:projectId/git/push',
  asyncHandler<PushResponse | ErrorResponse>(async (req, res) => {
    const { projectId } = projectIdSchema.parse(req.params);
    const body = pushSchema.parse(req.body ?? {});

    // Get project to find repo path
    const project = await getProjectById(projectId);

    // Push
    const options: { setUpstream?: boolean } = {};
    if (body.set_upstream !== undefined) {
      options.setUpstream = body.set_upstream;
    }
    const result = await gitService.push(project.repoPath, options);

    res.json({
      success: true,
      branch: result.branch,
    });
  })
);

export default router;
