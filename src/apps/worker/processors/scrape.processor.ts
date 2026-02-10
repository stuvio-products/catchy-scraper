import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Job, Queue } from 'bullmq';
import { InjectQueue } from '@nestjs/bullmq';
import { QUEUE_NAMES } from '@/shared/queue/queue.constants';
import { ScrapeJob } from '@/shared/queue/interfaces/scrape-job.interface';
import { ProductDetailJob } from '@/shared/queue/interfaces/product-detail-job.interface';
import { ScrapeOrchestratorService } from '@/shared/scraping/services/scrape-orchestrator.service';
import { ParserService } from '@/shared/scraping/services/parser.service';
import { ProductSaveService } from '@/shared/scraping/services/product-save.service';
import { ScrapStatus } from '@prisma/client';

@Processor(QUEUE_NAMES.SCRAPE_QUEUE)
export class ScrapeProcessor extends WorkerHost {
  private readonly logger = new Logger(ScrapeProcessor.name);
  private readonly concurrency: number;

  constructor(
    private readonly orchestrator: ScrapeOrchestratorService,
    private readonly configService: ConfigService,
    private readonly parserService: ParserService,
    private readonly productSaveService: ProductSaveService,
    @InjectQueue(QUEUE_NAMES.PRODUCT_DETAIL_QUEUE)
    private productDetailQueue: Queue<ProductDetailJob>,
  ) {
    super();
    this.concurrency =
      this.configService.get<number>('WORKER_CONCURRENCY') || 4;
  }

  private readonly BATCH_SIZE = 10;

  private chunkArray<T>(array: T[], size: number): T[][] {
    const result: T[][] = [];
    for (let i = 0; i < array.length; i += size) {
      result.push(array.slice(i, i + size));
    }
    return result;
  }

  async process(job: Job<ScrapeJob>): Promise<any> {
    const { jobId, url, domain, options } = job.data;

    if (!url || !domain) {
      this.logger.warn(
        `Received job ${job.id} (${job.name}) without URL or Domain. Skipping (likely a misplaced batch job).`,
      );
      return;
    }

    this.logger.log(`Processing search job ${jobId}: ${url}`);

    try {
      const result = await this.orchestrator.scrape({
        url,
        domain,
        options,
      });

      if (result.success && result.data) {
        this.logger.log(
          `Job ${jobId} completed successfully (${result.metadata.strategy}, ${result.metadata.duration}ms)`,
        );

        // Domain specific handling (search results only)
        if (domain.includes('myntra.com')) {
          await this.processMyntraData(result.data, jobId);
        } else if (domain.includes('flipkart.com')) {
          await this.processFlipkartData(result.data, jobId);
        } else if (domain.includes('meesho.com')) {
          await this.processMeeshoData(result.data, jobId);
        } else if (domain.includes('amazon.in')) {
          await this.processAmazonData(result.data, jobId);
        }
      } else if (!result.success) {
        this.logger.warn(`Job ${jobId} failed: ${result.error}`);
      }

      return result;
    } catch (error) {
      this.logger.error(
        `Job ${jobId} threw error: ${error.message}`,
        error.stack,
      );

      // Smart retry delays based on HTTP status codes
      const errorMsg = error.message || '';
      if (errorMsg.includes('429') || errorMsg.includes('rate limit')) {
        // Rate limited — wait 60s before retry
        throw Object.assign(error, {
          delay: 60_000,
          message: `[429 Rate Limited] ${errorMsg}`,
        });
      } else if (errorMsg.includes('503')) {
        // Service unavailable — wait 15s before retry
        throw Object.assign(error, {
          delay: 15_000,
          message: `[503 Unavailable] ${errorMsg}`,
        });
      }

      throw error; // Let BullMQ handle retries with default backoff
    }
  }

  private async processFlipkartData(htmlContent: string, jobId: string) {
    try {
      const products = this.parserService.parseFlipkart(htmlContent);
      this.logger.log(`Found ${products.length} Flipkart products to save`);

      // Save products with BASIC status
      await this.productSaveService.upsertProducts(products, ScrapStatus.BASIC);

      // Queue detail scraping in batches
      const validProducts = products.filter(
        (p) => p.productUrl && !p.productUrl.includes('search?'),
      );
      const batches = this.chunkArray(validProducts, this.BATCH_SIZE);

      for (const batch of batches) {
        await this.productDetailQueue.add('scrape-detail', {
          jobId: `detail-flipkart-batch-${Date.now()}-${Math.random().toString(36).substring(7)}`,
          products: batch.map((p) => ({
            url: p.productUrl,
            domain: 'flipkart.com',
            retailer: 'flipkart',
          })),
          createdAt: new Date(),
        });
      }
    } catch (e) {
      this.logger.error(`Failed to process Flipkart data: ${e.message}`);
    }
  }

  private async processMyntraData(htmlContent: string, jobId: string) {
    try {
      const products = this.parserService.parseMyntra(htmlContent);

      if (products.length === 0) {
        this.logger.warn('No products found in Myntra response');
        return;
      }

      this.logger.log(`Found ${products.length} Myntra products to save`);

      // Save products with BASIC status
      await this.productSaveService.upsertProducts(products, ScrapStatus.BASIC);

      // Queue detail scraping in batches
      const batches = this.chunkArray(products, this.BATCH_SIZE);

      for (const batch of batches) {
        await this.productDetailQueue.add('scrape-detail', {
          jobId: `detail-myntra-batch-${Date.now()}-${Math.random().toString(36).substring(7)}`,
          products: batch.map((p) => ({
            url: p.productUrl,
            domain: 'myntra.com',
            retailer: 'myntra',
          })),
          createdAt: new Date(),
        });
      }
    } catch (e) {
      this.logger.error(`Failed to process Myntra data: ${e.message}`);
    }
  }

  private async processMeeshoData(htmlContent: string, jobId: string) {
    try {
      const products = this.parserService.parseMeesho(htmlContent);

      if (products.length === 0) {
        this.logger.warn('No products found in Meesho response');
        return;
      }

      this.logger.log(`Found ${products.length} Meesho products to save`);

      // Save products with BASIC status
      await this.productSaveService.upsertProducts(products, ScrapStatus.BASIC);

      // TODO: Enable this when we have a proper proxy setup
      // // Queue detail scraping in batches
      // const validProducts = products.filter(
      //   (p) => p.productUrl && !p.productUrl.includes('search?'),
      // );
      // const batches = this.chunkArray(validProducts, this.BATCH_SIZE);

      // for (const batch of batches) {
      //   await this.productDetailQueue.add('scrape-detail', {
      //     jobId: `detail-meesho-batch-${Date.now()}-${Math.random().toString(36).substring(7)}`,
      //     products: batch.map((p) => ({
      //       url: p.productUrl,
      //       domain: 'meesho.com',
      //       retailer: 'meesho',
      //     })),
      //     createdAt: new Date(),
      //   });
      // }
    } catch (e) {
      this.logger.error(`Failed to process Meesho data: ${e.message}`);
    }
  }

  private async processAmazonData(htmlContent: string, jobId: string) {
    try {
      const products = this.parserService.parseAmazon(htmlContent);

      if (products.length === 0) {
        this.logger.warn('No products found in Amazon response');
        return;
      }

      this.logger.log(`Found ${products.length} Amazon products to save`);

      // Save products with BASIC status
      await this.productSaveService.upsertProducts(products, ScrapStatus.BASIC);

      // Queue detail scraping in batches
      const validProducts = products.filter(
        (p) => p.productUrl && p.productUrl.includes('/dp/'),
      );
      const batches = this.chunkArray(validProducts, this.BATCH_SIZE);

      for (const batch of batches) {
        await this.productDetailQueue.add('scrape-detail', {
          jobId: `detail-amazon-batch-${Date.now()}-${Math.random().toString(36).substring(7)}`,
          products: batch.map((p) => ({
            url: p.productUrl,
            domain: 'amazon.in',
            retailer: 'amazon',
          })),
          createdAt: new Date(),
        });
      }
    } catch (e) {
      this.logger.error(`Failed to process Amazon data: ${e.message}`);
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
