import { loadEnv } from './src/shared/config/load-env';
import { defineConfig } from 'prisma/config';

// Load the correct environment variables first
loadEnv();

export default defineConfig({
  schema: 'prisma/schema.prisma',
  migrations: {
    path: 'prisma/migrations',
  },
  datasource: {
    url: process.env['DATABASE_URL'],
  },
});
