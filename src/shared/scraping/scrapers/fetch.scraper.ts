import { Injectable, Logger } from '@nestjs/common';
import {
  IScraper,
  ScrapeRequest,
  ScrapeResult,
} from '@/shared/scraping/interfaces/scraper.interface';
import { ScrapeStrategy } from '@/shared/domain/enums/scrape-strategy.enum';
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
            'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/119.0.0.0 Safari/537.36',
          Accept:
            'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8',
          'Accept-Language': 'en-US,en;q=0.9',
          'sec-ch-ua':
            '"Google Chrome";v="119", "Chromium";v="119", "Not?A_Brand";v="24"',
          'sec-ch-ua-mobile': '?0',
          'sec-ch-ua-platform': '"Windows"',
          'sec-fetch-dest': 'document',
          'sec-fetch-mode': 'navigate',
          'sec-fetch-site': 'none',
          'sec-fetch-user': '?1',
          'upgrade-insecure-requests': '1',
        },
        headersTimeout: options?.timeout || 30000,
      });

      if (response.statusCode >= 400) {
        throw new Error(`HTTP Error: ${response.statusCode}`);
      }

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
