import { Router, Request, Response } from 'express';

const router = Router();

interface HealthResponse {
  status: 'ok' | 'error';
  timestamp: string;
  version: string;
  uptime: number;
}

router.get('/health', (_req: Request, res: Response<HealthResponse>): void => {
  res.json({
    status: 'ok',
    timestamp: new Date().toISOString(),
    version: process.env.npm_package_version ?? '0.1.0',
    uptime: process.uptime(),
  });
});

export default router;
