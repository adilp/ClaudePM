import { PrismaClient } from '../generated/prisma/index.js';

// Singleton pattern for Prisma Client
// Prevents multiple instances during development with hot reload

declare global {
  var __prisma: PrismaClient | undefined;
}

// Queries to filter from logs (high-frequency polling queries)
const FILTERED_QUERY_PATTERNS = [
  // Session status polling (runs every second)
  /SELECT.*"sessions".*WHERE.*"status"/i,
  // Notification polling
  /SELECT.*"notifications"/i,
];

function shouldLogQuery(query: string): boolean {
  return !FILTERED_QUERY_PATTERNS.some(pattern => pattern.test(query));
}

function createPrismaClient(): PrismaClient {
  const isDev = process.env.NODE_ENV === 'development';

  const client = new PrismaClient({
    log: isDev
      ? [
          { level: 'query', emit: 'event' },
          { level: 'info', emit: 'stdout' },
          { level: 'warn', emit: 'stdout' },
          { level: 'error', emit: 'stdout' },
        ]
      : ['error'],
  });

  // In development, filter out noisy polling queries
  if (isDev) {
    client.$on('query', (e) => {
      if (shouldLogQuery(e.query)) {
        console.log(`prisma:query ${e.query}`);
      }
    });
  }

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
