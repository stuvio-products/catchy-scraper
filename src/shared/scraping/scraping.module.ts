import { Module } from '@nestjs/common';
import { FetchScraper } from '@/shared/scraping/scrapers/fetch.scraper';
import { BrowserClientScraper } from '@/shared/scraping/scrapers/browser-client.scraper';
import { ScrapeOrchestratorService } from '@/shared/scraping/services/scrape-orchestrator.service';
import { ParserService } from '@/shared/scraping/services/parser.service';
import { ScraperService } from '@/shared/scraping/services/scraper.service';
import { ProductSaveService } from '@/shared/scraping/services/product-save.service';
import { ScraperTelemetryService } from '@/shared/scraping/services/scraper-telemetry.service';
import { ScrapeLockService } from '@/shared/scraping/services/scrape-lock.service';
import { CrawlProgressService } from '@/shared/scraping/services/crawl-progress.service';
import { ChatCursorService } from '@/shared/scraping/services/chat-cursor.service';
import { DomainModule } from '@/shared/domain/domain.module';
import { BrowserModule } from '@/shared/browser/browser.module';
import { PrismaModule } from '@/shared/prisma/prisma.module';
import { GeminiModule } from '@/shared/gemini/gemini.module';

@Module({
  imports: [DomainModule, BrowserModule, PrismaModule, GeminiModule],
  providers: [
    FetchScraper,
    BrowserClientScraper,
    ScrapeOrchestratorService,
    ParserService,
    ScraperService,
    ProductSaveService,
    ScraperTelemetryService,
    ScrapeLockService,
    CrawlProgressService,
    ChatCursorService,
  ],
  exports: [
    FetchScraper,
    BrowserClientScraper,
    ScrapeOrchestratorService,
    ParserService,
    ScraperService,
    ProductSaveService,
    ScraperTelemetryService,
    ScrapeLockService,
    CrawlProgressService,
    ChatCursorService,
  ],
})
export class ScrapingModule {}
