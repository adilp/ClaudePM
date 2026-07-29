/**
 * Agents API Router
 * Read-only snapshot of live workmux worktree sessions.
 */

import { Router, Request, Response } from 'express';
import { workmuxBridge } from '../services/workmux-bridge.js';
import type { Agent } from '../services/workmux-bridge-types.js';

const router = Router();

interface AgentsResponse {
  agents: Agent[];
}

/**
 * GET /api/agents
 * Current list of workmux agents (the same set pushed over WebSocket as
 * `agent:snapshot` / `agent:update` / `agent:removed`).
 */
router.get('/', (_req: Request, res: Response<AgentsResponse>): void => {
  res.json({ agents: workmuxBridge.list() });
});

export default router;
