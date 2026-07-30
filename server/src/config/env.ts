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
});

const parsed = envSchema.safeParse(process.env);

if (!parsed.success) {
  console.error('Invalid environment variables:', parsed.error.flatten().fieldErrors);
  process.exit(1);
}

export const env = parsed.data;
