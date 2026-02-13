import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { BrowserPoolService } from './browser-pool.service';

@Injectable()
export class BrowserHealthService {
  private readonly logger = new Logger(BrowserHealthService.name);

  constructor(private readonly browserPool: BrowserPoolService) {}

  @Cron(CronExpression.EVERY_30_SECONDS)
  async performHealthCheck() {
    this.logger.debug('Performing browser pool health check...');

    const stats = this.browserPool.getPoolStats();

    this.logger.log(
      `Browser pool health: ${stats.healthy} healthy, ${stats.unhealthy} unhealthy, ${stats.dead} dead (${stats.total} total)`,
    );

    // In a production system, we would:
    // 1. Check WebSocket connections
    // 2. Kill and respawn dead browsers
    // 3. Alert on low healthy count
  }
}
