import { NestFactory } from '@nestjs/core';
import { Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { WorkerAppModule } from './app.module';
import { setupGracefulShutdown } from '@/shared/utils/graceful-shutdown';

async function bootstrap() {
  const logger = new Logger('Worker');
  const app = await NestFactory.createApplicationContext(WorkerAppModule);

  const configService = app.get(ConfigService);
  const concurrency = configService.get<number>('WORKER_CONCURRENCY') || 4;

  // ...
  // Graceful shutdown
  await setupGracefulShutdown(app);

  logger.log(`🔨 Worker started with concurrency: ${concurrency}`);
  logger.log('Listening for scrape jobs...');
}

bootstrap();
