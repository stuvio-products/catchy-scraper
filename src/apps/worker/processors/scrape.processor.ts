import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Job, Queue } from 'bullmq';
import { InjectQueue } from '@nestjs/bullmq';
import { QUEUE_NAMES } from '@/shared/queue/queue.constants';
import { ScrapeJob } from '@/shared/queue/interfaces/scrape-job.interface';
import { ScrapeOrchestratorService } from '@/shared/scraping/services/scrape-orchestrator.service';
import { PrismaService } from '@/shared/prisma/prisma.service';
import { FlipkartParser } from '@/shared/scraping/scrapers/flipkart-parser';
import { getEnumKeyAsType } from '@/shared/lib/util';
import { ScrapStatus } from '@/generated/prisma/enums';

@Processor(QUEUE_NAMES.SCRAPE_QUEUE)
export class ScrapeProcessor extends WorkerHost {
  private readonly logger = new Logger(ScrapeProcessor.name);
  private readonly concurrency: number;

  constructor(
    private readonly orchestrator: ScrapeOrchestratorService,
    private readonly configService: ConfigService,
    private readonly prisma: PrismaService,
    @InjectQueue(QUEUE_NAMES.SCRAPE_QUEUE)
    private scrapeQueue: Queue<ScrapeJob>,
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

        // Domain specific handling
        if (domain.includes('myntra.com') && result.data) {
          await this.processMyntraData(result.data, jobId);
        } else if (domain.includes('flipkart.com') && result.data) {
          await this.processFlipkartData(result.data, jobId);
        }
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

  private async processFlipkartData(htmlContent: string, jobId: string) {
    try {
      const products = FlipkartParser.parse(htmlContent);
      this.logger.log(`Found ${products.length} Flipkart products to save`);

      for (const p of products) {
        const productUrl = p.product_link;

        await this.prisma.client.product.upsert({
          where: { productUrl: productUrl },
          update: {
            title: p.product_name,
            price: p.current_price,
            inStock: true,
            images: [p.thumbnail],
            lastScraped: new Date(),
            scrapStatus: getEnumKeyAsType(ScrapStatus, 'BASIC') as ScrapStatus,
          },
          create: {
            title: p.product_name,
            price: p.current_price,
            retailer: 'Flipkart',
            productUrl: productUrl,
            images: [p.thumbnail],
            inStock: true,
            lastScraped: new Date(),
            scrapStatus: getEnumKeyAsType(ScrapStatus, 'BASIC') as ScrapStatus,
          },
        });

        // Queue Detail Scrape (Recursive)
        // Only queue if it's a search result listing, not if we just scraped a detail page
        if (productUrl && !productUrl.includes('search?')) {
          await this.scrapeQueue.add('product-detail', {
            jobId: `detail-flipkart-${Date.now()}-${Math.random().toString(36).substring(7)}`,
            url: productUrl,
            domain: 'flipkart.com',
            options: { timeout: 30000 },
            createdAt: new Date(),
          });
        }
      }
    } catch (e) {
      this.logger.error(`Failed to process Flipkart data: ${e.message}`);
    }
  }

  private async processMyntraData(htmlContent: string, jobId: string) {
    try {
      const startPattern = 'window.__myx = ';
      const startIndex = htmlContent.indexOf(startPattern);

      if (startIndex === -1) {
        this.logger.warn('window.__myx not found in Myntra response');
        return;
      }

      const jsonStart = startIndex + startPattern.length;
      let braceCount = 0;
      let inString = false;
      let escapeNext = false;
      let endIndex = jsonStart;

      // Manual JSON extraction based on brace counting
      for (let i = jsonStart; i < htmlContent.length; i++) {
        const char = htmlContent[i];

        if (escapeNext) {
          escapeNext = false;
          continue;
        }

        if (char === '\\') {
          escapeNext = true;
          continue;
        }

        if (char === '"') {
          inString = !inString;
          continue;
        }

        if (!inString) {
          if (char === '{') braceCount++;
          if (char === '}') braceCount--;

          if (braceCount === 0) {
            endIndex = i + 1;
            break;
          }
        }
      }

      const jsonString = htmlContent.substring(jsonStart, endIndex);
      const jsonObject = JSON.parse(jsonString);

      const products = jsonObject?.searchData?.results?.products;

      if (!Array.isArray(products)) {
        this.logger.warn('No products found in Myntra data');
        return;
      }

      this.logger.log(`Found ${products.length} products to save`);

      for (const p of products) {
        const productUrl = `https://www.myntra.com/${p.landingPageUrl}`;

        await this.prisma.client.product.upsert({
          where: { productUrl: productUrl },
          update: {
            title: p.productName,
            description: p.additionalInfo,
            brand: p.brand,
            category: p.category,
            price: p.price,
            inStock: p.inventoryInfo
              ? p.inventoryInfo.some((i: any) => i.available)
              : true,
            images: p.images ? p.images.map((img: any) => img.src) : [],
            size: p.sizes ? p.sizes.split(',') : [],
            color: p.primaryColour ? [p.primaryColour] : [],
            lastScraped: new Date(),
            scrapStatus: getEnumKeyAsType(ScrapStatus, 'BASIC') as ScrapStatus,
          },
          create: {
            title: p.productName,
            description: p.additionalInfo,
            brand: p.brand,
            category: p.category,
            price: p.price,
            retailer: 'Myntra',
            productUrl: productUrl,
            inStock: p.inventoryInfo
              ? p.inventoryInfo.some((i: any) => i.available)
              : true,
            images: p.images ? p.images.map((img: any) => img.src) : [],
            size: p.sizes ? p.sizes.split(',') : [],
            color: p.primaryColour ? [p.primaryColour] : [],
            lastScraped: new Date(),
            scrapStatus: getEnumKeyAsType(ScrapStatus, 'BASIC') as ScrapStatus,
          },
        });

        // Queue Detail Scrape
        await this.scrapeQueue.add('product-detail', {
          jobId: `detail-myntra-${p.productId}`,
          url: productUrl,
          domain: 'myntra.com',
          options: { timeout: 30000 },
          createdAt: new Date(),
        });
      }
    } catch (e) {
      this.logger.error(`Failed to process Myntra data: ${e.message}`);
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
