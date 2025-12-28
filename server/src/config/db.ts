import { PrismaClient } from '../generated/prisma/index.js';

// Singleton pattern for Prisma Client
// Prevents multiple instances during development with hot reload

declare global {
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

process.on('beforeExit', () => void disconnect());
process.on('SIGINT', () => {
  void disconnect().then(() => process.exit(0));
});
process.on('SIGTERM', () => {
  void disconnect().then(() => process.exit(0));
});

export { PrismaClient };
