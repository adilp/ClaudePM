import { Request, Response, NextFunction } from 'express';
import { env } from '../config/env.js';

/**
 * Check if a request originates from localhost.
 * Supports IPv4 (127.0.0.1), IPv6 (::1), and IPv4-mapped IPv6 (::ffff:127.0.0.1).
 */
export function isLocalhost(req: Request): boolean {
  const ip = req.ip ?? req.socket.remoteAddress ?? '';
  return (
    ip === '127.0.0.1' ||
    ip === '::1' ||
    ip === '::ffff:127.0.0.1' ||
    ip.startsWith('127.') ||
    ip === 'localhost'
  );
}

/**
 * Check if a remote address string is localhost.
 * Used for WebSocket connections.
 */
export function isLocalhostAddress(address: string | undefined): boolean {
  if (!address) return false;
  return (
    address === '127.0.0.1' ||
    address === '::1' ||
    address === '::ffff:127.0.0.1' ||
    address.startsWith('127.') ||
    address === 'localhost'
  );
}

/**
 * API key authentication middleware.
 *
 * Behavior:
 * - If API_KEY is not configured: auth is skipped (development mode)
 * - If request is from localhost: auth is skipped (web app support)
 * - Otherwise: requires valid X-API-Key header (remote/native app access)
 */
export function apiKeyAuth(req: Request, res: Response, next: NextFunction): void {
  // If no API key is configured, skip auth (development mode)
  if (!env.API_KEY) {
    next();
    return;
  }

  // Skip auth for localhost requests (web app on same machine)
  if (isLocalhost(req)) {
    next();
    return;
  }

  // Require API key for remote requests
  const apiKey = req.headers['x-api-key'];
  if (!apiKey || apiKey !== env.API_KEY) {
    res.status(401).json({
      error: 'Unauthorized',
      message: 'Missing or invalid API key',
    });
    return;
  }

  next();
}
