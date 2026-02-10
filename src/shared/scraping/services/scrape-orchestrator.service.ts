import { Injectable, Logger } from '@nestjs/common';
import { DomainStrategyService } from '../../domain/services/domain-strategy.service';
import { ScrapeStrategy } from '../../domain/enums/scrape-strategy.enum';
import { FetchScraper } from '../scrapers/fetch.scraper';
import { BrowserClientScraper } from '../scrapers/browser-client.scraper';
import {
  ScrapeRequest,
  ScrapeResult,
} from '@/shared/scraping/interfaces/scraper.interface';
import { ScraperTelemetryService } from './scraper-telemetry.service';

@Injectable()
export class ScrapeOrchestratorService {
  private readonly logger = new Logger(ScrapeOrchestratorService.name);

  constructor(
    private readonly domainStrategy: DomainStrategyService,
    private readonly fetchScraper: FetchScraper,
    private readonly browserClientScraper: BrowserClientScraper,
    private readonly telemetry: ScraperTelemetryService,
  ) {}

  async scrape(request: ScrapeRequest): Promise<ScrapeResult> {
    // Resolve strategy: check for explicit override, otherwise use domain config
    const strategy =
      request.useStrategy || this.domainStrategy.getStrategy(request.domain);

    // Check if we should back off this domain due to high failure rate
    if (this.telemetry.shouldBackOff(request.domain)) {
      this.logger.warn(
        `Skipping scrape for ${request.domain} — domain is in backoff (failure rate > 50%)`,
      );
      return {
        success: false,
        error: `Domain ${request.domain} is in backoff due to high failure rate`,
        metadata: {
          strategy,
          bytesUsed: 0,
          duration: 0,
          timestamp: new Date(),
        },
      };
    }

    this.logger.log(
      `Orchestrating ${strategy} scrape for ${request.domain}: ${request.url}`,
    );

    // Route to appropriate scraper
    try {
      let result: ScrapeResult;

      if (strategy === ScrapeStrategy.FETCH) {
        result = await this.fetchScraper.scrape(request);
      } else {
        result = await this.browserClientScraper.scrape(request);
      }

      // Record telemetry
      if (result.success) {
        this.telemetry.recordSuccess(request.domain);
      } else {
        this.telemetry.recordFailure(request.domain);
      }

      this.logger.log(
        `Scrape ${result.success ? 'succeeded' : 'failed'} for ${request.domain}`,
      );

      return result;
    } catch (error) {
      this.telemetry.recordFailure(request.domain);
      this.logger.error(
        `Scrape orchestration failed for ${request.url}: ${error.message}`,
      );

      return {
        success: false,
        error: error.message,
        metadata: {
          strategy,
          bytesUsed: 0,
          duration: 0,
          timestamp: new Date(),
        },
      };
    }
  }
}
