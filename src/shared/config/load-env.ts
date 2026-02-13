import fs from 'fs';
import path from 'path';
import dotenv from 'dotenv';

export function loadEnv() {
  const nodeEnv = process.env.NODE_ENV || 'development';
  // If ENV_FILE is explicitly set (like in start.sh), use it.
  // Otherwise, default to .env.prod for production, .env.local for dev, or .env as fallback.
  let envFile = process.env.ENV_FILE;

  if (!envFile) {
    if (nodeEnv === 'production') {
      envFile = '.env.prod';
    } else if (nodeEnv === 'development') {
      envFile = '.env.local';
    } else {
      envFile = '.env';
    }
  }

  // Adjust path: assume we are running from project root
  // If this file is imported in prisma.config.ts (root) or src/... (nested),
  // we should find the project root.
  // Ideally, process.cwd() is the project root when running scripts.
  const envPath = path.resolve(process.cwd(), envFile);

  if (fs.existsSync(envPath)) {
    dotenv.config({ path: envPath });
    console.log(`Loaded environment from ${envFile}`);
  } else {
    // Fallback to .env if specific file missing
    const defaultEnvPath = path.resolve(process.cwd(), '.env');
    if (fs.existsSync(defaultEnvPath)) {
      dotenv.config({ path: defaultEnvPath });
      console.log(`Loaded environment from .env (fallback)`);
    } else {
      console.warn(
        `Warning: Environment file ${envFile} not found and no .env fallback available.`,
      );
    }
  }
}
