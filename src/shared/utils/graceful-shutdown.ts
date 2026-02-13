import { INestApplicationContext, Logger } from '@nestjs/common';

export async function setupGracefulShutdown(app: INestApplicationContext) {
  const logger = new Logger('GracefulShutdown');

  const signals = ['SIGINT', 'SIGTERM'];

  signals.forEach((signal) => {
    process.on(signal, async () => {
      logger.log(`${signal} received: closing application...`);
      try {
        await app.close();
        logger.log('Application closed gracefully.');
        process.exit(0);
      } catch (err) {
        logger.error(`Error during graceful shutdown: ${err}`);
        process.exit(1);
      }
    });
  });
}
