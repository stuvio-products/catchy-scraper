import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Logger } from '@nestjs/common';
import { Job } from 'bullmq';
import { QUEUE_NAMES } from '@/shared/queue/queue.constants';
import { ProductDetailJob } from '@/shared/queue/interfaces/product-detail-job.interface';
import { ScrapeOrchestratorService } from '@/shared/scraping/services/scrape-orchestrator.service';
import { ProductSaveService } from '@/shared/scraping/services/product-save.service';
import { ScrapStatus } from '@prisma/client';

import { ParserService } from '@/shared/scraping/services/parser.service';
import { ScrapeStrategy } from '@/shared/domain/enums/scrape-strategy.enum';

@Processor(QUEUE_NAMES.PRODUCT_DETAIL_QUEUE)
export class ProductDetailProcessor extends WorkerHost {
  private readonly logger = new Logger(ProductDetailProcessor.name);

  constructor(
    private readonly orchestrator: ScrapeOrchestratorService,
    private readonly productSaveService: ProductSaveService,
    private readonly parserService: ParserService,
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

        // Skip Meesho product detail scraping (blocked by Akamai bot detection)
        if (retailer.toLowerCase() === 'meesho') {
          this.logger.warn(
            `Skipping Meesho product detail scraping for ${url} (Akamai blocks browser automation)`,
          );
          return {
            url,
            success: false,
            error: 'Meesho detail scraping disabled (Akamai bot detection)',
          };
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
            // Parse the detail page
            const parsedProduct = this.parserService.parseDetail(
              result.data,
              retailer,
            );

            if (parsedProduct) {
              // Ensure URL is correct (parsers might not know it)
              parsedProduct.productUrl = url;

              // Save detailed info
              await this.productSaveService.upsertProducts(
                [parsedProduct],
                ScrapStatus.DETAILED,
              );

              // Generate embedding for the enriched product
              await this.productSaveService.generateAndSaveEmbedding(url);

              this.logger.debug(
                `Updated ${url} with full details and regenerated embedding`,
              );
              return { url, success: true };
            } else {
              this.logger.warn(`Failed to parse details for ${url}`);
              // Still update status to prevent infinite retry if parsing is just broken for one page
              await this.productSaveService.updateScrapStatus(
                url,
                ScrapStatus.DETAILED,
              );
              return {
                url,
                success: false,
                error: 'Parsing failed (null result)',
              };
            }
          } else {
            this.logger.warn(`Scrape failed for ${url}: ${result.error}`);
            return { url, success: false, error: result.error };
          }
        } catch (error) {
          this.logger.error(`Error processing ${url}: ${error.message}`);

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
        }
      }),
    );

    const successCount = results.filter((r) => r.success).length;
    this.logger.log(
      `Job ${jobId} finished: ${successCount}/${products.length} products processed successfully`,
    );

    return results;
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
