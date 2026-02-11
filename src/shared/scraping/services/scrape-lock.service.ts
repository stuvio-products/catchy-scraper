import { Injectable, Logger, Inject } from '@nestjs/common';
import { CACHE_MANAGER } from '@nestjs/cache-manager';
import { Cache } from 'cache-manager';

/**
 * Distributed scrape lock using Redis (via cache-manager).
 * Prevents duplicate concurrent detail scrapes for the same product.
 *
 * Key format: scrape:product:{productId}
 * TTL: 120 seconds (auto-release on crash/timeout)
 */
@Injectable()
export class ScrapeLockService {
  private readonly logger = new Logger(ScrapeLockService.name);
  private readonly LOCK_TTL_MS = 120_000; // 2 minutes
  private readonly KEY_PREFIX = 'scrape:product:';

  constructor(@Inject(CACHE_MANAGER) private readonly cache: Cache) {}

  /**
   * Attempt to acquire a scrape lock for a product.
   * Returns true if lock was acquired, false if already locked.
   */
  async acquireLock(productId: string): Promise<boolean> {
    const key = `${this.KEY_PREFIX}${productId}`;

    try {
      const existing = await this.cache.get(key);
      if (existing) {
        this.logger.debug(`Lock already held for product ${productId}`);
        return false;
      }

      await this.cache.set(key, Date.now(), this.LOCK_TTL_MS);
      this.logger.debug(`Lock acquired for product ${productId}`);
      return true;
    } catch (error) {
      this.logger.error(
        `Failed to acquire lock for ${productId}: ${error.message}`,
      );
      // Fail open — allow scrape if Redis is down
      return true;
    }
  }

  /**
   * Release the scrape lock for a product.
   */
  async releaseLock(productId: string): Promise<void> {
    const key = `${this.KEY_PREFIX}${productId}`;

    try {
      await this.cache.del(key);
      this.logger.debug(`Lock released for product ${productId}`);
    } catch (error) {
      this.logger.error(
        `Failed to release lock for ${productId}: ${error.message}`,
      );
    }
  }

  /**
   * Check if a product is currently locked (scrape in progress).
   */
  async isLocked(productId: string): Promise<boolean> {
    const key = `${this.KEY_PREFIX}${productId}`;

    try {
      const existing = await this.cache.get(key);
      return !!existing;
    } catch (error) {
      return false;
    }
  }
}
