import { config } from 'dotenv';
import { defineConfig } from 'prisma/config';

const useDev = true;
const envFile = useDev ? '.env.local' : '.env.prod';

config({ path: envFile });

console.log('Environment: ', process.env.NODE_ENV);
console.log('Env file: ', envFile);
console.log(`The connection URL is ${process.env.DATABASE_URL}`);

export default defineConfig({
  schema: 'prisma/schema.prisma',
  migrations: {
    path: 'prisma/migrations',
  },
  datasource: {
    url: process.env['DATABASE_URL'],
  },
});
