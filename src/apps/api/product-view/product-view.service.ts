import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import { PrismaService } from '@/shared/prisma/prisma.service';
import { FetchScraper } from '@/shared/scraping/scrapers/fetch.scraper';
import { ParserService } from '@/shared/scraping/services/parser.service';
import { ProductSaveService } from '@/shared/scraping/services/product-save.service';
import { ScrapeLockService } from '@/shared/scraping/services/scrape-lock.service';
import { QUEUE_NAMES } from '@/shared/queue/queue.constants';
import { ProductDetailJob } from '@/shared/queue/interfaces/product-detail-job.interface';
import { ScrapStatus, ScrapeState } from '@/generated/prisma/client';
import { getEnumKeyAsType } from '@/shared/lib/util';

/** 24 hours in milliseconds */
const CACHE_FRESHNESS_MS = 24 * 60 * 60 * 1000;

/** Hard timeout for inline FETCH scrapes */
const INLINE_SCRAPE_TIMEOUT_MS = 1500;

/** Retailers that support detailed scraping */
const SUPPORTED_RETAILERS = ['myntra', 'flipkart', 'amazon'] as const;

/** Retailers that use FETCH (inline) strategy */
const FETCH_RETAILERS = ['myntra', 'flipkart'] as const;

/** Retailers that require BROWSER (queued) strategy */
const BROWSER_RETAILERS = ['amazon'] as const;

@Injectable()
export class ProductViewService {
  private readonly logger = new Logger(ProductViewService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly fetchScraper: FetchScraper,
    private readonly parserService: ParserService,
    private readonly productSaveService: ProductSaveService,
    private readonly scrapeLock: ScrapeLockService,
    @InjectQueue(QUEUE_NAMES.PRODUCT_DETAIL_QUEUE)
    private readonly productDetailQueue: Queue<ProductDetailJob>,
  ) {}

  /**
   * Handle product view (click).
   * Decides whether to return cached data, trigger inline scrape, or enqueue background scrape.
   */
  async handleProductView(productId: string) {
    const product = await this.prisma.client.product.findUnique({
      where: { id: productId },
    });

    if (!product) {
      throw new NotFoundException(`Product ${productId} not found`);
    }

    const retailer = (product.retailer || '').toLowerCase();

    // ── Meesho: BASIC-only, never scrape details ──
    if (retailer === 'meesho') {
      this.logger.debug(
        `Meesho product ${productId} — returning BASIC data (detail scraping not supported)`,
      );
      return this.formatProductResponse(product);
    }

    // ── Check if detailed data is fresh (< 24h) ──
    if (
      product.scrapStatus ===
        getEnumKeyAsType(ScrapStatus, ScrapStatus.DETAILED) &&
      product.lastDetailedScrapedAt &&
      Date.now() - product.lastDetailedScrapedAt.getTime() < CACHE_FRESHNESS_MS
    ) {
      this.logger.debug(
        `Product ${productId} has fresh detailed data — returning cached`,
      );
      return this.formatProductResponse(product);
    }

    // ── Check if scrape is already in progress ──
    if (
      product.scrapeState ===
      getEnumKeyAsType(ScrapeState, ScrapeState.IN_PROGRESS)
    ) {
      this.logger.debug(
        `Product ${productId} scrape already in progress — returning current data`,
      );
      return this.formatProductResponse(product);
    }

    // ── Retailer not supported for detail scraping ──
    if (!SUPPORTED_RETAILERS.includes(retailer as any)) {
      this.logger.warn(
        `Unsupported retailer "${retailer}" for detail scraping`,
      );
      return this.formatProductResponse(product);
    }

    // ── Acquire distributed lock ──
    const lockAcquired = await this.scrapeLock.acquireLock(productId);
    if (!lockAcquired) {
      this.logger.debug(
        `Lock not acquired for ${productId} — scrape already in progress`,
      );
      return this.formatProductResponse(product);
    }

    // ── Mark as IN_PROGRESS ──
    await this.updateScrapeState(
      productId,
      getEnumKeyAsType(ScrapeState, ScrapeState.IN_PROGRESS) as ScrapeState,
    );

    // ── Route by retailer strategy ──
    if ((FETCH_RETAILERS as readonly string[]).includes(retailer)) {
      // Inline FETCH scrape for Myntra/Flipkart (non-blocking response)
      this.inlineFetchScrape(productId, product.productUrl!, retailer).catch(
        (err) => {
          this.logger.error(
            `Inline scrape failed for ${productId}: ${err.message}`,
          );
        },
      );
    } else if ((BROWSER_RETAILERS as readonly string[]).includes(retailer)) {
      // Queue BROWSER scrape for Amazon
      await this.enqueueBrowserScrape(productId, product.productUrl!, retailer);
    }

    return this.formatProductResponse(product);
  }

  /**
   * Get the current detail scrape status for a product (polling endpoint).
   */
  async getDetailStatus(productId: string) {
    const product = await this.prisma.client.product.findUnique({
      where: { id: productId },
      select: {
        scrapeState: true,
        scrapStatus: true,
        lastDetailedScrapedAt: true,
      },
    });

    if (!product) {
      throw new NotFoundException(`Product ${productId} not found`);
    }

    return {
      scrapeState: product.scrapeState,
      scrapeStatus: product.scrapStatus,
      lastDetailedScrapedAt:
        product.lastDetailedScrapedAt?.toISOString() ?? null,
    };
  }

  // ══════════════════════════════════════════════════════════════════════════
  // PRIVATE HELPERS
  // ══════════════════════════════════════════════════════════════════════════

  /**
   * Inline FETCH scrape with hard timeout (Myntra/Flipkart).
   * Runs asynchronously after returning the response to the client.
   */
  private async inlineFetchScrape(
    productId: string,
    url: string,
    retailer: string,
  ): Promise<void> {
    try {
      const domain = new URL(url).hostname.replace('www.', '');

      const timeoutPromise = new Promise<null>((resolve) =>
        setTimeout(() => resolve(null), INLINE_SCRAPE_TIMEOUT_MS),
      );

      const scrapePromise = this.fetchScraper.scrape({
        url,
        domain,
        options: { timeout: INLINE_SCRAPE_TIMEOUT_MS },
      });

      const result = await Promise.race([scrapePromise, timeoutPromise]);

      if (
        !result ||
        !('success' in result) ||
        !result.success ||
        !result.data
      ) {
        this.logger.warn(`Inline scrape failed/timed out for ${url}`);
        await this.updateScrapeState(
          productId,
          getEnumKeyAsType(ScrapeState, ScrapeState.FAILED) as ScrapeState,
        );
        await this.scrapeLock.releaseLock(productId);
        return;
      }

      const parsed = this.parserService.parseDetail(
        result.data,
        retailer as any,
      );

      if (!parsed) {
        this.logger.warn(`Parse failed for ${url}`);
        await this.updateScrapeState(
          productId,
          getEnumKeyAsType(ScrapeState, ScrapeState.FAILED) as ScrapeState,
        );
        await this.scrapeLock.releaseLock(productId);
        return;
      }

      // Persist enriched data
      parsed.productUrl = url;
      await this.productSaveService.upsertProducts(
        [parsed],
        getEnumKeyAsType(ScrapStatus, ScrapStatus.DETAILED) as ScrapStatus,
      );

      // Update state to IDLE + mark detailed timestamp
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

      // Generate embedding (fire-and-forget)
      this.productSaveService
        .generateAndSaveEmbedding(url)
        .catch((err) =>
          this.logger.error(`Embedding failed for ${url}: ${err.message}`),
        );

      this.logger.log(`Inline detail scrape succeeded for ${url}`);
    } catch (error) {
      this.logger.error(
        `Inline scrape error for ${productId}: ${error.message}`,
      );
      await this.updateScrapeState(
        productId,
        getEnumKeyAsType(ScrapeState, ScrapeState.FAILED) as ScrapeState,
      );
    } finally {
      await this.scrapeLock.releaseLock(productId);
    }
  }

  /**
   * Enqueue a BROWSER scrape job for Amazon products.
   */
  private async enqueueBrowserScrape(
    productId: string,
    url: string,
    retailer: string,
  ): Promise<void> {
    try {
      const domain = new URL(url).hostname.replace('www.', '');

      await this.productDetailQueue.add('scrape-detail', {
        jobId: `click-detail-${productId}-${Date.now()}`,
        products: [
          {
            url,
            domain,
            retailer: retailer as any,
          },
        ],
        createdAt: new Date(),
      });

      this.logger.log(
        `Queued browser detail scrape for ${retailer} product ${productId}`,
      );
    } catch (error) {
      this.logger.error(
        `Failed to enqueue browser scrape for ${productId}: ${error.message}`,
      );
      await this.updateScrapeState(
        productId,
        getEnumKeyAsType(ScrapeState, ScrapeState.FAILED) as ScrapeState,
      );
      await this.scrapeLock.releaseLock(productId);
    }
  }

  /**
   * Update the scrapeState and lastScrapeAttemptAt for a product.
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

  /**
   * Format product data for response.
   */
  private formatProductResponse(product: any) {
    return {
      id: product.id,
      title: product.title,
      description: product.description,
      brand: product.brand,
      category: product.category,
      price: product.price,
      retailer: product.retailer,
      productUrl: product.productUrl,
      images: product.images,
      color: product.color,
      size: product.size,
      inStock: product.inStock,
      scrapStatus: product.scrapStatus,
      scrapeState: product.scrapeState,
      lastDetailedScrapedAt:
        product.lastDetailedScrapedAt?.toISOString() ?? null,
    };
  }
}
