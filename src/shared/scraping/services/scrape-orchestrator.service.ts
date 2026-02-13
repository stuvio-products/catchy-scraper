import { Injectable, Logger } from '@nestjs/common';
import { DomainStrategyService } from '../../domain/services/domain-strategy.service';
import { ScrapeStrategy } from '../../domain/enums/scrape-strategy.enum';
import { FetchScraper } from '../scrapers/fetch.scraper';
import { BrowserClientScraper } from '../scrapers/browser-client.scraper';
import {
  ScrapeRequest,
  ScrapeResult,
} from '@/shared/scraping/interfaces/scraper.interface';

@Injectable()
export class ScrapeOrchestratorService {
  private readonly logger = new Logger(ScrapeOrchestratorService.name);

  constructor(
    private readonly domainStrategy: DomainStrategyService,
    private readonly fetchScraper: FetchScraper,
    private readonly browserClientScraper: BrowserClientScraper,
  ) {}

  async scrape(request: ScrapeRequest): Promise<ScrapeResult> {
    // Resolve strategy
    const strategy = this.domainStrategy.getStrategy(request.domain);
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

      this.logger.log(
        `Scrape ${result.success ? 'succeeded' : 'failed'} for ${request.domain}`,
      );

      return result;
    } catch (error) {
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
