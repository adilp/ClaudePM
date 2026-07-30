/**
 * Agents API Router
 *
 * Reads: a snapshot of live workmux worktree sessions + the saved task library.
 * Commands: whitelisted workmux lifecycle actions (merge / remove / add), each
 * gated behind {@link requireApiKey} (fail-closed — disabled without `API_KEY`).
 *
 * The mutating routes are thin: validate with Zod, delegate to
 * `workmuxExecutor`, and map its typed errors to HTTP statuses. The command's
 * real captured stdout/stderr is returned to the app on both success and
 * failure so the UI can show workmux's own words.
 */

import { Router, Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import { workmuxBridge } from '../services/workmux-bridge.js';
import type { Agent } from '../services/workmux-bridge-types.js';
import { workmuxExecutor } from '../services/workmux-executor.js';
import {
  AgentNotFoundError,
  NoProjectAgentError,
  WorkmuxCommandError,
  WorkmuxSpawnError,
  WorkmuxTimeoutError,
  WorktreeDirtyError,
  type WorkmuxCommandResult,
} from '../services/workmux-executor-types.js';
import { requireApiKey } from '../middleware/api-key-auth.js';

const router = Router();

// ============================================================================
// Schemas
// ============================================================================

const agentIdParamSchema = z.object({
  id: z.string().min(1, 'Agent id is required'),
});

const removeBodySchema = z.object({
  force: z.boolean().optional(),
});

const addBodySchema = z.object({
  project: z.string().min(1, 'project is required'),
  // Worktree/branch name — keep it to safe branch-ish characters.
  name: z
    .string()
    .min(1, 'name is required')
    .regex(/^[A-Za-z0-9._/-]+$/, 'name may only contain letters, numbers, and . _ / -'),
  task: z.string().max(2000).optional(),
});

// ============================================================================
// Response Types
// ============================================================================

interface AgentsResponse {
  agents: Agent[];
}

interface TaskPresetsResponse {
  presets: string[];
}

interface CommandResponse {
  success: true;
  action: WorkmuxCommandResult['action'];
  workdir?: string;
  output: { stdout: string; stderr: string; exit_code: number };
}

interface ErrorResponse {
  error: string;
  code?: string;
  /** Set on a dirty-remove rejection so the app can offer a force retry. */
  dirty?: boolean;
  files?: string[];
  output?: { stdout: string; stderr: string; exit_code: number };
}

// ============================================================================
// Helpers
// ============================================================================

function toCommandResponse(result: WorkmuxCommandResult): CommandResponse {
  return {
    success: true,
    action: result.action,
    ...(result.workdir ? { workdir: result.workdir } : {}),
    output: { stdout: result.stdout, stderr: result.stderr, exit_code: result.exitCode },
  };
}

function handleAgentError(err: Error, res: Response<ErrorResponse>): void {
  if (err instanceof z.ZodError) {
    res.status(400).json({
      error: err.issues.map((i) => i.message).join(', '),
      code: 'VALIDATION_ERROR',
    });
    return;
  }

  if (err instanceof AgentNotFoundError) {
    res.status(404).json({ error: err.message, code: err.code });
    return;
  }

  if (err instanceof NoProjectAgentError) {
    res.status(422).json({ error: err.message, code: err.code });
    return;
  }

  if (err instanceof WorktreeDirtyError) {
    res.status(409).json({
      error: err.message,
      code: err.code,
      dirty: true,
      files: err.files,
    });
    return;
  }

  if (err instanceof WorkmuxCommandError) {
    res.status(422).json({
      error: err.outcome.stderr.trim() || err.outcome.stdout.trim() || err.message,
      code: err.code,
      output: {
        stdout: err.outcome.stdout,
        stderr: err.outcome.stderr,
        exit_code: err.outcome.code,
      },
    });
    return;
  }

  if (err instanceof WorkmuxTimeoutError) {
    res.status(504).json({ error: err.message, code: err.code });
    return;
  }

  if (err instanceof WorkmuxSpawnError) {
    res.status(500).json({ error: err.message, code: err.code });
    return;
  }

  console.error('Unexpected error in agents API:', err);
  res.status(500).json({ error: 'Internal server error' });
}

function asyncHandler<T>(fn: (req: Request, res: Response<T>, next: NextFunction) => Promise<void>) {
  return (req: Request, res: Response<T>, next: NextFunction): void => {
    Promise.resolve(fn(req, res, next)).catch((err) => {
      handleAgentError(err as Error, res as Response<ErrorResponse>);
    });
  };
}

// ============================================================================
// Read routes (kept on the existing lenient auth)
// ============================================================================

/**
 * GET /api/agents
 * Current list of workmux agents (also pushed over WebSocket as
 * `agent:snapshot` / `agent:update` / `agent:removed`).
 */
router.get('/', (_req: Request, res: Response<AgentsResponse>): void => {
  res.json({ agents: workmuxBridge.list() });
});

/**
 * GET /api/agents/task-presets
 * The saved task library from `~/.config/claudepm/tasks.yaml` (empty if absent).
 */
router.get(
  '/task-presets',
  asyncHandler<TaskPresetsResponse>(async (_req, res) => {
    const presets = await workmuxExecutor.getTaskPresets();
    res.json({ presets });
  })
);

// ============================================================================
// Command routes (fail-closed auth — disabled unless API_KEY is set)
// ============================================================================

/**
 * POST /api/agents/add
 * Create a new agent in a project: `workmux add <name> [-p task] -b`.
 * Body: { project, name, task? }.
 */
router.post(
  '/add',
  requireApiKey,
  asyncHandler<CommandResponse | ErrorResponse>(async (req, res) => {
    const { project, name, task } = addBodySchema.parse(req.body ?? {});
    const result = await workmuxExecutor.add(project, name, task);
    res.json(toCommandResponse(result));
  })
);

/**
 * POST /api/agents/:id/merge
 * Merge the agent's worktree (`workmux merge`, no force). The id is the live
 * agent id and must be URL-encoded by the client (it contains `:` and `/`).
 */
router.post(
  '/:id/merge',
  requireApiKey,
  asyncHandler<CommandResponse | ErrorResponse>(async (req, res) => {
    const { id } = agentIdParamSchema.parse(req.params);
    const result = await workmuxExecutor.merge(id);
    res.json(toCommandResponse(result));
  })
);

/**
 * POST /api/agents/:id/remove
 * Remove the agent's worktree. Body: { force?: boolean }. A dirty worktree is
 * refused with 409 `WORKTREE_DIRTY` unless `force` is true.
 */
router.post(
  '/:id/remove',
  requireApiKey,
  asyncHandler<CommandResponse | ErrorResponse>(async (req, res) => {
    const { id } = agentIdParamSchema.parse(req.params);
    const { force } = removeBodySchema.parse(req.body ?? {});
    const result = await workmuxExecutor.remove(id, force);
    res.json(toCommandResponse(result));
  })
);

export default router;
