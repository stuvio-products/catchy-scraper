import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '@/shared/prisma/prisma.service';
import { CrawlStatus } from '@/generated/prisma/client';
import { getEnumKeyAsType } from '@/shared/lib/util';

@Injectable()
export class CrawlProgressService {
  private readonly logger = new Logger(CrawlProgressService.name);

  constructor(private readonly prisma: PrismaService) {}

  /**
   * Find or create crawl progress for a retailer + query combination.
   * Uses upsert for concurrency safety (ON CONFLICT DO NOTHING semantics).
   */
  async findOrCreate(
    retailer: string,
    queryHash: string,
    normalizedQuery: string,
  ) {
    return this.prisma.client.crawlProgress.upsert({
      where: {
        retailer_queryHash: { retailer, queryHash },
      },
      update: {}, // no-op if exists
      create: {
        retailer,
        queryHash,
        normalizedQuery,
        status: getEnumKeyAsType(CrawlStatus, CrawlStatus.IDLE) as CrawlStatus,
      },
    });
  }

  /**
   * Get crawl progress for a retailer + query. Returns null if not found.
   */
  async getProgress(retailer: string, queryHash: string) {
    return this.prisma.client.crawlProgress.findUnique({
      where: {
        retailer_queryHash: { retailer, queryHash },
      },
    });
  }

  /**
   * Check if scraping should proceed for this retailer + query.
   * Returns false if already in progress or exhausted.
   */
  async shouldScrape(retailer: string, queryHash: string): Promise<boolean> {
    const progress = await this.getProgress(retailer, queryHash);
    if (!progress) return true; // never scraped
    if (progress.exhausted) return false;
    if (
      progress.status === getEnumKeyAsType(CrawlStatus, CrawlStatus.IN_PROGRESS)
    )
      return false;
    return true;
  }

  /**
   * Atomically claim the next page for scraping.
   * Sets status to IN_PROGRESS and returns the page number to scrape.
   * Uses WHERE status != IN_PROGRESS to prevent concurrent claims.
   */
  async claimNextPage(
    retailer: string,
    queryHash: string,
    normalizedQuery: string,
  ): Promise<{ progressId: string; pageNumber: number } | null> {
    // Ensure row exists
    const progress = await this.findOrCreate(
      retailer,
      queryHash,
      normalizedQuery,
    );

    // Atomic claim: only succeed if not already in-progress
    const result = await this.prisma.client.$queryRawUnsafe<
      Array<{ id: string; last_page: number }>
    >(
      `UPDATE crawl_progress
       SET status = 'in_progress', updated_at = NOW()
       WHERE id = $1::uuid AND status != 'in_progress' AND exhausted = false
       RETURNING id, last_page`,
      progress.id,
    );

    if (result.length === 0) {
      this.logger.debug(
        `Could not claim next page for ${retailer}/${queryHash} — already in progress or exhausted`,
      );
      return null;
    }

    const nextPage = result[0].last_page + 1;
    return { progressId: progress.id, pageNumber: nextPage };
  }

  /**
   * Mark a page as successfully completed.
   * Increments lastPage, adds to totalProducts, resets status to IDLE.
   */
  async markPageComplete(
    progressId: string,
    productsFound: number,
  ): Promise<void> {
    await this.prisma.client.$queryRawUnsafe(
      `UPDATE crawl_progress
       SET last_page = last_page + 1,
           total_products = total_products + $1,
           status = 'idle',
           last_crawled_at = NOW(),
           updated_at = NOW()
       WHERE id = $2::uuid`,
      productsFound,
      progressId,
    );
    this.logger.log(
      `Marked page complete for progress ${progressId}, +${productsFound} products`,
    );
  }

  /**
   * Mark a crawl as exhausted (retailer returned 0 new products).
   */
  async markExhausted(progressId: string): Promise<void> {
    await this.prisma.client.crawlProgress.update({
      where: { id: progressId },
      data: {
        exhausted: true,
        status: getEnumKeyAsType(
          CrawlStatus,
          CrawlStatus.COMPLETED,
        ) as CrawlStatus,
      },
    });
    this.logger.log(`Marked crawl progress ${progressId} as exhausted`);
  }

  /**
   * Mark a crawl as failed (reset to IDLE so it can be retried).
   */
  async markFailed(progressId: string): Promise<void> {
    await this.prisma.client.crawlProgress.update({
      where: { id: progressId },
      data: {
        status: getEnumKeyAsType(
          CrawlStatus,
          CrawlStatus.FAILED,
        ) as CrawlStatus,
      },
    });
  }

  /**
   * Update scroll offset for scroll-based retailers (e.g., Meesho).
   */
  async updateScrollOffset(
    progressId: string,
    scrollOffset: number,
  ): Promise<void> {
    await this.prisma.client.crawlProgress.update({
      where: { id: progressId },
      data: {
        scrollOffset,
        status: getEnumKeyAsType(CrawlStatus, CrawlStatus.IDLE) as CrawlStatus,
      },
    });
  }
}
