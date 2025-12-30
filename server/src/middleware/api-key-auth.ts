import { Request, Response, NextFunction } from 'express';
import { env } from '../config/env.js';

/**
 * API key authentication middleware.
 * Requires X-API-Key header matching env.API_KEY for protected routes.
 * Apply this middleware to specific routes that require authentication (e.g., native app endpoints).
 */
export function apiKeyAuth(_req: Request, res: Response, next: NextFunction): void {
  // If no API key is configured, skip auth (development mode)
  if (!env.API_KEY) {
    next();
    return;
  }

  const apiKey = _req.headers['x-api-key'];
  if (!apiKey || apiKey !== env.API_KEY) {
    res.status(401).json({
      error: 'Unauthorized',
      message: 'Missing or invalid API key',
    });
    return;
  }

  next();
}
