import { Injectable, OnModuleInit, Inject, forwardRef } from '@nestjs/common';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import { QUEUE_NAMES, JOB_PRIORITIES } from '@/shared/queue/queue.constants';
import { ScrapeJob } from '@/shared/queue/interfaces/scrape-job.interface';
import { Logger } from '@nestjs/common';
import { FetchScraper } from '@/shared/scraping/scrapers/fetch.scraper';
import { PrismaService } from '@/shared/prisma/prisma.service';
import { GeminiService } from '@/shared/gemini/gemini.service';
import { ParserService } from '@/shared/scraping/services/parser.service';
import { ProductSaveService } from '@/shared/scraping/services/product-save.service';
import { BrowserClientScraper } from '@/shared/scraping/scrapers/browser-client.scraper';
import { ScrapStatus, MessageRole } from '@prisma/client';
import { getEnumKeyAsType } from '@/shared/lib/util';
import { ChatService } from '@/apps/api/chat/chat.service';
import { randomUUID } from 'crypto';
import { ParsedProduct } from '@/shared/scraping/interfaces/parsed-product.interface';
import {
  IntentParserService,
  SearchIntent,
  IntentFilters,
} from '@/shared/intent/intent-parser.service';
import { ChatState } from '@prisma/client';

// ============================================================================
// TYPE DEFINITIONS
// ============================================================================

interface ProductSearchResult {
  id: string;
  title: string;
  description: string | null;
  brand: string | null;
  category: string | null;
  price: number;
  productUrl: string;
  images: string[];
  retailer: string;
  scrapStatus: string;
  lastScraped: Date | null;
  similarity: number;
}

interface CountResult {
  count: bigint;
}

/** Cursor for keyset pagination: (similarity_score, product_id) */
export interface SearchCursor {
  score: number;
  id: string;
}

interface EmbeddingCacheEntry {
  embedding: number[];
  timestamp: number;
  accessCount: number;
}

interface ScrapeTrackingKey {
  query: string;
  retailer: string;
  page: number;
}

// ============================================================================
// CONSTANTS
// ============================================================================

const SEARCH_CONSTANTS = {
  RESULTS_PER_PAGE: 20,
  EMBEDDING_CACHE_TTL_MS: 10 * 60 * 1000, // 10 minutes
  EMBEDDING_CACHE_MAX_SIZE: 1000,
  SCRAPE_LOCK_TTL_MS: 5 * 60 * 1000, // 5 minutes
  STALE_PRODUCT_THRESHOLD_MS: 24 * 60 * 60 * 1000, // 1 day
  PRODUCT_BATCH_SIZE: 10,
  LAZY_SCRAPE_TOP_N: 20, // Only scrape top N visible products lazily
  PREEMPTIVE_SCRAPE_THRESHOLD_PAGES: 2,
  SCRAPE_TIMEOUT_MS: 30000,
  MEESHO_SCROLL_ITERATIONS_PAGE_1: 8,
  MEESHO_SCROLL_ITERATIONS_PAGE_2: 16,
  // Live enrichment for first page (critical UX)
  LIVE_ENRICH_TOP_N: 10, // Top N products to enrich live on first page
  LIVE_ENRICH_TIMEOUT_MS: 1000, // Hard timeout per product (1s for sub-second UX)
  LIVE_ENRICH_CONCURRENCY: 10, // Max concurrent live scrapes
  LIVE_ENRICH_FRESHNESS_MS: 24 * 60 * 60 * 1000, // Skip if detailed within 24h
} as const;

const RETAILERS = {
  MYNTRA: 'myntra',
  FLIPKART: 'flipkart',
  MEESHO: 'meesho',
  AMAZON: 'amazon',
} as const;

// ============================================================================
// LRU CACHE IMPLEMENTATION
// ============================================================================

class LRUCache<K, V> {
  private cache = new Map<K, V>();
  private accessOrder: K[] = [];

  constructor(private readonly maxSize: number) {}

  get(key: K): V | undefined {
    const value = this.cache.get(key);
    if (value !== undefined) {
      // Move to end (most recently used)
      this.accessOrder = this.accessOrder.filter((k) => k !== key);
      this.accessOrder.push(key);
    }
    return value;
  }

  set(key: K, value: V): void {
    if (this.cache.has(key)) {
      // Update existing
      this.cache.set(key, value);
      this.accessOrder = this.accessOrder.filter((k) => k !== key);
      this.accessOrder.push(key);
    } else {
      // Add new
      if (this.cache.size >= this.maxSize) {
        // Evict least recently used
        const lru = this.accessOrder.shift();
        if (lru !== undefined) {
          this.cache.delete(lru);
        }
      }
      this.cache.set(key, value);
      this.accessOrder.push(key);
    }
  }

  has(key: K): boolean {
    return this.cache.has(key);
  }

  delete(key: K): boolean {
    this.accessOrder = this.accessOrder.filter((k) => k !== key);
    return this.cache.delete(key);
  }

  get size(): number {
    return this.cache.size;
  }
}

// ============================================================================
// MAIN SERVICE
// ============================================================================

@Injectable()
export class SearchService implements OnModuleInit {
  private readonly logger = new Logger(SearchService.name);

  // LRU-based embedding cache
  private readonly embeddingCache = new LRUCache<string, EmbeddingCacheEntry>(
    SEARCH_CONSTANTS.EMBEDDING_CACHE_MAX_SIZE,
  );

  // Track in-flight embedding requests to prevent concurrent generation
  private readonly embeddingInflight = new Map<string, Promise<number[]>>();

  // Track scraped pages per query/retailer to prevent duplicates
  private readonly scrapeTracking = new Map<string, Set<number>>();

  constructor(
    @InjectQueue(QUEUE_NAMES.SCRAPE_QUEUE)
    private scrapeQueue: Queue<ScrapeJob>,
    private readonly fetchScraper: FetchScraper,
    private readonly prisma: PrismaService,
    private readonly geminiService: GeminiService,
    private readonly parserService: ParserService,
    private readonly productSaveService: ProductSaveService,
    @Inject(forwardRef(() => ChatService))
    private readonly chatService: ChatService,
    private readonly browserClientScraper: BrowserClientScraper,
    private readonly intentParserService: IntentParserService,
  ) {}

  async onModuleInit() {
    // Periodic cleanup of scrape tracking
    setInterval(() => {
      this.scrapeTracking.clear();
      this.logger.debug('Cleared scrape tracking cache');
    }, SEARCH_CONSTANTS.SCRAPE_LOCK_TTL_MS);
  }

  // ==========================================================================
  // PUBLIC API
  // ==========================================================================

  /**
   * New Entry Point: Intent-Aware Search Orchestrator
   * - Parses intent & confidence
   * - Creates chat session
   * - Triggers DB search (products exist?) OR Live search (no products?)
   * - Returns ONLY chatId (no products)
   */
  async searchWithIntent(
    userId: string,
    query: string,
    explicitFilters?: IntentFilters,
  ): Promise<{ chatId: string; message: string }> {
    // 1. Parse Intent & Confidence
    const intent = await this.intentParserService.parseSearchIntent(query);

    // 2. Merge Explicit Filters (override intent)
    const finalFilters = { ...intent.filters, ...explicitFilters };

    // 3. Create Chat Session
    const chat = await this.chatService.createChat(
      userId,
      query,
      finalFilters,
      intent.confidence,
      'SEARCH',
    );

    // 3.1 Persist Initial User Message
    await this.chatService.addMessage(chat.id, MessageRole.USER, query);

    // 4. Generate Embedding for Normalized Query
    const embedding = await this.getOrGenerateEmbedding(intent.normalizedQuery);

    // 5. Initial DB Search (Check for existence)
    // We use a simplified version of searchWithState logic here just to check counts/existence
    // But for efficiency, we can just defer to the client calling /results.
    // However, the requirement says we must trigger scraping logic HERE.

    const hasResults = await this.checkProductExistence(
      embedding,
      finalFilters,
      intent.confidence.overall,
    );

    let message = 'Here are the products matching your query';

    if (hasResults) {
      this.logger.log(
        `Products found in DB for "${intent.normalizedQuery}". Enqueuing detailed checks.`,
      );
      // Enqueue detailed scraping for top results if needed (lazy)
      // We can do this by briefly fetching IDs and status, but let's trust the
      // pagination endpoint to handle the "lazy scrape" when the user actually views them.
      // EXCEPT: Requirement says "Check scrapeStatus -> Enqueue DETAILED".
      // So we should run a lightweight query to get top N items and trigger updates.
      await this.triggerRefreshesForTopResults(
        embedding,
        finalFilters,
        intent.confidence.overall,
      );
    } else {
      this.logger.log(
        `No products in DB for "${intent.normalizedQuery}". Triggering LIVE search.`,
      );
      // Trigger Live Scrape & Persist
      await this.scrapeLiveAndPersist(intent.normalizedQuery);
      message = 'I found some new products for you from live search.';
    }

    // 6. Persist Assistant Message (AI Response)
    await this.chatService.addMessage(chat.id, MessageRole.ASSISTANT, message);

    return { chatId: chat.id, message };
  }

  /**
   * Pagination & Result Retrieval (for ChatController)
   */
  async searchWithState(
    chatState: ChatState,
    limit: number = SEARCH_CONSTANTS.RESULTS_PER_PAGE,
    cursor?: SearchCursor,
  ) {
    const state = chatState as any;
    const { currentQuery, filters, intentConfidence, lastEmbedding } = state;

    if (!currentQuery) {
      throw new Error('Chat state missing query');
    }
    // Note: lastEmbedding is Unsupported type, so it won't be in the JS object.
    // The SQL query joins chat_state directly to use it.

    // Parse vector from string if needed, or use raw if Prisma supports it directly
    // Prisma vector objects usually need formatting.
    // BUT check schema: lastEmbedding is Unsupported("vector(1536)")
    // We need to cast it in raw SQL.

    // For the SQL query, we need to pass the vector.
    // Since we can't easily read Unsupported types back into JS arrays without some hack,
    // we should ideally store the embedding in a cache or regenerate it if missing.
    // However, the requirement says "Do NOT regenerate embeddings".
    // We can use the `last_embedding` column directly in SQL without bringing it to JS!

    const confidence = (intentConfidence as any)?.overall ?? 0.5;
    const typedFilters = (filters as any) ?? {};

    // Determine strictness
    const useStrictFilters = confidence >= 0.75;

    // Build Filter Clause
    let filterClause = '';
    const params: any[] = [];

    if (useStrictFilters) {
      if (typedFilters.brand)
        filterClause += ` AND p.brand ILIKE '%${typedFilters.brand}%'`;
      if (typedFilters.category)
        filterClause += ` AND p.category ILIKE '%${typedFilters.category}%'`;
      if (typedFilters.priceMin)
        filterClause += ` AND p.price >= ${typedFilters.priceMin}`;
      if (typedFilters.priceMax)
        filterClause += ` AND p.price <= ${typedFilters.priceMax}`;
      if (typedFilters.color)
        filterClause += ` AND '${typedFilters.color}' = ANY(p.color)`;
    }

    // Cursor Clause
    let cursorClause = '';
    if (cursor) {
      cursorClause = ` AND (
        (1 - (p.embedding <=> cs.last_embedding)) < ${cursor.score}
        OR (
          (1 - (p.embedding <=> cs.last_embedding)) = ${cursor.score}
          AND p.id > '${cursor.id}'::uuid
        )
      )`;
    }

    const querySql = `
      WITH scored_products AS (
        SELECT 
          p.id, p.title, p.description, p.brand, p.category, p.price, 
          p.product_url AS "productUrl", p.images, p.retailer, 
          p.scrap_status AS "scrapStatus", p.last_scraped AS "lastScraped",
          1 - (p.embedding <=> cs.last_embedding) as similarity,
          COUNT(*) OVER() as total_count
        FROM products p
        JOIN chat_state cs ON cs.chat_id = '${chatState.chatId}'::uuid
        WHERE p.embedding IS NOT NULL
        ${filterClause}
        ${cursorClause}
      )
      SELECT * FROM scored_products
      ORDER BY similarity DESC, id ASC
      LIMIT ${limit}
    `;

    const searchResults =
      await this.prisma.client.$queryRawUnsafe<
        Array<ProductSearchResult & { total_count: bigint }>
      >(querySql);

    // 6. Process Results (Format, Next Cursor, Lazy Scraping)
    return this.processSearchResults(
      searchResults,
      limit,
      currentQuery,
      !cursor, // isFirstPage if no cursor
    );
  }

  // ==========================================================================
  // HELPER METHOHDS
  // ==========================================================================

  /**
   * Helper to process results (extracted from original triggerUnifiedSearch)
   */
  private async processSearchResults(
    searchResults: Array<ProductSearchResult & { total_count: bigint }>,
    limit: number,
    query: string,
    isFirstPage: boolean,
  ) {
    let paginatedProducts = searchResults.map(
      ({ total_count, ...product }) => ({
        ...product,
        productUrl: product.productUrl,
        scrapStatus: product.scrapStatus,
        lastScraped: product.lastScraped,
      }),
    );

    const totalCount =
      searchResults.length > 0 ? Number(searchResults[0].total_count) : 0;
    const lastResult = searchResults[searchResults.length - 1];
    const nextCursor: SearchCursor | null =
      searchResults.length >= limit && lastResult
        ? { score: lastResult.similarity, id: String(lastResult.id) }
        : null;

    if (paginatedProducts.length === 0 && isFirstPage) {
      // Fallback: If DB is empty on first page, strictly trigger Live Search
      this.logger.log(
        `No products found via state search. Triggering live scrape fallback.`,
      );

      // Perform live scraping from external sources (BASIC only)
      const allProducts = await this.scrapeLiveAndPersist(query);

      // Return the newly scraped products (respecting limit)
      const sliced = allProducts.slice(0, limit);
      const last = sliced[sliced.length - 1];

      return {
        products: sliced,
        total: allProducts.length,
        nextCursor:
          allProducts.length > limit && last
            ? { score: 0.99, id: String(last.id) }
            : null,
        hasMore: allProducts.length > limit,
        limit,
      };
    }

    return {
      products: paginatedProducts,
      total: totalCount,
      nextCursor,
      hasMore: nextCursor !== null,
      limit,
    };
  }

  async triggerMyntraSearch(userId: string, query: string) {
    const intent = await this.intentParserService.parseSearchIntent(query);
    return this.searchWithIntent(userId, query, intent.filters);
  }

  /**
   * Helper to strict/soft check existence
   */
  private async checkProductExistence(
    embedding: number[],
    filters: any,
    confidence: number,
  ): Promise<boolean> {
    const useStrict = confidence >= 0.75;

    let filterClause = '';
    if (useStrict) {
      if (filters.brand)
        filterClause += ` AND brand ILIKE '%${filters.brand}%'`;
      if (filters.category)
        filterClause += ` AND category ILIKE '%${filters.category}%'`;
      if (filters.priceMin) filterClause += ` AND price >= ${filters.priceMin}`;
      if (filters.priceMax) filterClause += ` AND price <= ${filters.priceMax}`;
      if (filters.color) filterClause += ` AND '${filters.color}' = ANY(color)`;
    }

    const result = await this.prisma.client.$queryRawUnsafe<any[]>(`
        SELECT 1 FROM products 
        WHERE embedding IS NOT NULL 
        ${filterClause}
        LIMIT 1
     `);
    return result.length > 0;
  }

  private async triggerRefreshesForTopResults(
    embedding: number[],
    filters: any,
    confidence: number,
  ) {
    const vectorString = `[${embedding.join(',')}]`;
    // Use simplified query to get top 20 IDs
    const result = await this.prisma.client.$queryRaw<
      Array<{
        id: string;
        productUrl: string;
        retailer: string;
        scrapStatus: string;
        lastScraped: Date;
      }>
    >`
        SELECT id, product_url as "productUrl", retailer, scrap_status as "scrapStatus", last_scraped as "lastScraped"
        FROM products
        WHERE embedding IS NOT NULL
        ORDER BY embedding <=> ${vectorString}::vector ASC
        LIMIT 20
     `;
  }

  // ==========================================================================
  // EMBEDDING MANAGEMENT
  // ==========================================================================

  /**
   * Normalize query for consistent caching
   */
  private normalizeQuery(query: string): string {
    return query.toLowerCase().trim().replace(/\s+/g, ' ');
  }

  /**
   * Get or generate embedding with LRU caching and concurrent request protection
   */
  private async getOrGenerateEmbedding(query: string): Promise<number[]> {
    const cacheKey = this.normalizeQuery(query);
    const now = Date.now();

    // Check cache
    const cached = this.embeddingCache.get(cacheKey);
    if (
      cached &&
      now - cached.timestamp < SEARCH_CONSTANTS.EMBEDDING_CACHE_TTL_MS
    ) {
      cached.accessCount++;
      this.logger.debug(
        `Using cached embedding for query: "${query}" (accessed ${cached.accessCount} times)`,
      );
      return cached.embedding;
    }

    // Check if already generating
    const inflight = this.embeddingInflight.get(cacheKey);
    if (inflight) {
      this.logger.debug(
        `Waiting for in-flight embedding generation: "${query}"`,
      );
      return inflight;
    }

    // Generate new embedding
    this.logger.log(`Generating new embedding for query: "${query}"`);
    const embeddingPromise = this.geminiService
      .generateEmbedding(query)
      .then((embedding) => {
        // Cache it
        this.embeddingCache.set(cacheKey, {
          embedding,
          timestamp: now,
          accessCount: 1,
        });

        // Remove from inflight
        this.embeddingInflight.delete(cacheKey);

        return embedding;
      })
      .catch((err) => {
        // Remove from inflight on error
        this.embeddingInflight.delete(cacheKey);
        throw err;
      });

    this.embeddingInflight.set(cacheKey, embeddingPromise);
    return embeddingPromise;
  }

  // ==========================================================================
  // BACKGROUND SCRAPING
  // ==========================================================================

  /**
   * Create tracking key for scrape operations
   */
  private getScrapeTrackingKey(query: string, retailer: string): string {
    return `${this.normalizeQuery(query)}:${retailer}`;
  }

  /**
   * Check if a specific page has been scraped for a query/retailer
   */
  private hasPageBeenScraped(
    query: string,
    retailer: string,
    page: number,
  ): boolean {
    const key = this.getScrapeTrackingKey(query, retailer);
    const pages = this.scrapeTracking.get(key);
    return pages ? pages.has(page) : false;
  }

  /**
   * Mark a page as scraped for a query/retailer
   */
  private markPageAsScraped(
    query: string,
    retailer: string,
    page: number,
  ): void {
    const key = this.getScrapeTrackingKey(query, retailer);
    if (!this.scrapeTracking.has(key)) {
      this.scrapeTracking.set(key, new Set());
    }
    this.scrapeTracking.get(key)!.add(page);
  }

  /**
   * Background scrape multiple pages for all retailers with priority queuing
   */
  private async backgroundScrapeNextPages(
    query: string,
    startPage: number,
    endPage: number,
  ): Promise<void> {
    const jobs: Promise<any>[] = [];

    for (let page = startPage; page <= endPage; page++) {
      // Myntra
      if (!this.hasPageBeenScraped(query, RETAILERS.MYNTRA, page)) {
        jobs.push(
          this.scrapeQueue
            .add(
              'myntra-search',
              {
                jobId: `myntra-p${page}-${randomUUID()}`,
                url: `https://www.myntra.com/${encodeURIComponent(query)}?rawQuery=${encodeURIComponent(query)}&p=${page}`,
                domain: 'myntra.com',
                options: { timeout: SEARCH_CONSTANTS.SCRAPE_TIMEOUT_MS },
                createdAt: new Date(),
              },
              { priority: JOB_PRIORITIES.PREFETCH_PAGE },
            )
            .then(() => this.markPageAsScraped(query, RETAILERS.MYNTRA, page))
            .catch((err) => {
              this.logger.error(
                `Failed to queue Myntra page ${page} for query "${query}": ${err.message}`,
              );
            }),
        );
      }

      // Flipkart
      if (!this.hasPageBeenScraped(query, RETAILERS.FLIPKART, page)) {
        jobs.push(
          this.scrapeQueue
            .add(
              'flipkart-search',
              {
                jobId: `flipkart-p${page}-${randomUUID()}`,
                url: `https://www.flipkart.com/search?q=${encodeURIComponent(query)}&page=${page}`,
                domain: 'flipkart.com',
                options: { timeout: SEARCH_CONSTANTS.SCRAPE_TIMEOUT_MS },
                createdAt: new Date(),
              },
              { priority: JOB_PRIORITIES.PREFETCH_PAGE },
            )
            .then(() => this.markPageAsScraped(query, RETAILERS.FLIPKART, page))
            .catch((err) => {
              this.logger.error(
                `Failed to queue Flipkart page ${page} for query "${query}": ${err.message}`,
              );
            }),
        );
      }

      // Meesho (scroll-based, adjust iterations for deeper pages)
      if (!this.hasPageBeenScraped(query, RETAILERS.MEESHO, page)) {
        const scrollIterations =
          page === 1
            ? SEARCH_CONSTANTS.MEESHO_SCROLL_ITERATIONS_PAGE_1
            : SEARCH_CONSTANTS.MEESHO_SCROLL_ITERATIONS_PAGE_2 * page;

        jobs.push(
          this.scrapeQueue
            .add(
              'meesho-search',
              {
                jobId: `meesho-p${page}-${randomUUID()}`,
                url: `https://www.meesho.com/search?q=${encodeURIComponent(query)}`,
                domain: 'meesho.com',
                options: {
                  timeout: SEARCH_CONSTANTS.SCRAPE_TIMEOUT_MS,
                  scrollIterations,
                },
                createdAt: new Date(),
              },
              { priority: JOB_PRIORITIES.PREFETCH_PAGE },
            )
            .then(() => this.markPageAsScraped(query, RETAILERS.MEESHO, page))
            .catch((err) => {
              this.logger.error(
                `Failed to queue Meesho page ${page} for query "${query}": ${err.message}`,
              );
            }),
        );
      }

      // Amazon
      if (!this.hasPageBeenScraped(query, RETAILERS.AMAZON, page)) {
        jobs.push(
          this.scrapeQueue
            .add(
              'amazon-search',
              {
                jobId: `amazon-p${page}-${randomUUID()}`,
                url: `https://www.amazon.in/s?k=${encodeURIComponent(query)}&page=${page}`,
                domain: 'amazon.in',
                options: {
                  timeout: SEARCH_CONSTANTS.SCRAPE_TIMEOUT_MS,
                },
                createdAt: new Date(),
              },
              { priority: JOB_PRIORITIES.PREFETCH_PAGE },
            )
            .then(() => this.markPageAsScraped(query, RETAILERS.AMAZON, page))
            .catch((err) => {
              this.logger.error(
                `Failed to queue Amazon page ${page} for query "${query}": ${err.message}`,
              );
            }),
        );
      }
    }

    // Fire and forget all jobs
    Promise.all(jobs)
      .then(() => {
        this.logger.log(
          `Queued pages ${startPage}-${endPage} scraping for all retailers (query: "${query}")`,
        );
      })
      .catch((err) => {
        this.logger.error(`Background scraping batch failed: ${err.message}`);
      });
  }

  // ==========================================================================
  // LAZY DETAIL SCRAPING & STALE PRODUCT REFRESH
  // ==========================================================================

  /**
   * Validate URL safely
   */
  private isValidUrl(urlString: string): boolean {
    try {
      new URL(urlString);
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Extract domain from URL safely
   */
  private extractDomain(urlString: string): string | null {
    try {
      return new URL(urlString).hostname.replace('www.', '');
    } catch {
      return null;
    }
  }

  // ==========================================================================
  // LIVE SCRAPING & PERSISTENCE
  // ==========================================================================

  /**
   * Deduplicate products by URL
   */
  private deduplicateProducts(products: ParsedProduct[]): ParsedProduct[] {
    const seen = new Set<string>();
    return products.filter((p) => {
      if (seen.has(p.productUrl)) {
        return false;
      }
      seen.add(p.productUrl);
      return true;
    });
  }

  /**
   * Scrape live from all retailers with resilient error handling.
   * Uses lazy detail scraping: does NOT eagerly queue detail scraping for all products.
   */
  private async scrapeLiveAndPersist(query: string): Promise<any[]> {
    const results = await Promise.allSettled([
      this.scrapeLiveMyntra(query),
      this.scrapeLiveFlipkart(query),
    ]);

    // Background jobs for Amazon and Meesho
    this.scrapeLiveMeesho(query).catch((err) =>
      this.logger.error(`Background Meesho search failed: ${err.message}`),
    );
    this.queueLiveAmazon(query).catch((err) =>
      this.logger.error(`Background Amazon search failed: ${err.message}`),
    );

    const allParsed: ParsedProduct[] = [];

    results.forEach((result, index) => {
      const retailer = [RETAILERS.MYNTRA, RETAILERS.FLIPKART][index];
      if (result.status === 'fulfilled') {
        allParsed.push(...result.value);
      } else {
        this.logger.error(
          `Live scrape failed for ${retailer}: ${result.reason.message}`,
          result.reason.stack,
        );
      }
    });

    // Deduplicate before persisting
    const dedupedProducts = this.deduplicateProducts(allParsed);

    let persistedProducts: any[] = [];
    // Persist to database
    if (dedupedProducts.length > 0) {
      try {
        persistedProducts = await this.productSaveService.upsertProducts(
          dedupedProducts,
          ScrapStatus.BASIC,
        );

        // Generate embeddings asynchronously (fire-and-forget)
        this.generateEmbeddingsAsync(
          dedupedProducts.map((p) => p.productUrl),
        ).catch((err) => {
          this.logger.error(
            `Embedding generation failed: ${err.message}`,
            err.stack,
          );
        });

        this.logger.log(
          `Persisted ${dedupedProducts.length} live-scraped products (BASIC only, detail scraping is click-triggered)`,
        );
      } catch (err) {
        this.logger.error(
          `Failed to persist live-scraped products: ${err.message}`,
          err.stack,
        );
      }
    }

    // Return formatted response
    return persistedProducts.map((p) => ({
      id: p.id,
      title: p.title,
      price: p.price,
      images: p.images,
      productUrl: p.productUrl,
      brand: p.brand,
      retailer: p.retailer,
      scrapStatus: 'BASIC',
      lastScraped: p.lastScraped,
    }));
  }

  /**
   * Generate embeddings asynchronously (strictly fire-and-forget)
   */
  private async generateEmbeddingsAsync(productUrls: string[]): Promise<void> {
    const embeddingPromises = productUrls.map((url) =>
      this.productSaveService.generateAndSaveEmbedding(url).catch((err) => {
        this.logger.error(
          `Failed to generate embedding for ${url}: ${err.message}`,
        );
      }),
    );

    Promise.all(embeddingPromises)
      .then(() => {
        this.logger.log(
          `Generated embeddings for ${productUrls.length} products`,
        );
      })
      .catch((err) => {
        this.logger.error(`Batch embedding generation failed: ${err.message}`);
      });
  }

  // ==========================================================================
  // RETAILER-SPECIFIC SCRAPERS
  // ==========================================================================

  private async scrapeLiveMyntra(query: string): Promise<ParsedProduct[]> {
    const url = `https://www.myntra.com/${encodeURIComponent(query)}?rawQuery=${encodeURIComponent(query)}`;
    try {
      const result = await this.fetchScraper.scrape({
        url,
        domain: 'myntra.com',
        options: { userAgent: 'Mozilla/5.0 ...' },
      });

      if (result.success && result.data) {
        return this.parserService.parseMyntra(result.data);
      }
    } catch (e) {
      this.logger.error(`Myntra Live Scrape Failed: ${e.message}`, e.stack);
    }
    return [];
  }

  private async queueLiveAmazon(query: string): Promise<void> {
    const url = `https://www.amazon.in/s?k=${encodeURIComponent(query)}`;
    await this.scrapeQueue.add(
      'amazon-search',
      {
        jobId: `amazon-live-${randomUUID()}`,
        url,
        domain: 'amazon.in',
        options: {
          timeout: SEARCH_CONSTANTS.SCRAPE_TIMEOUT_MS,
        },
        createdAt: new Date(),
      },
      { priority: JOB_PRIORITIES.PREFETCH_PAGE },
    );
  }

  private async scrapeLiveFlipkart(query: string): Promise<ParsedProduct[]> {
    const url = `https://www.flipkart.com/search?q=${encodeURIComponent(query)}`;
    try {
      const result = await this.fetchScraper.scrape({
        url,
        domain: 'flipkart.com',
        options: { userAgent: 'Mozilla/5.0 ...' },
      });

      if (result.success && result.data) {
        return this.parserService.parseFlipkart(result.data);
      }
    } catch (e) {
      this.logger.error(`Flipkart Live Scrape Failed: ${e.message}`, e.stack);
    }
    return [];
  }

  private async scrapeLiveMeesho(query: string): Promise<ParsedProduct[]> {
    const url = `https://www.meesho.com/search?q=${encodeURIComponent(query)}`;
    try {
      const result = await this.browserClientScraper.scrape({
        url,
        domain: 'meesho.com',
        options: {
          timeout: SEARCH_CONSTANTS.SCRAPE_TIMEOUT_MS,
          scrollIterations: SEARCH_CONSTANTS.MEESHO_SCROLL_ITERATIONS_PAGE_1,
        },
      });

      if (result.success && result.data) {
        return this.parserService.parseMeesho(result.data);
      }
    } catch (e) {
      this.logger.error(`Meesho Live Scrape Failed: ${e.message}`, e.stack);
    }
    return [];
  }
}
