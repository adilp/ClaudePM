/**
 * tmux API Router
 * Endpoints for discovering and managing tmux sessions
 */

import { Router, Response } from 'express';
import { listSessions, listWindows, listPanes } from '../services/tmux.js';

const router = Router();

interface TmuxSessionResponse {
  name: string;
  windows: number;
  created: string;
  attached: boolean;
}

interface TmuxSessionDetailResponse extends TmuxSessionResponse {
  windows_detail: Array<{
    index: number;
    name: string;
    active: boolean;
    panes: Array<{
      id: string;
      index: number;
      active: boolean;
      pid: number;
    }>;
  }>;
}

interface ErrorResponse {
  error: string;
}

/**
 * GET /api/tmux/sessions
 * List all tmux sessions on the system
 */
router.get('/sessions', (_req, res: Response<TmuxSessionResponse[] | ErrorResponse>): void => {
  void (async () => {
    try {
      const sessions = await listSessions();

      const response: TmuxSessionResponse[] = sessions.map((s) => ({
        name: s.name,
        windows: s.windows,
        created: s.created.toISOString(),
        attached: s.attached,
      }));

      res.json(response);
    } catch (err) {
      console.error('Failed to list tmux sessions:', err);
      res.status(500).json({ error: 'Failed to list tmux sessions' });
    }
  })();
});

/**
 * GET /api/tmux/sessions/:name
 * Get detailed info about a specific tmux session
 */
router.get('/sessions/:name', (req, res: Response<TmuxSessionDetailResponse | ErrorResponse>): void => {
  void (async () => {
    try {
      const { name } = req.params;
      const sessions = await listSessions();
      const session = sessions.find((s) => s.name === name);

      if (!session) {
        res.status(404).json({ error: `tmux session not found: ${name}` });
        return;
      }

      // Get windows for this session
      const windows = await listWindows(name);
      const windowsDetail = await Promise.all(
        windows.map(async (w) => {
          const panes = await listPanes(`${name}:${w.index}`);
          return {
            index: w.index,
            name: w.name,
            active: w.active,
            panes: panes.map((p) => ({
              id: p.id,
              index: p.index,
              active: p.active,
              pid: p.pid,
            })),
          };
        })
      );

      const response: TmuxSessionDetailResponse = {
        name: session.name,
        windows: session.windows,
        created: session.created.toISOString(),
        attached: session.attached,
        windows_detail: windowsDetail,
      };

      res.json(response);
    } catch (err) {
      console.error('Failed to get tmux session details:', err);
      res.status(500).json({ error: 'Failed to get tmux session details' });
    }
  })();
});

export default router;
