import { Pool } from 'pg';
import { PrismaClient } from '@/prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import { readReplicas } from '@prisma/extension-read-replicas';
import { loadEnv } from '@/shared/config/load-env';

loadEnv();

const DATABASE_URL = process.env.DATABASE_URL;
const REPLICA_DATABASE_URL = process.env.DATABASE_REPLICA_URL;

if (!DATABASE_URL) {
  throw new Error('DATABASE_URL is not defined in environment variables');
}

if (!REPLICA_DATABASE_URL) {
  throw new Error(
    'DATABASE_REPLICA_URL is not defined in environment variables',
  );
}

// Export for other consumers if needed
export { DATABASE_URL, REPLICA_DATABASE_URL };

type PrismaClientType = ReturnType<typeof createPrisma>;

declare global {
  var prisma: PrismaClientType | undefined;
}

function createPrisma() {
  console.log('PrismaProvider: Creating Prisma Client...');
  console.log(`� Connecting to DB...`, DATABASE_URL, REPLICA_DATABASE_URL); // Generic log message since we trust the env now

  const mainPool = new Pool({ connectionString: DATABASE_URL });
  const replicaPool = new Pool({
    connectionString: REPLICA_DATABASE_URL,
  });

  const mainAdapter = new PrismaPg(mainPool);
  const replicaAdapter = new PrismaPg(replicaPool);

  const main = new PrismaClient({ adapter: mainAdapter });
  const replica = new PrismaClient({ adapter: replicaAdapter });

  return main.$extends(
    readReplicas({
      replicas: [replica],
    }),
  );
}

export const prisma = global.prisma ?? createPrisma();

if (process.env.NODE_ENV !== 'production') {
  global.prisma = prisma;
}

export type ExtendedPrismaClient = typeof prisma;
