import { Injectable, Logger, OnModuleDestroy } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Pool } from 'undici';
import {
  IScraper,
  ScrapeRequest,
  ScrapeResult,
} from '@/shared/scraping/interfaces/scraper.interface';
import { ScrapeStrategy } from '@/shared/domain/enums/scrape-strategy.enum';

@Injectable()
export class BrowserClientScraper implements IScraper, OnModuleDestroy {
  private readonly logger = new Logger(BrowserClientScraper.name);
  private readonly client: Pool;
  private readonly apiKey: string;

  constructor(private readonly configService: ConfigService) {
    const port = this.configService.get<number>('BROWSER_SERVICE_PORT') || 3001;
    const browserServiceUrl = `http://browser-service:${port}`;

    this.apiKey =
      this.configService.get<string>('BROWSER_SERVICE_API_KEY') || '';
    if (!this.apiKey) {
      throw new Error('BROWSER_SERVICE_API_KEY must be configured');
    }

    // Initialize Undici Pool for high-performance connection reuse
    this.client = new Pool(browserServiceUrl, {
      connections: 100, // Support high concurrency
      pipelining: 0,
      keepAliveTimeout: 10000,
      keepAliveMaxTimeout: 10000,
    });
  }

  async onModuleDestroy() {
    await this.client.close();
  }

  async scrape(scrapeRequest: ScrapeRequest): Promise<ScrapeResult> {
    const startTime = Date.now();

    try {
      this.logger.log(
        `Requesting browser scrape from service: ${scrapeRequest.url}`,
      );

      const timeout = scrapeRequest.options?.timeout || 30000;

      const { statusCode, body } = await this.client.request({
        path: '/browser/scrape',
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-API-Key': this.apiKey,
        },
        body: JSON.stringify(scrapeRequest),
        headersTimeout: timeout,
        bodyTimeout: timeout,
      });

      // Parse JSON body securely
      const responseData = (await body.json()) as any;

      const duration = Date.now() - startTime;

      // Handle non-200 responses
      if (statusCode >= 400) {
        const errorMessage =
          responseData?.error ||
          responseData?.message ||
          `HTTP Error ${statusCode}`;
        throw new Error(errorMessage);
      }

      this.logger.log(
        `Browser scrape completed for ${scrapeRequest.domain} in ${duration}ms`,
      );

      return {
        ...responseData,
        metadata: {
          ...(responseData.metadata || {}),
          strategy: ScrapeStrategy.BROWSER,
          duration,
        },
      };
    } catch (error) {
      const duration = Date.now() - startTime;
      this.logger.error(
        `Browser scrape failed for ${scrapeRequest.url}: ${error.message}`,
      );

      return {
        success: false,
        error: error.message,
        metadata: {
          strategy: ScrapeStrategy.BROWSER,
          bytesUsed: 0,
          duration,
          timestamp: new Date(),
        },
      };
    }
  }
}
