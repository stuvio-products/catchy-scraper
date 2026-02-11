import { Controller, Get, Logger } from '@nestjs/common';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import { QUEUE_NAMES } from '@/shared/queue/queue.constants';

@Controller('health')
export class HealthController {
  private readonly logger = new Logger(HealthController.name);

  constructor(
    @InjectQueue(QUEUE_NAMES.SCRAPE_QUEUE)
    private readonly scrapeQueue: Queue,
  ) {}

  @Get()
  async getHealth() {
    const queueHealth = await this.getQueueHealth();

    return {
      status: 'ok',
      timestamp: new Date().toISOString(),
      service: 'api',
    };
  }

  private async getQueueHealth() {
    try {
      const counts = await this.scrapeQueue.getJobCounts();
      return {
        status: 'connected',
        counts,
      };
    } catch (error) {
      this.logger.error(`Queue health check failed: ${error.message}`);
      return {
        status: 'disconnected',
        error: error.message,
      };
    }
  }
}
