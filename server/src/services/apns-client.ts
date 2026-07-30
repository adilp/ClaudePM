import http2 from 'node:http2';
import { readFileSync } from 'node:fs';
import jwt from 'jsonwebtoken';
import { env } from '../config/env.js';

/**
 * Minimal token-based (.p8 / JWT) APNs client built on Node's native http2.
 *
 * We hand-roll this instead of pulling in `node-apn`/`@parse/node-apn` (both
 * effectively unmaintained) because the surface we need is tiny: sign an ES256
 * provider token, POST a JSON payload to `/3/device/<token>` over HTTP/2, and
 * read back the status + `reason`.
 *
 * Scope (ticket #4): proves the pipe with standard alert pushes. Live Activity
 * pushes ride the exact same auth/transport — they only differ in the target
 * token, the `apns-push-type: liveactivity` header, and the `aps` body shape —
 * so this client already accepts an arbitrary `apns-push-type` for later use.
 */

const APNS_HOSTS = {
  sandbox: 'https://api.sandbox.push.apple.com',
  production: 'https://api.push.apple.com',
} as const;

// Apple rejects provider tokens older than 1h and rejects refreshing one more
// than once per 20min. Refreshing every ~30min sits safely inside both bounds.
const TOKEN_TTL_MS = 30 * 60 * 1000;

export type ApnsPushType = 'alert' | 'background' | 'liveactivity' | 'voip';

export interface ApnsSendResult {
  /** true iff Apple returned HTTP 200 for this device token. */
  ok: boolean;
  /** HTTP status Apple returned (0 if the request never completed). */
  status: number;
  /** Apple's `reason` string on failure (e.g. 'BadDeviceToken', 'Unregistered'). */
  reason?: string | undefined;
  /**
   * true when Apple says this token is permanently invalid and should be
   * pruned from the DB (410 Unregistered, or 400 BadDeviceToken).
   */
  shouldPrune: boolean;
}

export interface ApnsPayload {
  /** The `aps` dictionary and any custom top-level keys, sent as-is. */
  [key: string]: unknown;
}

class ApnsClient {
  private session: http2.ClientHttp2Session | null = null;
  private cachedToken: { jwt: string; issuedAt: number } | null = null;
  private privateKey: string | null = null;

  /** True only when every APNs env var needed to send is present. */
  isConfigured(): boolean {
    return Boolean(env.APNS_KEY_ID && env.APNS_TEAM_ID && env.APNS_KEY_PATH);
  }

  /** Human-readable reason we can't send, for logging / the test endpoint. */
  configError(): string | null {
    if (env.APNS_KEY_ID && env.APNS_TEAM_ID && env.APNS_KEY_PATH) return null;
    const missing = [
      !env.APNS_KEY_ID && 'APNS_KEY_ID',
      !env.APNS_TEAM_ID && 'APNS_TEAM_ID',
      !env.APNS_KEY_PATH && 'APNS_KEY_PATH',
    ].filter(Boolean);
    return `APNs not configured — missing ${missing.join(', ')}`;
  }

  private loadPrivateKey(): string {
    if (this.privateKey) return this.privateKey;
    // The .p8 downloaded from Apple is already a PKCS#8 PEM.
    this.privateKey = readFileSync(env.APNS_KEY_PATH as string, 'utf8');
    return this.privateKey;
  }

  /** Sign (or reuse a cached) ES256 provider JWT. */
  private providerToken(): string {
    const now = Date.now();
    if (this.cachedToken && now - this.cachedToken.issuedAt < TOKEN_TTL_MS) {
      return this.cachedToken.jwt;
    }

    const signed = jwt.sign(
      { iss: env.APNS_TEAM_ID, iat: Math.floor(now / 1000) },
      this.loadPrivateKey(),
      { algorithm: 'ES256', header: { alg: 'ES256', kid: env.APNS_KEY_ID as string } }
    );

    this.cachedToken = { jwt: signed, issuedAt: now };
    return signed;
  }

  private getSession(): http2.ClientHttp2Session {
    if (this.session && !this.session.closed && !this.session.destroyed) {
      return this.session;
    }
    const host = APNS_HOSTS[env.APNS_ENVIRONMENT];
    const session = http2.connect(host);
    // Never let a transport-level error crash the process; the next send
    // recreates the session.
    session.on('error', (err) => {
      console.error('[APNs] http2 session error:', err.message);
    });
    this.session = session;
    return session;
  }

  /**
   * Send one push to one device token. Never throws — transport failures are
   * returned as a non-ok result so callers can keep iterating.
   */
  async send(
    deviceToken: string,
    payload: ApnsPayload,
    opts: { pushType?: ApnsPushType; priority?: 5 | 10; topic?: string } = {}
  ): Promise<ApnsSendResult> {
    const configError = this.configError();
    if (configError) return { ok: false, status: 0, reason: configError, shouldPrune: false };

    const pushType = opts.pushType ?? 'alert';
    // Live Activity pushes address the topic `<bundle>.push-type.liveactivity`.
    const topic =
      opts.topic ??
      (pushType === 'liveactivity'
        ? `${env.APNS_BUNDLE_ID}.push-type.liveactivity`
        : env.APNS_BUNDLE_ID);

    const body = Buffer.from(JSON.stringify(payload));

    return new Promise<ApnsSendResult>((resolve) => {
      let session: http2.ClientHttp2Session;
      try {
        session = this.getSession();
      } catch (err) {
        resolve({
          ok: false,
          status: 0,
          reason: err instanceof Error ? err.message : 'connect failed',
          shouldPrune: false,
        });
        return;
      }

      const req = session.request({
        ':method': 'POST',
        ':path': `/3/device/${deviceToken}`,
        authorization: `bearer ${this.providerToken()}`,
        'apns-topic': topic,
        'apns-push-type': pushType,
        'apns-priority': String(opts.priority ?? 10),
        'apns-expiration': '0',
        'content-type': 'application/json',
        'content-length': String(body.length),
      });

      let status = 0;
      const chunks: Buffer[] = [];

      req.on('response', (headers) => {
        status = Number(headers[':status'] ?? 0);
      });
      req.on('data', (chunk: Buffer) => chunks.push(chunk));
      req.on('error', (err) => {
        resolve({
          ok: false,
          status: 0,
          reason: err instanceof Error ? err.message : 'request error',
          shouldPrune: false,
        });
      });
      req.on('end', () => {
        if (status === 200) {
          resolve({ ok: true, status, shouldPrune: false });
          return;
        }
        let reason: string | undefined;
        try {
          const parsed = JSON.parse(Buffer.concat(chunks).toString('utf8'));
          reason = parsed?.reason;
        } catch {
          /* non-JSON body — leave reason undefined */
        }
        const shouldPrune =
          status === 410 || reason === 'Unregistered' || reason === 'BadDeviceToken';
        resolve({ ok: false, status, reason, shouldPrune });
      });

      req.end(body);
    });
  }

  /** Close the persistent http2 session (used on shutdown). */
  close(): void {
    if (this.session && !this.session.destroyed) {
      this.session.close();
    }
    this.session = null;
  }
}

export const apnsClient = new ApnsClient();
