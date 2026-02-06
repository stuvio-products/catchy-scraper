import * as Joi from 'joi';

export const validationSchema = Joi.object({
  // Shared
  NODE_ENV: Joi.string()
    .valid('development', 'production', 'test')
    .default('development'),
  REDIS_HOST: Joi.string().default('localhost'),
  REDIS_PORT: Joi.number().default(6379),

  // API
  API_PORT: Joi.number().default(3000),
  API_KEY: Joi.string().required(),

  // Worker
  WORKER_CONCURRENCY: Joi.number().min(1).max(20).default(4),

  // Browser Service
  BROWSER_SERVICE_PORT: Joi.number().default(3001),
  BROWSER_SERVICE_API_KEY: Joi.string().required(),
  BROWSER_COUNT: Joi.number().min(1).max(10).default(4),
  BROWSER_HEADLESS: Joi.boolean().default(true),
  BROWSER_TIMEOUT_MS: Joi.number().min(5000).max(60000).default(30000),

  // Proxy
  PROXY_PROVIDER: Joi.string().valid('fake').default('fake'),
  FAKE_PROXY_COST_PER_MB: Joi.number().min(0).default(0.001),
  FAKE_PROXY_FAILURE_RATE: Joi.number().min(0).max(1).default(0.05),
});
