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
import { BrowserServiceGuard } from '@/apps/browser-service/guards/browser-service.guard';

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

    this.logger.log(
      `Browser scrape request for: ${url}, ${JSON.stringify(options)}`,
    );

    try {
      const { browser, proxy, browserId } =
        await this.browserPool.getBrowserForScraping(domain);

      // Create new context with realistic headers
      const context = await browser.newContext({
        userAgent:
          options?.userAgent ||
          'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/119.0.0.0 Safari/537.36',
        viewport: { width: 1920, height: 1080 },
        deviceScaleFactor: 1,
        extraHTTPHeaders: {
          'Accept-Language': 'en-US,en;q=0.9',
          Accept:
            'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8',
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
      });

      const page = await context.newPage();

      // Mask automation footprint
      await page.addInitScript(() => {
        Object.defineProperty(navigator, 'webdriver', {
          get: () => undefined,
        });
      });

      try {
        // Navigate to page
        await page.goto(url, {
          timeout: options?.timeout || 30000,
          waitUntil: 'domcontentloaded',
        });

        // Human-like wait and interaction
        await page.waitForTimeout(Math.floor(Math.random() * 2000) + 1000);

        // Simulate random mouse movements to trigger behavioral sensors
        for (let i = 0; i < 5; i++) {
          const x = Math.floor(Math.random() * 800);
          const y = Math.floor(Math.random() * 600);
          await page.mouse.move(x, y, { steps: 10 });
        }

        // Wait for selector if specified
        if (options?.waitForSelector) {
          try {
            await page.waitForSelector(options.waitForSelector, {
              timeout: 10000,
            });
          } catch (e) {
            this.logger.warn(
              `Selector ${options.waitForSelector} not found, proceeding anyway`,
            );
          }
        }

        // Handle scrolling for infinite scroll sites (e.g., Meesho)
        if (options?.scrollIterations && options.scrollIterations > 0) {
          const scrollConfig = {
            iterations: options.scrollIterations,
            scrollDistance: options.scrollDistance || 600,
            delayBetweenScrolls: options.delayBetweenScrolls || 400,
            finalDelay: 500,
          };

          this.logger.log(
            `Executing scroll: ${scrollConfig.iterations} iterations for ${domain}`,
          );

          await page.evaluate(async (config) => {
            for (let i = 0; i < config.iterations; i++) {
              window.scrollBy(0, config.scrollDistance);
              await new Promise((r) =>
                setTimeout(r, config.delayBetweenScrolls),
              );
            }
            // Final scroll to bottom
            window.scrollTo(0, document.body.scrollHeight);
            await new Promise((r) => setTimeout(r, config.finalDelay));
          }, scrollConfig);

          // Additional delay to allow content to load after scrolling
          await page.waitForTimeout(1000);
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
