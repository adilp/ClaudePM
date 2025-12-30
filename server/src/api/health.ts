import { Router, Request, Response } from 'express';
import { exec } from 'child_process';
import { promisify } from 'util';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { prisma } from '../config/db.js';

const execAsync = promisify(exec);
const router = Router();

// Server start time for uptime calculation
const startTime = Date.now();

// Cache tmux availability check (doesn't change during runtime)
let tmuxStatusCache: 'available' | 'unavailable' | null = null;

// Get package.json version at startup
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const packageJsonPath = join(__dirname, '../../package.json');
let packageVersion = '0.1.0';
try {
  const pkg = JSON.parse(readFileSync(packageJsonPath, 'utf-8')) as { version?: string };
  packageVersion = pkg.version ?? '0.1.0';
} catch {
  // Fall back to default version if package.json can't be read
}

interface HealthResponse {
  status: 'healthy' | 'degraded';
  uptime: number;
  version: string;
  database: 'connected' | 'disconnected';
  tmux: 'available' | 'unavailable';
  timestamp: string;
}

async function checkDatabaseConnection(): Promise<'connected' | 'disconnected'> {
  try {
    await prisma.$queryRaw`SELECT 1`;
    return 'connected';
  } catch {
    return 'disconnected';
  }
}

async function checkTmuxAvailability(): Promise<'available' | 'unavailable'> {
  // Return cached result if available
  if (tmuxStatusCache !== null) {
    return tmuxStatusCache;
  }

  try {
    await execAsync('which tmux');
    tmuxStatusCache = 'available';
  } catch {
    tmuxStatusCache = 'unavailable';
  }

  return tmuxStatusCache;
}

router.get('/health', (_req: Request, res: Response<HealthResponse>): void => {
  void (async (): Promise<void> => {
    const [dbStatus, tmuxStatus] = await Promise.all([
      checkDatabaseConnection(),
      checkTmuxAvailability(),
    ]);

    const status = dbStatus === 'connected' ? 'healthy' : 'degraded';

    res.json({
      status,
      uptime: Math.floor((Date.now() - startTime) / 1000),
      version: packageVersion,
      database: dbStatus,
      tmux: tmuxStatus,
      timestamp: new Date().toISOString(),
    });
  })();
});

export default router;
