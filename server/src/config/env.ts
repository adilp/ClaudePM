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
});

const parsed = envSchema.safeParse(process.env);

if (!parsed.success) {
  console.error('Invalid environment variables:', parsed.error.flatten().fieldErrors);
  process.exit(1);
}

export const env = parsed.data;
