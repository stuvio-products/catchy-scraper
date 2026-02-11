import { Module } from '@nestjs/common';

import { ConfigModule } from '@nestjs/config';
import { FetchScraper } from './scrapers/fetch.scraper';
import { BrowserClientScraper } from './scrapers/browser-client.scraper';
import { ScrapeOrchestratorService } from './services/scrape-orchestrator.service';
import { ParserService } from './services/parser.service';
import { ScraperService } from './services/scraper.service';
import { ProductSaveService } from './services/product-save.service';
import { ScraperTelemetryService } from './services/scraper-telemetry.service';
import { ScrapeLockService } from './services/scrape-lock.service';
import { DomainModule } from '../domain/domain.module';
import { BrowserModule } from '../browser/browser.module';
import { PrismaModule } from '../prisma/prisma.module';
import { GeminiModule } from '../gemini/gemini.module';

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
  ],
})
export class ScrapingModule {}
