import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Logger } from '@nestjs/common';
import { Job } from 'bullmq';
import { QUEUE_NAMES } from '@/shared/queue/queue.constants';
import { ProductDetailJob } from '@/shared/queue/interfaces/product-detail-job.interface';
import { ScrapeOrchestratorService } from '@/shared/scraping/services/scrape-orchestrator.service';
import { ProductSaveService } from '@/shared/scraping/services/product-save.service';
import { ScrapeLockService } from '@/shared/scraping/services/scrape-lock.service';
import { PrismaService } from '@/shared/prisma/prisma.service';
import { ScrapStatus, ScrapeState } from '@/generated/prisma/client';
import { ParserService } from '@/shared/scraping/services/parser.service';
import { getEnumKeyAsType } from '@/shared/lib/util';

@Processor(QUEUE_NAMES.PRODUCT_DETAIL_QUEUE)
export class ProductDetailProcessor extends WorkerHost {
  private readonly logger = new Logger(ProductDetailProcessor.name);

  constructor(
    private readonly orchestrator: ScrapeOrchestratorService,
    private readonly productSaveService: ProductSaveService,
    private readonly parserService: ParserService,
    private readonly scrapeLock: ScrapeLockService,
    private readonly prisma: PrismaService,
  ) {
    super();
  }

  async process(job: Job<ProductDetailJob>): Promise<any> {
    const { jobId, products } = job.data;

    this.logger.log(
      `Processing batch of ${products.length} product details for job ${jobId}`,
    );

    const results = await Promise.all(
      products.map(async (product) => {
        const { url, domain, retailer } = product;

        // Skip Meesho product detail scraping
        if (retailer.toLowerCase() === 'meesho') {
          this.logger.warn(
            `Skipping Meesho product detail scraping for ${url}`,
          );
          return {
            url,
            success: false,
            error: 'Meesho detail scraping not supported',
          };
        }

        // Find product by URL to get productId for lock/state management
        const dbProduct = await this.prisma.client.product.findUnique({
          where: { productUrl: url },
          select: { id: true },
        });

        const productId = dbProduct?.id;

        // Acquire distributed lock (skip if product not in DB yet)
        if (productId) {
          const lockAcquired = await this.scrapeLock.acquireLock(productId);
          if (!lockAcquired) {
            this.logger.debug(
              `Lock not acquired for ${url} — scrape already in progress`,
            );
            return { url, success: false, error: 'Already in progress' };
          }

          // Mark as IN_PROGRESS
          await this.updateScrapeState(
            productId,
            getEnumKeyAsType(
              ScrapeState,
              ScrapeState.IN_PROGRESS,
            ) as ScrapeState,
          );
        }

        try {
          const result = await this.orchestrator.scrape({
            url,
            domain,
            options: {
              timeout: 30000,
            },
          });

          if (result.success && result.data) {
            const parsedProduct = this.parserService.parseDetail(
              result.data,
              retailer,
            );

            if (parsedProduct) {
              parsedProduct.productUrl = url;

              await this.productSaveService.upsertProducts(
                [parsedProduct],
                getEnumKeyAsType(
                  ScrapStatus,
                  ScrapStatus.DETAILED,
                ) as ScrapStatus,
              );

              await this.productSaveService.generateAndSaveEmbedding(url);

              // Update state to IDLE + mark detailed timestamp
              if (productId) {
                await this.prisma.client.product.update({
                  where: { id: productId },
                  data: {
                    scrapeState: getEnumKeyAsType(
                      ScrapeState,
                      ScrapeState.IDLE,
                    ) as ScrapeState,
                    lastDetailedScrapedAt: new Date(),
                    lastScrapeAttemptAt: new Date(),
                  },
                });
              }

              this.logger.debug(
                `Updated ${url} with full details and regenerated embedding`,
              );
              return { url, success: true };
            } else {
              this.logger.warn(`Failed to parse details for ${url}`);
              await this.productSaveService.updateScrapStatus(
                url,
                getEnumKeyAsType(
                  ScrapStatus,
                  ScrapStatus.DETAILED,
                ) as ScrapStatus,
              );

              if (productId) {
                await this.updateScrapeState(productId, ScrapeState.FAILED);
              }

              return {
                url,
                success: false,
                error: 'Parsing failed (null result)',
              };
            }
          } else {
            this.logger.warn(`Scrape failed for ${url}: ${result.error}`);

            if (productId) {
              await this.updateScrapeState(productId, ScrapeState.FAILED);
            }

            return { url, success: false, error: result.error };
          }
        } catch (error) {
          this.logger.error(`Error processing ${url}: ${error.message}`);

          if (productId) {
            await this.updateScrapeState(
              productId,
              getEnumKeyAsType(ScrapeState, ScrapeState.FAILED) as ScrapeState,
            );
          }

          // Smart retry delays based on HTTP status codes
          const errorMsg = error.message || '';
          if (errorMsg.includes('429') || errorMsg.includes('rate limit')) {
            throw Object.assign(error, {
              delay: 60_000,
              message: `[429 Rate Limited] ${errorMsg}`,
            });
          } else if (errorMsg.includes('503')) {
            throw Object.assign(error, {
              delay: 15_000,
              message: `[503 Unavailable] ${errorMsg}`,
            });
          }

          return { url, success: false, error: error.message };
        } finally {
          // Always release lock
          if (productId) {
            await this.scrapeLock.releaseLock(productId);
          }
        }
      }),
    );

    const successCount = results.filter((r) => r.success).length;
    this.logger.log(
      `Job ${jobId} finished: ${successCount}/${products.length} products processed successfully`,
    );

    return results;
  }

  /**
   * Update scrapeState and lastScrapeAttemptAt for a product.
   */
  private async updateScrapeState(
    productId: string,
    state: ScrapeState,
  ): Promise<void> {
    try {
      await this.prisma.client.product.update({
        where: { id: productId },
        data: {
          scrapeState: getEnumKeyAsType(ScrapeState, state) as ScrapeState,
          lastScrapeAttemptAt: new Date(),
        },
      });
    } catch (error) {
      this.logger.error(
        `Failed to update scrape state for ${productId}: ${error.message}`,
      );
    }
  }

  async onCompleted(job: Job, result: any) {
    this.logger.debug(`Product detail job ${job.id} completed`);
  }

  async onFailed(job: Job, error: Error) {
    this.logger.error(
      `Product detail job ${job.id} failed after ${job.attemptsMade} attempts: ${error.message}`,
    );
  }
}
