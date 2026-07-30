/**
 * Command-auth decision table for the mutating workmux endpoints.
 *
 * `evaluateCommandAuth` is the pure core of `requireApiKey` — fail-closed:
 * with no key configured the endpoints are disabled outright; with a key,
 * remote callers must present it, localhost is trusted.
 */

import { describe, test, expect } from 'vitest';
import { evaluateCommandAuth } from '../../src/middleware/api-key-auth.js';

const KEY = 'k'.repeat(32);

describe('evaluateCommandAuth', () => {
  test('fail-closed: no key configured is always unauthorized (even localhost)', () => {
    expect(
      evaluateCommandAuth({
        apiKeyConfigured: false,
        localhost: true,
        providedKey: undefined,
        expectedKey: undefined,
      })
    ).toEqual({ authorized: false, reason: 'not_configured' });
  });

  test('configured + localhost is trusted without a header', () => {
    expect(
      evaluateCommandAuth({
        apiKeyConfigured: true,
        localhost: true,
        providedKey: undefined,
        expectedKey: KEY,
      })
    ).toEqual({ authorized: true });
  });

  test('configured + remote + correct key is authorized', () => {
    expect(
      evaluateCommandAuth({
        apiKeyConfigured: true,
        localhost: false,
        providedKey: KEY,
        expectedKey: KEY,
      })
    ).toEqual({ authorized: true });
  });

  test('configured + remote + wrong key is rejected', () => {
    expect(
      evaluateCommandAuth({
        apiKeyConfigured: true,
        localhost: false,
        providedKey: 'wrong',
        expectedKey: KEY,
      })
    ).toEqual({ authorized: false, reason: 'invalid_key' });
  });

  test('configured + remote + missing key is rejected', () => {
    expect(
      evaluateCommandAuth({
        apiKeyConfigured: true,
        localhost: false,
        providedKey: undefined,
        expectedKey: KEY,
      })
    ).toEqual({ authorized: false, reason: 'invalid_key' });
  });
});
