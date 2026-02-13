import { Injectable, Logger } from '@nestjs/common';
import { ScrapeOrchestratorService } from '@/shared/scraping/services/scrape-orchestrator.service';
import { ParserService } from '@/shared/scraping/services/parser.service';
import { ParsedProduct } from '@/shared/scraping/interfaces/parsed-product.interface';
import { Retailer } from '@/shared/scraping/types/retailer.type';

@Injectable()
export class ScraperService {
  private readonly logger = new Logger(ScraperService.name);

  constructor(
    private readonly orchestrator: ScrapeOrchestratorService,
    private readonly parser: ParserService,
  ) {}

  /**
   * Scrape a URL and parse the results based on domain
   */
  async scrapeAndParse(url: string, domain: string): Promise<ParsedProduct[]> {
    try {
      const result = await this.orchestrator.scrape({
        url,
        domain,
        options: { userAgent: 'Mozilla/5.0 ...' },
      });

      if (!result.success || !result.data) {
        this.logger.warn(`Scrape failed for ${url}: ${result.error}`);
        return [];
      }

      // Determine retailer from domain
      let retailer: Retailer | null = null;
      if (domain.includes('myntra.com')) {
        retailer = 'myntra';
      } else if (domain.includes('flipkart.com')) {
        retailer = 'flipkart';
      } else if (domain.includes('meesho.com')) {
        retailer = 'meesho';
      } else if (domain.includes('amazon.in')) {
        retailer = 'amazon';
      }

      if (!retailer) {
        this.logger.warn(`Unsupported domain: ${domain}`);
        return [];
      }

      return this.parser.parse(result.data, retailer);
    } catch (error) {
      this.logger.error(`Error scraping and parsing ${url}: ${error.message}`);
      return [];
    }
  }
}
