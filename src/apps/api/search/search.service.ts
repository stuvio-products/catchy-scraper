import { Injectable } from '@nestjs/common';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import { QUEUE_NAMES } from '@/shared/queue/queue.constants';
import { ScrapeJob } from '@/shared/queue/interfaces/scrape-job.interface';
import { ScrapeStrategy } from '@/shared/domain/enums/scrape-strategy.enum';
import { Logger } from '@nestjs/common';
import { FetchScraper } from '@/shared/scraping/scrapers/fetch.scraper';
import { PrismaService } from '@/shared/prisma/prisma.service';
import { GeminiService } from '@/shared/gemini/gemini.service';
import { FlipkartParser } from '@/shared/scraping/scrapers/flipkart-parser';

@Injectable()
export class SearchService {
  private readonly logger = new Logger(SearchService.name);

  constructor(
    @InjectQueue(QUEUE_NAMES.SCRAPE_QUEUE)
    private scrapeQueue: Queue<ScrapeJob>,
    private readonly fetchScraper: FetchScraper,
    private readonly prisma: PrismaService,
    private readonly geminiService: GeminiService,
  ) {}

  async triggerUnifiedSearch(query: string) {
    const embedding = await this.geminiService.generateEmbedding(query);
    const vectorString = `[${embedding.join(',')}]`;

    // 1. Search DB first
    const dbProducts = (await this.prisma.client.$queryRaw`
      SELECT id, title, description, brand, category, price, product_url as "productUrl", images, retailer,
             1 - (embedding <=> ${vectorString}::vector) as similarity
      FROM products
      WHERE 1 - (embedding <=> ${vectorString}::vector) > 0.6
      ORDER BY similarity DESC
      LIMIT 20;
    `) as any[];

    if (dbProducts.length > 0) {
      this.logger.log(
        `Found ${dbProducts.length} products in DB. Triggering background refresh.`,
      );
      // Queue background refresh
      this.backgroundRefresh(query, 'myntra.com');
      this.backgroundRefresh(query, 'flipkart.com');

      return { source: 'database', products: dbProducts };
    }

    // 2. If no DB results, scrape sequentially
    this.logger.log(`No products in DB. Scraping live.`);

    //promise.all
    const [myntraProducts, flipkartProducts] = await Promise.all([
      this.scrapeLiveMyntra(query),
      this.scrapeLiveFlipkart(query),
    ]);

    const allProducts = [...myntraProducts, ...flipkartProducts];

    return {
      source: 'live_scrape',
      products: allProducts,
      total: allProducts.length,
    };
  }

  private backgroundRefresh(query: string, domain: string) {
    const url =
      domain === 'myntra.com'
        ? `https://www.myntra.com/${encodeURIComponent(query)}?rawQuery=${encodeURIComponent(query)}`
        : `https://www.flipkart.com/search?q=${encodeURIComponent(query)}`;

    this.scrapeQueue.add(`${domain.split('.')[0]}-search`, {
      jobId: `${domain.split('.')[0]}-refresh-${Date.now()}`,
      url,
      domain,
      options: { timeout: 30000 },
      createdAt: new Date(),
    });
  }

  // Reuse existing logic, moved to helper
  private async scrapeLiveMyntra(query: string) {
    const url = `https://www.myntra.com/${encodeURIComponent(query)}?rawQuery=${encodeURIComponent(query)}`;
    try {
      const result = await this.fetchScraper.scrape({
        url,
        domain: 'myntra.com',
        options: { userAgent: 'Mozilla/5.0 ...' },
      });

      if (result.success && result.data) {
        const products = this.parseMyntraData(result.data);
        // Queue save
        this.scrapeQueue.add('myntra-save', {
          jobId: `myntra-save-${Date.now()}`,
          url,
          domain: 'myntra.com',
          options: { timeout: 30000 },
          createdAt: new Date(),
        });
        return products;
      }
    } catch (e) {
      this.logger.error(`Myntra Live Scrape Failed: ${e.message}`);
    }
    return [];
  }

  private async scrapeLiveFlipkart(query: string) {
    const url = `https://www.flipkart.com/search?q=${encodeURIComponent(query)}`;
    try {
      const result = await this.fetchScraper.scrape({
        url,
        domain: 'flipkart.com',
        options: { userAgent: 'Mozilla/5.0 ...' },
      });

      if (result.success && result.data) {
        const products = FlipkartParser.parse(result.data);
        // Transform for API response
        const mappedProducts = products.map((p) => ({
          title: p.product_name,
          price: p.current_price,
          images: [p.thumbnail],
          productUrl: p.product_link,
          retailer: 'Flipkart',
        }));

        // Queue save (re-using the same job structure, worker handles parsing via same parser logic)
        // Ideally we pass "raw html" to worker to save, OR we let worker re-scrape.
        // To be consistent with "Search Logic Flow": we said "background save".
        // If we just mapped it here, we should probably save it here or send data to worker.
        // But simpler: just queue the URL for the worker to scrape & save.
        this.scrapeQueue.add('flipkart-save', {
          jobId: `flipkart-save-${Date.now()}`,
          url,
          domain: 'flipkart.com',
          options: { timeout: 30000 },
          createdAt: new Date(),
        });

        return mappedProducts;
      }
    } catch (e) {
      this.logger.error(`Flipkart Live Scrape Failed: ${e.message}`);
    }
    return [];
  }

  // Kept for backward compatibility or refactor
  async triggerMyntraSearch(query: string) {
    return this.triggerUnifiedSearch(query);
  }

  private parseMyntraData(htmlContent: string) {
    const startPattern = 'window.__myx = ';
    const startIndex = htmlContent.indexOf(startPattern);
    if (startIndex === -1) return [];

    const jsonStart = startIndex + startPattern.length;
    let braceCount = 0;
    let inString = false;
    let escapeNext = false;
    let endIndex = jsonStart;

    for (let i = jsonStart; i < htmlContent.length; i++) {
      const char = htmlContent[i];
      if (escapeNext) {
        escapeNext = false;
        continue;
      }
      if (char === '\\') {
        escapeNext = true;
        continue;
      }
      if (char === '"') {
        inString = !inString;
        continue;
      }
      if (!inString) {
        if (char === '{') braceCount++;
        if (char === '}') braceCount--;
        if (braceCount === 0) {
          endIndex = i + 1;
          break;
        }
      }
    }

    try {
      const jsonString = htmlContent.substring(jsonStart, endIndex);
      const jsonObject = JSON.parse(jsonString);
      const products = jsonObject?.searchData?.results?.products || [];

      return products.map((p: any) => ({
        title: p.productName,
        price: p.price,
        images: p.images ? p.images.map((img: any) => img.src) : [],
        productUrl: `https://www.myntra.com/${p.landingPageUrl}`,
        brand: p.brand,
        retailer: 'Myntra',
      }));
    } catch (e) {
      this.logger.error(`Error parsing Myntra JSON: ${e.message}`);
      return [];
    }
  }
}
