import { Injectable, Logger } from '@nestjs/common';
import {
  IScraper,
  ScrapeRequest,
  ScrapeResult,
} from '../interfaces/scraper.interface';
import { ScrapeStrategy } from '../../domain/enums/scrape-strategy.enum';
import { request } from 'undici';

@Injectable()
export class FetchScraper implements IScraper {
  private readonly logger = new Logger(FetchScraper.name);

  async scrape(scrapeRequest: ScrapeRequest): Promise<ScrapeResult> {
    const startTime = Date.now();
    const { url, domain, options } = scrapeRequest;

    try {
      this.logger.log(`Fetch scraping: ${url}`);

      const response = await request(url, {
        method: 'GET',
        headers: {
          'User-Agent':
            options?.userAgent ||
            'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
        },
        headersTimeout: options?.timeout || 10000,
      });

      const body = await response.body.text();
      const duration = Date.now() - startTime;
      const bytesUsed = Buffer.byteLength(body, 'utf8');

      this.logger.log(
        `Fetch completed for ${domain}: ${bytesUsed} bytes in ${duration}ms`,
      );

      return {
        success: true,
        data: body,
        metadata: {
          strategy: ScrapeStrategy.FETCH,
          bytesUsed,
          duration,
          timestamp: new Date(),
        },
      };
    } catch (error) {
      const duration = Date.now() - startTime;
      this.logger.error(`Fetch failed for ${url}: ${error.message}`);

      return {
        success: false,
        error: error.message,
        metadata: {
          strategy: ScrapeStrategy.FETCH,
          bytesUsed: 0,
          duration,
          timestamp: new Date(),
        },
      };
    }
  }
}
