import { Injectable, Inject, forwardRef } from '@nestjs/common';
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
import { CrawlProgressService } from '@/shared/scraping/services/crawl-progress.service';
import { BrowserClientScraper } from '@/shared/scraping/scrapers/browser-client.scraper';
import { ScrapStatus, MessageRole } from '@prisma/client';
import { getEnumKeyAsType } from '@/shared/lib/util';
import { ChatService } from '@/apps/api/chat/chat.service';
import { randomUUID, createHash } from 'crypto';
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

interface EmbeddingCacheEntry {
  embedding: number[];
  timestamp: number;
  accessCount: number;
}

// ScrapeTrackingKey removed — scrape tracking is now in CrawlProgress DB table

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
export class SearchService {
  private readonly logger = new Logger(SearchService.name);

  // LRU-based embedding cache
  private readonly embeddingCache = new LRUCache<string, EmbeddingCacheEntry>(
    SEARCH_CONSTANTS.EMBEDDING_CACHE_MAX_SIZE,
  );

  // Track in-flight embedding requests to prevent concurrent generation
  private readonly embeddingInflight = new Map<string, Promise<number[]>>();

  constructor(
    @InjectQueue(QUEUE_NAMES.SCRAPE_QUEUE)
    private scrapeQueue: Queue<ScrapeJob>,
    private readonly fetchScraper: FetchScraper,
    private readonly prisma: PrismaService,
    private readonly geminiService: GeminiService,
    private readonly parserService: ParserService,
    private readonly productSaveService: ProductSaveService,
    private readonly crawlProgressService: CrawlProgressService,
    @Inject(forwardRef(() => ChatService))
    private readonly chatService: ChatService,
    private readonly browserClientScraper: BrowserClientScraper,
    private readonly intentParserService: IntentParserService,
  ) {}

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

    // 2. Merge Explicit Filters (override intent) — these are for DB filtering only, NOT retailer URLs
    const finalFilters = { ...intent.filters, ...explicitFilters };

    // 3. Create Chat Session — store the RAW user query, not normalized
    //    This ensures chat UI reflects exactly what the user typed
    const chat = await this.chatService.createChat(
      userId,
      query, // <-- raw query, not intent.normalizedQuery
      finalFilters,
      intent.confidence,
      'SEARCH',
    );

    // Note: createChat already persists the initial user message via repository

    // 4. Generate Embedding for the full query (with attributes) for later similarity expansion
    const embedding = await this.getOrGenerateEmbedding(query);

    // 5. Check if products already exist in DB
    const hasResults = await this.checkProductExistence(
      embedding,
      finalFilters,
      intent.confidence.overall,
    );

    let message = 'Here are the products matching your query';

    if (hasResults) {
      this.logger.log(
        `Products found in DB for "${query}". Enqueuing detailed checks.`,
      );
      await this.triggerRefreshesForTopResults(
        embedding,
        finalFilters,
        intent.confidence.overall,
      );
    } else {
      this.logger.log(
        `No products in DB for "${query}". Triggering LIVE search.`,
      );
      // Trigger Live Scrape using the RAW user query — retailers should get "white shirt", not "shirt"
      await this.scrapeLiveAndPersist(query);
      message = 'I found some new products for you from live search.';
    }

    // 6. Persist Assistant Message (AI Response)
    await this.chatService.addMessage(
      chat.id,
      getEnumKeyAsType(MessageRole, MessageRole.ASSISTANT) as MessageRole,
      message,
    );

    return { chatId: chat.id, message };
  }

  /**
   * Pagination & Result Retrieval (for ChatController)
   *
   * Cursor format: "score:id" composite string (e.g. "0.7230:cc164cd0-...")
   * pgvector-correct: WHERE (sim < :score) OR (sim = :score AND id > :id)
   */
  async searchWithState(
    chatState: ChatState,
    limit: number = SEARCH_CONSTANTS.RESULTS_PER_PAGE,
    cursor?: string,
  ) {
    const state = chatState as any;
    const { currentQuery, filters, intentConfidence } = state;

    if (!currentQuery) {
      throw new Error('Chat state missing query');
    }

    const confidence = (intentConfidence as any)?.overall ?? 0.5;
    const typedFilters = (filters as any) ?? {};
    const isFirstPage = !cursor;
    const safeLimit = Number(limit) || 20;

    // ======================================================================
    // FIRST PAGE: Lexical/keyword search — respects exact user intent
    // Uses OR logic across multiple text fields to avoid over-filtering.
    // Products scraped for "white shirt" may have "white" only in color
    // attribute, not in title — so we match ANY word in ANY text field.
    // ======================================================================
    if (isFirstPage) {
      // Build keyword search terms from the raw query
      const queryWords = currentQuery
        .toLowerCase()
        .trim()
        .split(/\s+/)
        .filter((w: string) => w.length > 1);

      // OR logic across title + description + brand + category + color + style_tags
      // Each word can match in ANY field — a product matching more words ranks higher
      let titleFilter = '';
      let matchScoreExpr = '0';
      if (queryWords.length > 0) {
        const wordConditions = queryWords.map((word: string) => {
          const escaped = word.replace(/'/g, "''");
          return `(
            p.title ILIKE '%${escaped}%' 
            OR p.description ILIKE '%${escaped}%' 
            OR p.brand ILIKE '%${escaped}%' 
            OR p.category ILIKE '%${escaped}%'
            OR EXISTS (SELECT 1 FROM unnest(p.color) col WHERE col ILIKE '%${escaped}%')
            OR EXISTS (SELECT 1 FROM unnest(p.style_tags) tag WHERE tag ILIKE '%${escaped}%')
          )`;
        });
        // Product must match ALL words (each word can be in any field)
        titleFilter = `AND (${wordConditions.join(' AND ')})`;

        // Score: count how many query words match (for ranking)
        const scoreTerms = queryWords.map((word: string) => {
          const escaped = word.replace(/'/g, "''");
          return `CASE WHEN 
            p.title ILIKE '%${escaped}%' 
            OR p.description ILIKE '%${escaped}%' 
            OR p.brand ILIKE '%${escaped}%' 
            OR p.category ILIKE '%${escaped}%'
            OR EXISTS (SELECT 1 FROM unnest(p.color) col WHERE col ILIKE '%${escaped}%')
            OR EXISTS (SELECT 1 FROM unnest(p.style_tags) tag WHERE tag ILIKE '%${escaped}%')
          THEN 1 ELSE 0 END`;
        });
        matchScoreExpr = scoreTerms.join(' + ');
      }

      // Apply only hard price filters (no color/category DB filtering — let text match handle it)
      let priceFilter = '';
      const pMin = typedFilters.priceMin ?? typedFilters.price_min;
      if (pMin != null && !isNaN(Number(pMin))) {
        priceFilter += ` AND p.price >= ${Number(pMin)}`;
      }
      const pMax = typedFilters.priceMax ?? typedFilters.price_max;
      if (pMax != null && !isNaN(Number(pMax))) {
        priceFilter += ` AND p.price <= ${Number(pMax)}`;
      }

      // Compute queryHash to scope results to products scraped for THIS query
      const queryHash = this.computeQueryHash(currentQuery);

      const lexicalSql = `
        SELECT
          p.id, p.title, p.description, p.brand, p.category, p.price,
          p.product_url AS "productUrl", p.images, p.retailer,
          p.scrap_status AS "scrapStatus", p.last_scraped AS "lastScraped",
          1.0 AS similarity, -- Force max similarity so Page 2 starts embedding search from top
          (${matchScoreExpr}) AS match_score,
          COUNT(*) OVER() AS total_count
        FROM products p
        INNER JOIN product_queries pq ON pq.product_id = p.id AND pq.query_hash = '${queryHash}'
        WHERE 1=1
        ${titleFilter}
        ${priceFilter}
        ORDER BY match_score DESC, pq.page_found ASC, pq.rank ASC, p.id ASC
        LIMIT ${safeLimit}
      `;

      this.logger.log(
        `[LEXICAL] First page query for "${currentQuery}": ${lexicalSql.replace(/\s+/g, ' ').trim().substring(0, 200)}...`,
      );

      const searchResults =
        await this.prisma.client.$queryRawUnsafe<
          Array<ProductSearchResult & { total_count: bigint }>
        >(lexicalSql);

      this.logger.log(
        `[LEXICAL] ${searchResults.length} results for "${currentQuery}" (first page, no cursor)`,
      );

      return this.processSearchResults(
        searchResults,
        safeLimit,
        currentQuery,
        true,
      );
    }

    // ======================================================================
    // SUBSEQUENT PAGES: Embedding similarity — for discovery & expansion
    // e.g. "white shirt" on page 2+ may show cream/off-white shirts
    // ======================================================================

    // Composite cursor: "score:id"
    let cursorClause = '';
    const sepIdx = cursor!.indexOf(':');
    if (sepIdx > 0) {
      const lastScore = Number(cursor!.substring(0, sepIdx));
      const lastId = cursor!.substring(sepIdx + 1);
      if (!isNaN(lastScore) && lastId) {
        const simExpr = `CASE WHEN p.embedding IS NOT NULL AND cs.last_embedding IS NOT NULL THEN COALESCE(1 - (p.embedding <=> cs.last_embedding), 0) ELSE 0 END`;
        cursorClause = ` AND (
          (${simExpr}) < ${lastScore}
          OR (
            (${simExpr}) = ${lastScore}
            AND p.id > '${lastId}'::uuid
          )
        )`;
      }
    }

    // Only apply price filters on later pages, not color/category (embedding handles semantic match)
    let priceFilter = '';
    const pMin = typedFilters.priceMin ?? typedFilters.price_min;
    if (pMin != null && !isNaN(Number(pMin))) {
      priceFilter += ` AND p.price >= ${Number(pMin)}`;
    }
    const pMax = typedFilters.priceMax ?? typedFilters.price_max;
    if (pMax != null && !isNaN(Number(pMax))) {
      priceFilter += ` AND p.price <= ${Number(pMax)}`;
    }

    const embeddingSql = `
      SELECT
        p.id, p.title, p.description, p.brand, p.category, p.price,
        p.product_url AS "productUrl", p.images, p.retailer,
        p.scrap_status AS "scrapStatus", p.last_scraped AS "lastScraped",
        CASE
          WHEN p.embedding IS NOT NULL AND cs.last_embedding IS NOT NULL
          THEN COALESCE(1 - (p.embedding <=> cs.last_embedding), 0)
          ELSE 0
        END AS similarity,
        COUNT(*) OVER() AS total_count
      FROM products p
      CROSS JOIN chat_state cs
      WHERE cs.chat_id = '${chatState.chatId}'::uuid
      AND p.embedding IS NOT NULL
      ${priceFilter}
      ${cursorClause}
      ORDER BY similarity DESC, p.id ASC
      LIMIT ${safeLimit}
    `;

    this.logger.log(
      `[EMBEDDING] Later page query for "${currentQuery}" (cursor: ${cursor})`,
    );

    const searchResults =
      await this.prisma.client.$queryRawUnsafe<
        Array<ProductSearchResult & { total_count: bigint }>
      >(embeddingSql);

    this.logger.log(
      `[EMBEDDING] ${searchResults.length} results for "${currentQuery}" ` +
        (searchResults.length > 0
          ? `| scores: ${searchResults[0].similarity.toFixed(4)}..${searchResults[searchResults.length - 1].similarity.toFixed(4)}`
          : ''),
    );

    return this.processSearchResults(
      searchResults,
      safeLimit,
      currentQuery,
      false,
    );
  }

  // ==========================================================================
  // HELPER METHODS
  // ==========================================================================

  /**
   * Process results: format products, build composite cursor, trigger fallback
   */
  private async processSearchResults(
    searchResults: Array<ProductSearchResult & { total_count: bigint }>,
    limit: number,
    query: string,
    isFirstPage: boolean,
  ) {
    const paginatedProducts = searchResults.map(
      ({ total_count, ...product }) => ({
        ...product,
        productUrl: product.productUrl,
        scrapStatus: product.scrapStatus,
        lastScraped: product.lastScraped,
        score: product.similarity,
      }),
    );

    const totalCount =
      searchResults.length > 0 ? Number(searchResults[0].total_count) : 0;

    // Composite cursor: "score:id" — pgvector stable pagination
    // Use totalCount (from COUNT(*) OVER()) to know if more rows exist beyond what LIMIT returned
    const lastResult = searchResults[searchResults.length - 1];
    const nextCursor: string | null =
      lastResult && totalCount > searchResults.length
        ? `${lastResult.similarity}:${lastResult.id}`
        : null;

    if (paginatedProducts.length === 0 && isFirstPage) {
      this.logger.log(
        `No products found via state search. Triggering live scrape fallback.`,
      );

      const allProducts = await this.scrapeLiveAndPersist(query);
      const sliced = allProducts.slice(0, limit);

      return {
        products: sliced.map((p) => ({ ...p, score: p.score ?? null })),
        total: allProducts.length,
        nextCursor: null, // Live results have no embedding scores yet
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
   * Check if products matching this query exist in the DB.
   * Uses embedding similarity — checks if any product has similarity >= 0.5
   */
  private async checkProductExistence(
    embedding: number[],
    filters: any,
    confidence: number,
  ): Promise<boolean> {
    const vectorString = `[${embedding.join(',')}]`;

    // Only apply price filters — don't filter by color/category/brand to avoid over-filtering
    let priceFilter = '';
    const pMin = filters.priceMin ?? filters.price_min;
    if (pMin != null && !isNaN(Number(pMin))) {
      priceFilter += ` AND price >= ${Number(pMin)}`;
    }
    const pMax = filters.priceMax ?? filters.price_max;
    if (pMax != null && !isNaN(Number(pMax))) {
      priceFilter += ` AND price <= ${Number(pMax)}`;
    }

    const result = await this.prisma.client.$queryRawUnsafe<any[]>(`
        SELECT 1 FROM products 
        WHERE embedding IS NOT NULL
        AND (1 - (embedding <=> '${vectorString}'::vector)) >= 0.5
        ${priceFilter}
        LIMIT 1
     `);

    this.logger.log(
      `checkProductExistence: ${result.length > 0 ? 'FOUND' : 'NONE'} matching products (confidence: ${confidence})`,
    );

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
   * Compute deterministic SHA-256 hash for a query string.
   * Uses the mechanical normalizeQuery() (not LLM output) for consistency.
   */
  computeQueryHash(query: string): string {
    return createHash('sha256')
      .update(this.normalizeQuery(query))
      .digest('hex');
  }

  /**
   * Background scrape multiple pages for all retailers with priority queuing.
   * Now driven by CrawlProgress DB — only scrapes pages beyond lastPage.
   * Public so ChatController can trigger when DB results are running low.
   */
  async backgroundScrapeNextPages(
    query: string,
    startPage: number,
    endPage: number,
  ): Promise<void> {
    const queryHash = this.computeQueryHash(query);
    const normalizedQuery = this.normalizeQuery(query);
    const jobs: Promise<any>[] = [];

    const allRetailers = [
      {
        name: RETAILERS.MYNTRA,
        domain: 'myntra.com',
        jobName: 'myntra-search',
        buildUrl: (q: string, p: number) =>
          `https://www.myntra.com/${encodeURIComponent(q)}?rawQuery=${encodeURIComponent(q)}&p=${p}`,
      },
      {
        name: RETAILERS.FLIPKART,
        domain: 'flipkart.com',
        jobName: 'flipkart-search',
        buildUrl: (q: string, p: number) =>
          `https://www.flipkart.com/search?q=${encodeURIComponent(q)}&page=${p}`,
      },
      {
        name: RETAILERS.MEESHO,
        domain: 'meesho.com',
        jobName: 'meesho-search',
        buildUrl: (q: string, _p: number) =>
          `https://www.meesho.com/search?q=${encodeURIComponent(q)}`,
      },
      {
        name: RETAILERS.AMAZON,
        domain: 'amazon.in',
        jobName: 'amazon-search',
        buildUrl: (q: string, p: number) =>
          `https://www.amazon.in/s?k=${encodeURIComponent(q)}&page=${p}`,
      },
    ];

    for (const retailer of allRetailers) {
      // Check CrawlProgress to determine which pages need scraping
      const progress = await this.crawlProgressService.getProgress(
        retailer.name,
        queryHash,
      );
      const lastScrapedPage = progress?.lastPage ?? 0;
      const isExhausted = progress?.exhausted ?? false;
      const isInProgress = progress?.status === 'IN_PROGRESS';

      if (isExhausted || isInProgress) {
        this.logger.debug(
          `Skipping ${retailer.name} for "${query}" — ${isExhausted ? 'exhausted' : 'in progress'}`,
        );
        continue;
      }

      for (
        let page = Math.max(startPage, lastScrapedPage + 1);
        page <= endPage;
        page++
      ) {
        const options: Record<string, any> = {
          timeout: SEARCH_CONSTANTS.SCRAPE_TIMEOUT_MS,
        };

        // Meesho needs scroll iterations
        if (retailer.name === RETAILERS.MEESHO) {
          options.scrollIterations =
            page === 1
              ? SEARCH_CONSTANTS.MEESHO_SCROLL_ITERATIONS_PAGE_1
              : SEARCH_CONSTANTS.MEESHO_SCROLL_ITERATIONS_PAGE_2 * page;
        }

        jobs.push(
          this.scrapeQueue
            .add(
              retailer.jobName,
              {
                jobId: `${retailer.name}-p${page}-${randomUUID()}`,
                url: retailer.buildUrl(query, page),
                domain: retailer.domain,
                options,
                createdAt: new Date(),
                queryHash,
                pageNumber: page,
              },
              { priority: JOB_PRIORITIES.PREFETCH_PAGE },
            )
            .catch((err) => {
              this.logger.error(
                `Failed to queue ${retailer.name} page ${page} for query "${query}": ${err.message}`,
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
   * Now uses CrawlProgress to avoid duplicate scrapes across users.
   */
  private async scrapeLiveAndPersist(query: string): Promise<any[]> {
    const queryHash = this.computeQueryHash(query);
    const normalizedQuery = this.normalizeQuery(query);

    // Check which retailers need page 1 scraping
    const myntraShouldScrape = await this.crawlProgressService.shouldScrape(
      RETAILERS.MYNTRA,
      queryHash,
    );
    const flipkartShouldScrape = await this.crawlProgressService.shouldScrape(
      RETAILERS.FLIPKART,
      queryHash,
    );

    const results = await Promise.allSettled([
      myntraShouldScrape
        ? this.scrapeLiveMyntra(query)
        : Promise.resolve([] as ParsedProduct[]),
      flipkartShouldScrape
        ? this.scrapeLiveFlipkart(query)
        : Promise.resolve([] as ParsedProduct[]),
    ]);

    // Background jobs for Amazon and Meesho (check CrawlProgress inside)
    this.scrapeLiveMeeshoIfNeeded(query, queryHash).catch((err) =>
      this.logger.error(`Background Meesho search failed: ${err.message}`),
    );
    this.queueLiveAmazonIfNeeded(query, queryHash).catch((err) =>
      this.logger.error(`Background Amazon search failed: ${err.message}`),
    );

    const allParsed: ParsedProduct[] = [];
    const retailerNames = [RETAILERS.MYNTRA, RETAILERS.FLIPKART];

    results.forEach((result, index) => {
      const retailer = retailerNames[index];
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
          getEnumKeyAsType(ScrapStatus, ScrapStatus.BASIC) as ScrapStatus,
        );

        // Link products to query for cross-chat reuse
        const productIds = persistedProducts.map((p) => p.id).filter(Boolean);

        // Group by retailer and link
        const byRetailer = new Map<string, string[]>();
        for (const p of persistedProducts) {
          const r = p.retailer || 'unknown';
          if (!byRetailer.has(r)) byRetailer.set(r, []);
          byRetailer.get(r)!.push(p.id);
        }
        for (const [retailer, ids] of byRetailer) {
          this.productSaveService
            .linkProductsToQuery(ids, queryHash, retailer, 1)
            .catch((err) =>
              this.logger.error(
                `Failed to link products to query: ${err.message}`,
              ),
            );
        }

        // Update CrawlProgress for each retailer that was scraped
        for (let i = 0; i < retailerNames.length; i++) {
          const retailer = retailerNames[i];
          const scraped = i === 0 ? myntraShouldScrape : flipkartShouldScrape;
          if (scraped && results[i].status === 'fulfilled') {
            const productsForRetailer = (
              results[i] as PromiseFulfilledResult<ParsedProduct[]>
            ).value.length;
            const progress = await this.crawlProgressService.findOrCreate(
              retailer,
              queryHash,
              normalizedQuery,
            );
            await this.crawlProgressService.markPageComplete(
              progress.id,
              productsForRetailer,
            );
            if (productsForRetailer === 0) {
              await this.crawlProgressService.markExhausted(progress.id);
            }
          }
        }

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
      scrapStatus: p.scrapStatus || 'BASIC',
      lastScraped: p.lastScraped,
      score: 0.99,
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

  /**
   * CrawlProgress-aware wrapper for Meesho background scraping.
   */
  private async scrapeLiveMeeshoIfNeeded(
    query: string,
    queryHash: string,
  ): Promise<void> {
    const shouldScrape = await this.crawlProgressService.shouldScrape(
      RETAILERS.MEESHO,
      queryHash,
    );
    if (!shouldScrape) {
      this.logger.debug(
        `Skipping Meesho live scrape for "${query}" — already scraped or in progress`,
      );
      return;
    }
    const products = await this.scrapeLiveMeesho(query);
    if (products.length > 0) {
      const persisted = await this.productSaveService.upsertProducts(
        products,
        getEnumKeyAsType(ScrapStatus, ScrapStatus.BASIC) as ScrapStatus,
      );
      const ids = persisted.map((p) => p.id).filter(Boolean);
      await this.productSaveService.linkProductsToQuery(
        ids,
        queryHash,
        RETAILERS.MEESHO,
        1,
      );
      const progress = await this.crawlProgressService.findOrCreate(
        RETAILERS.MEESHO,
        queryHash,
        this.normalizeQuery(query),
      );
      await this.crawlProgressService.markPageComplete(
        progress.id,
        products.length,
      );
    }
  }

  /**
   * CrawlProgress-aware wrapper for Amazon background queuing.
   */
  private async queueLiveAmazonIfNeeded(
    query: string,
    queryHash: string,
  ): Promise<void> {
    const shouldScrape = await this.crawlProgressService.shouldScrape(
      RETAILERS.AMAZON,
      queryHash,
    );
    if (!shouldScrape) {
      this.logger.debug(
        `Skipping Amazon queue for "${query}" — already scraped or in progress`,
      );
      return;
    }
    await this.queueLiveAmazon(query, queryHash);
  }

  private async queueLiveAmazon(
    query: string,
    queryHash?: string,
  ): Promise<void> {
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
        queryHash: queryHash || this.computeQueryHash(query),
        pageNumber: 1,
      },
      { priority: JOB_PRIORITIES.PREFETCH_PAGE },
    );
  }
}
