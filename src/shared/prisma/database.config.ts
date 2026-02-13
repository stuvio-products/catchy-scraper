// database.config.ts
// Centralized database configuration that handles local vs production database selection
import 'dotenv/config';

// Check if we should use production database
// Only applicable when NODE_ENV is NOT production (for local development)
const isProductionEnv = process.env.NODE_ENV === 'production';
const useProductionDb =
  !isProductionEnv &&
  (process.env.USE_PRODUCTION_DB === 'true' ||
    process.env.USE_PRODUCTION_DB === '1');

// Determine which DATABASE_URL to use
const databaseUrl = useProductionDb
  ? process.env.PRODUCTION_DATABASE_URL || process.env.DATABASE_URL
  : process.env.DATABASE_URL;

// Determine which DATABASE_REPLICA_URL to use
const replicaUrl = useProductionDb
  ? process.env.PRODUCTION_DATABASE_REPLICA_URL ||
    process.env.DATABASE_REPLICA_URL
  : process.env.DATABASE_REPLICA_URL;

// Validate and throw errors if URLs are missing
if (!databaseUrl) {
  throw new Error(
    `DATABASE_URL is not set. Please configure it in docker-compose.prod.yml or .env file.${
      useProductionDb
        ? ' For production, set PRODUCTION_DATABASE_URL or DATABASE_URL.'
        : ''
    }`,
  );
}

if (!replicaUrl) {
  throw new Error(
    `DATABASE_REPLICA_URL is not set. Please configure it in docker-compose.prod.yml or .env file.${
      useProductionDb
        ? ' For production, set PRODUCTION_DATABASE_REPLICA_URL or DATABASE_REPLICA_URL.'
        : ''
    }`,
  );
}

// Export the actual database URLs to be used
export const ACTUAL_DATABASE_URL: string = databaseUrl;
export const ACTUAL_REPLICA_DATABASE_URL: string = replicaUrl;

// Export a flag to indicate which database is being used
export const IS_PRODUCTION_DB: boolean = useProductionDb;
