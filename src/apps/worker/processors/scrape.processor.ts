import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Job } from 'bullmq';
import { QUEUE_NAMES } from '@/shared/queue/queue.constants';
import { ScrapeJob } from '@/shared/queue/interfaces/scrape-job.interface';
import { ScrapeOrchestratorService } from '@/shared/scraping/services/scrape-orchestrator.service';
import { ParserService } from '@/shared/scraping/services/parser.service';
import { ProductSaveService } from '@/shared/scraping/services/product-save.service';
import { CrawlProgressService } from '@/shared/scraping/services/crawl-progress.service';
import { getEnumKeyAsType } from '@/shared/lib/util';
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
    private readonly crawlProgressService: CrawlProgressService,
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
          await this.processMyntraData(result.data, job.data);
        } else if (domain.includes('flipkart.com')) {
          await this.processFlipkartData(result.data, job.data);
        } else if (domain.includes('meesho.com')) {
          await this.processMeeshoData(result.data, job.data);
        } else if (domain.includes('amazon.in')) {
          await this.processAmazonData(result.data, job.data);
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

  private async processFlipkartData(htmlContent: string, jobData: ScrapeJob) {
    try {
      const products = this.parserService.parseFlipkart(htmlContent);
      this.logger.log(`Found ${products.length} Flipkart products to save`);

      // Save products with BASIC status only — detail scraping is click-triggered
      const saved = await this.productSaveService.upsertProducts(
        products,
        getEnumKeyAsType(ScrapStatus, ScrapStatus.BASIC) as ScrapStatus,
      );

      // Link products to query and update CrawlProgress
      await this.updateCrawlState(saved, jobData, 'flipkart', products.length);

      // Generate embeddings asynchronously (fire-and-forget)
      this.generateEmbeddingsForProducts(products).catch((err) =>
        this.logger.error(
          `Flipkart embedding generation failed: ${err.message}`,
        ),
      );
    } catch (e) {
      this.logger.error(`Failed to process Flipkart data: ${e.message}`);
    }
  }

  private async processMyntraData(htmlContent: string, jobData: ScrapeJob) {
    try {
      const products = this.parserService.parseMyntra(htmlContent);

      if (products.length === 0) {
        this.logger.warn('No products found in Myntra response');
        await this.markExhaustedIfTracked(jobData, 'myntra');
        return;
      }

      this.logger.log(`Found ${products.length} Myntra products to save`);

      // Save products with BASIC status only — detail scraping is click-triggered
      const saved = await this.productSaveService.upsertProducts(
        products,
        getEnumKeyAsType(ScrapStatus, ScrapStatus.BASIC) as ScrapStatus,
      );

      // Link products to query and update CrawlProgress
      await this.updateCrawlState(saved, jobData, 'myntra', products.length);

      // Generate embeddings asynchronously (fire-and-forget)
      this.generateEmbeddingsForProducts(products).catch((err) =>
        this.logger.error(`Myntra embedding generation failed: ${err.message}`),
      );
    } catch (e) {
      this.logger.error(`Failed to process Myntra data: ${e.message}`);
    }
  }

  private async processMeeshoData(htmlContent: string, jobData: ScrapeJob) {
    try {
      const products = this.parserService.parseMeesho(htmlContent);

      if (products.length === 0) {
        this.logger.warn('No products found in Meesho response');
        await this.markExhaustedIfTracked(jobData, 'meesho');
        return;
      }

      this.logger.log(`Found ${products.length} Meesho products to save`);

      // Save products with BASIC status
      const saved = await this.productSaveService.upsertProducts(
        products,
        getEnumKeyAsType(ScrapStatus, ScrapStatus.BASIC) as ScrapStatus,
      );

      // Link products to query and update CrawlProgress
      await this.updateCrawlState(saved, jobData, 'meesho', products.length);

      // Generate embeddings asynchronously (fire-and-forget)
      this.generateEmbeddingsForProducts(products).catch((err) =>
        this.logger.error(`Meesho embedding generation failed: ${err.message}`),
      );
    } catch (e) {
      this.logger.error(`Failed to process Meesho data: ${e.message}`);
    }
  }

  private async processAmazonData(htmlContent: string, jobData: ScrapeJob) {
    try {
      const products = this.parserService.parseAmazon(htmlContent);

      if (products.length === 0) {
        this.logger.warn('No products found in Amazon response');
        await this.markExhaustedIfTracked(jobData, 'amazon');
        return;
      }

      this.logger.log(`Found ${products.length} Amazon products to save`);

      // Save products with BASIC status only — detail scraping is click-triggered
      const saved = await this.productSaveService.upsertProducts(
        products,
        getEnumKeyAsType(ScrapStatus, ScrapStatus.BASIC) as ScrapStatus,
      );

      // Link products to query and update CrawlProgress
      await this.updateCrawlState(saved, jobData, 'amazon', products.length);

      // Generate embeddings asynchronously (fire-and-forget)
      this.generateEmbeddingsForProducts(products).catch((err) =>
        this.logger.error(`Amazon embedding generation failed: ${err.message}`),
      );
    } catch (e) {
      this.logger.error(`Failed to process Amazon data: ${e.message}`);
    }
  }

  /**
   * Update CrawlProgress and link products to query after successful scrape.
   * Only runs if the job carries queryHash (new jobs). Old jobs without queryHash are skipped gracefully.
   */
  private async updateCrawlState(
    savedProducts: Array<{ id: string }>,
    jobData: ScrapeJob,
    retailer: string,
    productsFound: number,
  ): Promise<void> {
    if (!jobData.queryHash) return; // legacy job, no tracking

    try {
      // Link products to query
      const ids = savedProducts.map((p) => p.id).filter(Boolean);
      if (ids.length > 0) {
        await this.productSaveService.linkProductsToQuery(
          ids,
          jobData.queryHash,
          retailer,
          jobData.pageNumber || 1,
        );
      }

      // Update CrawlProgress
      const progress = await this.crawlProgressService.getProgress(
        retailer,
        jobData.queryHash,
      );
      if (progress) {
        await this.crawlProgressService.markPageComplete(
          progress.id,
          productsFound,
        );
      }
    } catch (err) {
      this.logger.error(
        `Failed to update crawl state for ${retailer}: ${err.message}`,
      );
    }
  }

  /**
   * Mark crawl as exhausted if job has tracking info and parser returned 0 products.
   */
  private async markExhaustedIfTracked(
    jobData: ScrapeJob,
    retailer: string,
  ): Promise<void> {
    if (!jobData.queryHash) return;

    try {
      const progress = await this.crawlProgressService.getProgress(
        retailer,
        jobData.queryHash,
      );
      if (progress) {
        await this.crawlProgressService.markExhausted(progress.id);
      }
    } catch (err) {
      this.logger.error(
        `Failed to mark exhausted for ${retailer}: ${err.message}`,
      );
    }
  }

  /**
   * Fire-and-forget embedding generation for a batch of products
   */
  private async generateEmbeddingsForProducts(
    products: { productUrl: string }[],
  ): Promise<void> {
    const urls = products.map((p) => p.productUrl).filter(Boolean);
    const results = await Promise.allSettled(
      urls.map((url) => this.productSaveService.generateAndSaveEmbedding(url)),
    );
    const succeeded = results.filter((r) => r.status === 'fulfilled').length;
    const failed = results.filter((r) => r.status === 'rejected').length;
    this.logger.log(
      `Embedding generation complete: ${succeeded} succeeded, ${failed} failed out of ${urls.length}`,
    );
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
