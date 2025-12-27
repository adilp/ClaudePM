import { PrismaClient } from '../generated/prisma/index.js';

// Singleton pattern for Prisma Client
// Prevents multiple instances during development with hot reload

declare global {
  // eslint-disable-next-line no-var
  var __prisma: PrismaClient | undefined;
}

function createPrismaClient(): PrismaClient {
  const client = new PrismaClient({
    log:
      process.env.NODE_ENV === 'development'
        ? ['query', 'info', 'warn', 'error']
        : ['error'],
  });

  return client;
}

// Use global variable in development to prevent multiple instances
export const prisma = globalThis.__prisma ?? createPrismaClient();

if (process.env.NODE_ENV !== 'production') {
  globalThis.__prisma = prisma;
}

// Graceful shutdown handling
async function disconnect(): Promise<void> {
  await prisma.$disconnect();
}

process.on('beforeExit', disconnect);
process.on('SIGINT', async () => {
  await disconnect();
  process.exit(0);
});
process.on('SIGTERM', async () => {
  await disconnect();
  process.exit(0);
});

export { PrismaClient };
