import { NestFactory } from '@nestjs/core';
import { Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { WorkerAppModule } from './app.module';

async function bootstrap() {
  const logger = new Logger('Worker');
  const app = await NestFactory.createApplicationContext(WorkerAppModule);

  const configService = app.get(ConfigService);
  const concurrency = configService.get<number>('WORKER_CONCURRENCY') || 4;

  // Graceful shutdown
  app.enableShutdownHooks();

  logger.log(`🔨 Worker started with concurrency: ${concurrency}`);
  logger.log('Listening for scrape jobs...');

  // Keep process running
  process.on('SIGTERM', async () => {
    logger.log('SIGTERM received, shutting down gracefully...');
    await app.close();
    process.exit(0);
  });

  process.on('SIGINT', async () => {
    logger.log('SIGINT received, shutting down gracefully...');
    await app.close();
    process.exit(0);
  });
}

bootstrap();
