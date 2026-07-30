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

/**
 * Pure authorization decision for the mutating workmux command endpoints.
 *
 * Unlike {@link apiKeyAuth} (which is lenient — no key configured means auth is
 * skipped), command auth is **fail-closed**: with no `API_KEY` configured the
 * destructive endpoints are disabled outright. When a key IS configured, remote
 * callers must present it; same-machine (localhost) callers — the desktop app,
 * local testing — are trusted.
 */
export function evaluateCommandAuth(params: {
  apiKeyConfigured: boolean;
  localhost: boolean;
  providedKey: string | undefined;
  expectedKey: string | undefined;
}): { authorized: boolean; reason?: 'not_configured' | 'invalid_key' } {
  if (!params.apiKeyConfigured) return { authorized: false, reason: 'not_configured' };
  if (params.localhost) return { authorized: true };
  if (!params.providedKey || params.providedKey !== params.expectedKey) {
    return { authorized: false, reason: 'invalid_key' };
  }
  return { authorized: true };
}

/**
 * Stricter auth for state-changing command endpoints (merge/remove/add).
 * Fail-closed: refuses with 401 unless `API_KEY` is configured. See
 * {@link evaluateCommandAuth}.
 */
export function requireApiKey(req: Request, res: Response, next: NextFunction): void {
  const providedKey = req.headers['x-api-key'];
  const result = evaluateCommandAuth({
    apiKeyConfigured: Boolean(env.API_KEY),
    localhost: isLocalhost(req),
    providedKey: typeof providedKey === 'string' ? providedKey : undefined,
    expectedKey: env.API_KEY,
  });

  if (result.authorized) {
    next();
    return;
  }

  res.status(401).json({
    error: 'Unauthorized',
    message:
      result.reason === 'not_configured'
        ? 'Command endpoints are disabled: set API_KEY on the server to enable workmux commands'
        : 'Missing or invalid API key',
  });
}
