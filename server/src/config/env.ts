import { config } from 'dotenv';
import { z } from 'zod';

config();

const envSchema = z.object({
  PORT: z.coerce.number().default(3000),
  HOST: z.string().default('0.0.0.0'),
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
  DATABASE_URL: z.string().default('postgresql://localhost:5432/claude_session_manager'),
  HANDOFF_THRESHOLD_PERCENT: z.coerce.number().min(5).max(50).default(20),
  LOG_LEVEL: z.enum(['debug', 'info', 'warn', 'error']).default('info'),
  API_KEY: z.string().min(32).optional(),

  // WorkmuxBridge: how often to poll workmux agent state, and where it lives.
  WORKMUX_POLL_MS: z.coerce.number().min(200).default(1000),
  WORKMUX_AGENTS_DIR: z.string().optional(),

  // APNs (Apple Push Notification service) for iOS push / Live Activity updates.
  // All three of KEY_ID / TEAM_ID / KEY_PATH must be set for push to be enabled;
  // if any is missing the server still boots and simply skips sending.
  APNS_KEY_ID: z.string().optional(),
  APNS_TEAM_ID: z.string().optional(),
  APNS_KEY_PATH: z.string().optional(), // path to the AuthKey_<KEYID>.p8 file
  APNS_BUNDLE_ID: z.string().default('com.claudepm.ios'),
  APNS_ENVIRONMENT: z.enum(['sandbox', 'production']).default('sandbox'),

  // Live Activity content pushes (server -> APNs -> lock screen / Dynamic Island).
  // The bridge's agent stream can flip many times a second; these knobs keep the
  // push rate inside APNs' Live-Activity budget. See live-activity-push.ts.
  //  - DEBOUNCE_MS: trailing window that coalesces a burst of agent changes into
  //    one push (bridge polls ~1s, so ~1s coalesces within-poll bursts).
  //  - MAX_PER_HOUR: sliding-window ceiling on pushes; over budget we drop and
  //    let the next real change retry.
  //  - STALE_MS: how long after a push the system may mark the activity stale
  //    (dimmed) if no fresher push arrives — a liveness signal, not a timer.
  //  - MAX_ROWS: rows shown on the lock screen / expanded island. MUST match the
  //    iOS AgentLiveActivityManager.maxRows (3) or counts and rows disagree.
  LIVE_ACTIVITY_DEBOUNCE_MS: z.coerce.number().min(0).default(1000),
  LIVE_ACTIVITY_MAX_PER_HOUR: z.coerce.number().min(1).default(200),
  LIVE_ACTIVITY_STALE_MS: z.coerce.number().min(0).default(5 * 60 * 1000),
  LIVE_ACTIVITY_MAX_ROWS: z.coerce.number().min(1).default(3),
});

const parsed = envSchema.safeParse(process.env);

if (!parsed.success) {
  console.error('Invalid environment variables:', parsed.error.flatten().fieldErrors);
  process.exit(1);
}

export const env = parsed.data;
