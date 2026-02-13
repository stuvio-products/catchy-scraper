import { Module } from '@nestjs/common';

import { ConfigModule } from '@nestjs/config';
import { DomainModule } from '@/shared/domain/domain.module';
import { FetchScraper } from './scrapers/fetch.scraper';
import { BrowserClientScraper } from './scrapers/browser-client.scraper';
import { ScrapeOrchestratorService } from './services/scrape-orchestrator.service';

@Module({
  imports: [ConfigModule, DomainModule],
  providers: [FetchScraper, BrowserClientScraper, ScrapeOrchestratorService],
  exports: [ScrapeOrchestratorService, FetchScraper],
})
export class ScrapingModule {}
