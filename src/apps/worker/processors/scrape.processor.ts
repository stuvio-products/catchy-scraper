import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Job } from 'bullmq';
import { QUEUE_NAMES } from '@/shared/queue/queue.constants';
import { ScrapeJob } from '@/shared/queue/interfaces/scrape-job.interface';
import { ScrapeOrchestratorService } from '@/shared/scraping/services/scrape-orchestrator.service';

@Processor(QUEUE_NAMES.SCRAPE_QUEUE)
export class ScrapeProcessor extends WorkerHost {
  private readonly logger = new Logger(ScrapeProcessor.name);
  private readonly concurrency: number;

  constructor(
    private readonly orchestrator: ScrapeOrchestratorService,
    private readonly configService: ConfigService,
  ) {
    super();
    this.concurrency =
      this.configService.get<number>('WORKER_CONCURRENCY') || 4;
  }

  async process(job: Job<ScrapeJob>): Promise<any> {
    const { jobId, url, domain, options } = job.data;

    this.logger.log(`Processing job ${jobId}: ${url}`);

    try {
      const result = await this.orchestrator.scrape({
        url,
        domain,
        options,
      });

      if (result.success) {
        this.logger.log(
          `Job ${jobId} completed successfully (${result.metadata.strategy}, ${result.metadata.duration}ms)`,
        );
      } else {
        this.logger.warn(`Job ${jobId} failed: ${result.error}`);
      }

      return result;
    } catch (error) {
      this.logger.error(
        `Job ${jobId} threw error: ${error.message}`,
        error.stack,
      );
      throw error; // Let BullMQ handle retries
    }
  }

  async onCompleted(job: Job, result: any) {
    this.logger.debug(`Job ${job.id} completed with result`);
  }

  async onFailed(job: Job, error: Error) {
    this.logger.error(
      `Job ${job.id} failed after ${job.attemptsMade} attempts: ${error.message}`,
    );
  }
}
