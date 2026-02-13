// prisma-client.provider.ts
import { Pool } from 'pg';
import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import { readReplicas } from '@prisma/extension-read-replicas';

const IS_PRODUCTION_DB = false;
const DATABASE_URL = process.env.DATABASE_URL;
const REPLICA_DATABASE_URL = process.env.DATABASE_REPLICA_URL;

type PrismaClientType = ReturnType<typeof createPrisma>;

declare global {
  var prisma: PrismaClientType | undefined;
}

function createPrisma() {
  console.log('PrismaProvider: Creating Prisma Client...');

  if (IS_PRODUCTION_DB) {
    console.log('🔴 Using PRODUCTION database (USE_PRODUCTION_DB is enabled)');
  } else {
    console.log('🟢 Using LOCAL database (default)');
  }

  console.log(DATABASE_URL);
  console.log(REPLICA_DATABASE_URL);

  const mainPool = new Pool({ connectionString: DATABASE_URL });
  const replicaPool = new Pool({ connectionString: REPLICA_DATABASE_URL });

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
