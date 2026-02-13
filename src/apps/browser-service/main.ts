import { NestFactory } from '@nestjs/core';
import { ValidationPipe, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { BrowserServiceAppModule } from './app.module';
import { setupGracefulShutdown } from '@/shared/utils/graceful-shutdown';

async function bootstrap() {
  const logger = new Logger('BrowserService');
  const app = await NestFactory.create(BrowserServiceAppModule);

  const configService = app.get(ConfigService);
  const port = configService.get<number>('BROWSER_SERVICE_PORT') || 3001;

  // Validation pipe
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
    }),
  );

  // ...
  // Graceful shutdown
  await setupGracefulShutdown(app);

  await app.listen(port);
  logger.log(`🌐 Browser Service running on http://localhost:${port}`);
  logger.log('⚠️  This service should NOT be exposed publicly!');
}

bootstrap();
