import {
  Controller,
  Post,
  Get,
  Body,
  Logger,
  UseGuards,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import { BrowserPoolService } from '@/shared/browser/services/browser-pool.service';
import type { ScrapeRequest } from '@/shared/scraping/interfaces/scraper.interface';
import { BrowserServiceGuard } from '../guards/browser-service.guard';

@Controller('browser')
@UseGuards(BrowserServiceGuard)
export class BrowserController {
  private readonly logger = new Logger(BrowserController.name);

  constructor(private readonly browserPool: BrowserPoolService) {}

  @Post('scrape')
  @HttpCode(HttpStatus.OK)
  async scrape(@Body() request: ScrapeRequest) {
    const startTime = Date.now();
    const { url, domain, options } = request;

    this.logger.log(`Browser scrape request for: ${url}`);

    try {
      const { browser, proxy, browserId } =
        await this.browserPool.getBrowserForScraping(domain);

      // Create new context and page
      const context = await browser.newContext({
        userAgent:
          options?.userAgent ||
          'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
      });

      const page = await context.newPage();

      try {
        // Navigate to page
        await page.goto(url, {
          timeout: options?.timeout || 30000,
          waitUntil: 'networkidle',
        });

        // Wait for selector if specified
        if (options?.waitForSelector) {
          await page.waitForSelector(options.waitForSelector, {
            timeout: 10000,
          });
        }

        // Get HTML content
        const html = await page.content();

        // Screenshot if requested
        let screenshot: string | undefined;
        if (options?.screenshot) {
          const buffer = await page.screenshot({ type: 'png' });
          screenshot = buffer.toString('base64');
        }

        const duration = Date.now() - startTime;
        const bytesUsed = Buffer.byteLength(html, 'utf8');

        // Report success
        await this.browserPool.reportBrowserSuccess(browserId, bytesUsed);

        this.logger.log(
          `Browser scrape completed: ${domain} (${bytesUsed} bytes in ${duration}ms)`,
        );

        return {
          success: true,
          data: html,
          screenshot,
          metadata: {
            bytesUsed,
            duration,
            proxyId: proxy.id,
            timestamp: new Date(),
          },
        };
      } finally {
        // Always cleanup
        await page.close();
        await context.close();
      }
    } catch (error) {
      const duration = Date.now() - startTime;
      this.logger.error(`Browser scrape failed for ${url}: ${error.message}`);

      return {
        success: false,
        error: error.message,
        metadata: {
          bytesUsed: 0,
          duration,
          timestamp: new Date(),
        },
      };
    }
  }

  @Get('health')
  getHealth() {
    const stats = this.browserPool.getPoolStats();

    return {
      status: 'ok',
      timestamp: new Date().toISOString(),
      service: 'browser-service',
      browsers: stats,
    };
  }
}
