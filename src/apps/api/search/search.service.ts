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
import { ScrapStatus, MessageRole } from '@/prisma/client';
import { getEnumKeyAsType } from '@/shared/lib/util';
import { ChatService } from '@/apps/api/chat/chat.service';
import { randomUUID, createHash } from 'crypto';
import { ParsedProduct } from '@/shared/scraping/interfaces/parsed-product.interface';
import {
  IntentParserService,
  SearchIntent,
  IntentFilters,
} from '@/shared/intent/intent-parser.service';
import { IntentInterpreterService } from '@/shared/intent/intent-interpreter.service';
import {
  StructuredIntent,
  IntentType,
  OutfitSlots,
} from '@/shared/intent/intent-types';
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
  lexicalScore?: number;
  semanticScore?: number;
  popularity?: number;
  rating?: number;
}

interface CountResult {
  count: bigint;
}

interface EmbeddingCacheEntry {
  embedding: number[];
  timestamp: number;
  accessCount: number;
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
  LAZY_SCRAPE_TOP_N: 20,
  PREEMPTIVE_SCRAPE_THRESHOLD_PAGES: 2,
  SCRAPE_TIMEOUT_MS: 30000,
  MEESHO_SCROLL_ITERATIONS_PAGE_1: 8,
  MEESHO_SCROLL_ITERATIONS_PAGE_2: 16,
  LIVE_ENRICH_TOP_N: 10,
  LIVE_ENRICH_TIMEOUT_MS: 1000,
  LIVE_ENRICH_CONCURRENCY: 10,
  LIVE_ENRICH_FRESHNESS_MS: 24 * 60 * 60 * 1000,
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
      this.accessOrder = this.accessOrder.filter((k) => k !== key);
      this.accessOrder.push(key);
    }
    return value;
  }

  set(key: K, value: V): void {
    if (this.cache.has(key)) {
      this.cache.set(key, value);
      this.accessOrder = this.accessOrder.filter((k) => k !== key);
      this.accessOrder.push(key);
    } else {
      if (this.cache.size >= this.maxSize) {
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

  private readonly embeddingCache = new LRUCache<string, EmbeddingCacheEntry>(
    SEARCH_CONSTANTS.EMBEDDING_CACHE_MAX_SIZE,
  );

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
    private readonly intentInterpreterService: IntentInterpreterService,
  ) {}

  // ==========================================================================
  // PUBLIC API
  // ==========================================================================

  /**
   * Intent-Aware Search Orchestrator (DB-ONLY — no live scraping in this path)
   *
   * 1. Interprets intent via 3-stage pipeline
   * 2. Creates chat session
   * 3. Searches DB catalog
   * 4. If no results → returns catalogStatus: 'learning' + triggers background enrichment
   * 5. If multi-slot → runs parallel slot queries
   */
  async searchWithIntent(
    userId: string,
    query: string,
    explicitFilters?: IntentFilters,
  ): Promise<{
    chatId: string;
    message: string;
    catalogStatus?: string;
    intentType?: string;
    confidence?: number;
    slotOrder?: string[];
    slotResults?: Record<string, any>;
  }> {
    // 1. Interpret Intent via 3-stage pipeline
    const intent = await this.intentInterpreterService.interpret(query);

    // 2. Build filters from intent attributes + explicit overrides
    const intentFilters: IntentFilters = {
      priceMin: intent.attributes.priceMin,
      priceMax: intent.attributes.priceMax,
      color: intent.attributes.color,
      category: intent.attributes.category,
      brand: intent.attributes.brand,
    };
    const finalFilters = { ...intentFilters, ...explicitFilters };

    // 3. Create Chat Session — store the RAW user query
    const chat = await this.chatService.createChat(
      userId,
      query,
      finalFilters,
      { overall: intent.confidence },
      'SEARCH',
    );

    // 4. Generate embedding for similarity search
    const embedding = await this.getOrGenerateEmbedding(query);

    // 5. Check if products exist in DB
    const hasResults = await this.checkProductExistence(
      embedding,
      finalFilters,
      intent.confidence,
    );

    let message = 'Here are the products matching your query';
    let catalogStatus: string | undefined;

    if (hasResults) {
      this.logger.log(
        `Products found in DB for "${query}" (intent: ${intent.type}, resolved by: ${intent.resolvedBy}).`,
      );

      // If multi-slot intent → parallel slot search
      if (intent.slots && Object.keys(intent.slots).length > 1) {
        const slotResults = await this.searchSlots(intent.slots, finalFilters);
        const slotOrder = Object.keys(intent.slots).filter(
          (k) => intent.slots![k as keyof OutfitSlots],
        );

        await this.chatService.addMessage(
          chat.id,
          getEnumKeyAsType(MessageRole, MessageRole.ASSISTANT) as MessageRole,
          message,
        );

        return {
          chatId: chat.id,
          message,
          intentType: intent.type,
          confidence: intent.confidence,
          slotOrder,
          slotResults,
        };
      }
    } else {
      this.logger.log(
        `No products in DB for "${query}". Triggering background enrichment.`,
      );
      message = "We're adding items for this search";
      catalogStatus = 'learning';

      // Trigger background scraping for catalog enrichment (fire-and-forget)
      this.backgroundScrapeNextPages(query, 1, 2).catch((err) =>
        this.logger.error(
          `Background enrichment failed for "${query}": ${err.message}`,
        ),
      );
    }

    // 6. Persist Assistant Message
    await this.chatService.addMessage(
      chat.id,
      getEnumKeyAsType(MessageRole, MessageRole.ASSISTANT) as MessageRole,
      message,
    );

    return {
      chatId: chat.id,
      message,
      catalogStatus,
      intentType: intent.type,
      confidence: intent.confidence,
    };
  }

  /**
   * Pagination & Result Retrieval (for ChatController)
   *
   * First page: tsvector full-text search (ts_rank)
   * Subsequent pages: embedding similarity (cosine)
   *
   * Returns ranking signals: lexicalScore, semanticScore, popularity, rating
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

    const typedFilters = (filters as any) ?? {};
    const isFirstPage = !cursor;
    const safeLimit = Number(limit) || 20;

    // ======================================================================
    // FIRST PAGE: Full-text search using tsvector (ts_rank)
    // Weighted: A → title/category, B → brand/color/gender/material/fit/style, C → description
    // ======================================================================
    if (isFirstPage) {
      // Build tsquery from user query
      const queryWords = currentQuery
        .toLowerCase()
        .trim()
        .split(/\s+/)
        .filter((w: string) => w.length > 1);

      // Construct plainto_tsquery for full-text matching
      const tsQueryString = queryWords.join(' & ');

      // Build filter clauses
      let filterClauses = '';

      const pMin = typedFilters.priceMin ?? typedFilters.price_min;
      if (pMin != null && !isNaN(Number(pMin))) {
        filterClauses += ` AND p.price >= ${Number(pMin)}`;
      }
      const pMax = typedFilters.priceMax ?? typedFilters.price_max;
      if (pMax != null && !isNaN(Number(pMax))) {
        filterClauses += ` AND p.price <= ${Number(pMax)}`;
      }
      if (typedFilters.gender) {
        const escapedGender = typedFilters.gender.replace(/'/g, "''");
        filterClauses += ` AND p.gender = '${escapedGender}'`;
      }

      const queryHash = this.computeQueryHash(currentQuery);

      // ts_rank gives lexical relevance score; also include popularity & rating
      const lexicalSql = `
        SELECT
          p.id, p.title, p.description, p.brand, p.category, p.price,
          p.product_url AS "productUrl", p.images, p.retailer,
          p.scrap_status AS "scrapStatus", p.last_scraped AS "lastScraped",
          p.popularity, p.rating,
          ts_rank(p.tsv, to_tsquery('english', '${tsQueryString}')) AS "lexicalScore",
          1.0 AS similarity,
          COUNT(*) OVER() AS total_count
        FROM products p
        LEFT JOIN product_queries pq ON pq.product_id = p.id AND pq.query_hash = '${queryHash}'
        WHERE p.tsv @@ to_tsquery('english', '${tsQueryString}')
        ${filterClauses}
        ORDER BY "lexicalScore" DESC, p.popularity DESC, pq.page_found ASC NULLS LAST, pq.rank ASC NULLS LAST, p.id ASC
        LIMIT ${safeLimit}
      `;

      this.logger.log(`[LEXICAL/TSV] First page query for "${currentQuery}"`);

      const searchResults =
        await this.prisma.client.$queryRawUnsafe<
          Array<ProductSearchResult & { total_count: bigint }>
        >(lexicalSql);

      this.logger.log(
        `[LEXICAL/TSV] ${searchResults.length} results for "${currentQuery}" (first page)`,
      );

      // If tsvector returns nothing, fall back to ILIKE for partial matches
      if (searchResults.length === 0 && queryWords.length > 0) {
        return this.fallbackILikeSearch(
          currentQuery,
          queryWords,
          queryHash,
          filterClauses,
          safeLimit,
        );
      }

      return this.processSearchResults(
        searchResults,
        safeLimit,
        currentQuery,
        true,
      );
    }

    // ======================================================================
    // SUBSEQUENT PAGES: Embedding similarity
    // ======================================================================

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
        p.popularity, p.rating,
        CASE
          WHEN p.embedding IS NOT NULL AND cs.last_embedding IS NOT NULL
          THEN COALESCE(1 - (p.embedding <=> cs.last_embedding), 0)
          ELSE 0
        END AS similarity,
        CASE
          WHEN p.embedding IS NOT NULL AND cs.last_embedding IS NOT NULL
          THEN COALESCE(1 - (p.embedding <=> cs.last_embedding), 0)
          ELSE 0
        END AS "semanticScore",
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
  // SLOT-BASED MULTI-QUERY RETRIEVAL
  // ==========================================================================

  /**
   * Run parallel searches for each outfit slot.
   * Returns grouped results by slot key.
   */
  private async searchSlots(
    slots: OutfitSlots,
    filters: IntentFilters,
  ): Promise<Record<string, any>> {
    const slotEntries = Object.entries(slots).filter(([, query]) => !!query);
    const results = await Promise.allSettled(
      slotEntries.map(async ([slotKey, slotQuery]) => {
        const products = await this.searchCatalogForSlot(slotQuery!, filters);
        return { slotKey, products };
      }),
    );

    const grouped: Record<string, any> = {};
    for (const result of results) {
      if (result.status === 'fulfilled') {
        grouped[result.value.slotKey] = result.value.products;
      } else {
        this.logger.error(`Slot search failed: ${result.reason?.message}`);
      }
    }
    return grouped;
  }

  /**
   * Search catalog for a single slot query (simplified DB search).
   */
  private async searchCatalogForSlot(
    slotQuery: string,
    filters: IntentFilters,
    limit: number = 10,
  ) {
    const queryWords = slotQuery
      .toLowerCase()
      .trim()
      .split(/\s+/)
      .filter((w) => w.length > 1);

    if (queryWords.length === 0) return [];

    const tsQueryString = queryWords.join(' & ');

    let filterClauses = '';
    if (filters.priceMin != null) {
      filterClauses += ` AND p.price >= ${Number(filters.priceMin)}`;
    }
    if (filters.priceMax != null) {
      filterClauses += ` AND p.price <= ${Number(filters.priceMax)}`;
    }

    const sql = `
      SELECT
        p.id, p.title, p.brand, p.category, p.price,
        p.product_url AS "productUrl", p.images, p.retailer,
        p.popularity, p.rating,
        ts_rank(p.tsv, to_tsquery('english', '${tsQueryString}')) AS "lexicalScore"
      FROM products p
      WHERE p.tsv @@ to_tsquery('english', '${tsQueryString}')
      ${filterClauses}
      ORDER BY "lexicalScore" DESC, p.popularity DESC
      LIMIT ${limit}
    `;

    try {
      return await this.prisma.client.$queryRawUnsafe(sql);
    } catch (err) {
      this.logger.error(`Slot query "${slotQuery}" failed: ${err.message}`);
      return [];
    }
  }

  // ==========================================================================
  // HELPER METHODS
  // ==========================================================================

  /**
   * Fallback ILIKE search for when tsvector doesn't match
   * (e.g. partial/fuzzy terms that stemming can't handle)
   */
  private async fallbackILikeSearch(
    currentQuery: string,
    queryWords: string[],
    queryHash: string,
    filterClauses: string,
    limit: number,
  ) {
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
    const titleFilter = `AND (${wordConditions.join(' AND ')})`;

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
    const matchScoreExpr = scoreTerms.join(' + ');

    const fallbackSql = `
      SELECT
        p.id, p.title, p.description, p.brand, p.category, p.price,
        p.product_url AS "productUrl", p.images, p.retailer,
        p.scrap_status AS "scrapStatus", p.last_scraped AS "lastScraped",
        p.popularity, p.rating,
        (${matchScoreExpr})::float / ${queryWords.length} AS "lexicalScore",
        1.0 AS similarity,
        COUNT(*) OVER() AS total_count
      FROM products p
      LEFT JOIN product_queries pq ON pq.product_id = p.id AND pq.query_hash = '${queryHash}'
      WHERE 1=1
      ${titleFilter}
      ${filterClauses}
      ORDER BY "lexicalScore" DESC, p.popularity DESC, pq.page_found ASC NULLS LAST, p.id ASC
      LIMIT ${limit}
    `;

    this.logger.log(`[ILIKE FALLBACK] for "${currentQuery}"`);

    const searchResults =
      await this.prisma.client.$queryRawUnsafe<
        Array<ProductSearchResult & { total_count: bigint }>
      >(fallbackSql);

    this.logger.log(
      `[ILIKE FALLBACK] ${searchResults.length} results for "${currentQuery}"`,
    );

    return this.processSearchResults(searchResults, limit, currentQuery, true);
  }

  /**
   * Process results: format products, build composite cursor, return with ranking signals.
   * NO live scrape fallback — returns empty with catalogStatus if no results.
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
        lexicalScore: product.lexicalScore ?? null,
        semanticScore: product.semanticScore ?? null,
        popularity: product.popularity ?? 0,
        rating: product.rating ?? 0,
      }),
    );

    const totalCount =
      searchResults.length > 0 ? Number(searchResults[0].total_count) : 0;

    const lastResult = searchResults[searchResults.length - 1];
    const nextCursor: string | null =
      lastResult && totalCount > searchResults.length
        ? `${lastResult.similarity}:${lastResult.id}`
        : null;

    // NO live scrape fallback — return empty with catalog status
    if (paginatedProducts.length === 0 && isFirstPage) {
      this.logger.log(
        `No products found for "${query}". Returning empty with catalogStatus.`,
      );

      // Trigger background enrichment (fire-and-forget)
      this.backgroundScrapeNextPages(query, 1, 2).catch((err) => {
        this.logger.error(`Background enrichment failed: ${err.message}`);
      });

      return {
        products: [],
        total: 0,
        nextCursor: null,
        hasMore: false,
        limit,
        catalogStatus: 'learning',
        message: "We're adding items for this search",
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
   * Check product existence using embedding similarity.
   */
  private async checkProductExistence(
    embedding: number[],
    filters: any,
    confidence: number,
  ): Promise<boolean> {
    const vectorString = `[${embedding.join(',')}]`;

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

  private normalizeQuery(query: string): string {
    return query.toLowerCase().trim().replace(/\s+/g, ' ');
  }

  private async getOrGenerateEmbedding(query: string): Promise<number[]> {
    const cacheKey = this.normalizeQuery(query);
    const now = Date.now();

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

    const inflight = this.embeddingInflight.get(cacheKey);
    if (inflight) {
      this.logger.debug(
        `Waiting for in-flight embedding generation: "${query}"`,
      );
      return inflight;
    }

    this.logger.log(`Generating new embedding for query: "${query}"`);
    const embeddingPromise = this.geminiService
      .generateEmbedding(query)
      .then((embedding) => {
        this.embeddingCache.set(cacheKey, {
          embedding,
          timestamp: now,
          accessCount: 1,
        });
        this.embeddingInflight.delete(cacheKey);
        return embedding;
      })
      .catch((err) => {
        this.embeddingInflight.delete(cacheKey);
        throw err;
      });

    this.embeddingInflight.set(cacheKey, embeddingPromise);
    return embeddingPromise;
  }

  // ==========================================================================
  // BACKGROUND SCRAPING (kept intact — decoupled from search path)
  // ==========================================================================

  computeQueryHash(query: string): string {
    return createHash('sha256')
      .update(this.normalizeQuery(query))
      .digest('hex');
  }

  /**
   * Background scrape multiple pages for all retailers with priority queuing.
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
  // LAZY DETAIL SCRAPING & STALE PRODUCT REFRESH (kept intact)
  // ==========================================================================

  private isValidUrl(urlString: string): boolean {
    try {
      new URL(urlString);
      return true;
    } catch {
      return false;
    }
  }

  private extractDomain(urlString: string): string | null {
    try {
      return new URL(urlString).hostname.replace('www.', '');
    } catch {
      return null;
    }
  }

  // ==========================================================================
  // LIVE SCRAPING & PERSISTENCE (kept intact — but NOT called from search path)
  // These methods remain for background catalog enrichment and other callers.
  // ==========================================================================

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

  private async scrapeLiveAndPersist(query: string): Promise<any[]> {
    const queryHash = this.computeQueryHash(query);
    const normalizedQuery = this.normalizeQuery(query);

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

    const dedupedProducts = this.deduplicateProducts(allParsed);

    let persistedProducts: any[] = [];
    if (dedupedProducts.length > 0) {
      try {
        persistedProducts = await this.productSaveService.upsertProducts(
          dedupedProducts,
          getEnumKeyAsType(ScrapStatus, ScrapStatus.BASIC) as ScrapStatus,
        );

        const productIds = persistedProducts.map((p) => p.id).filter(Boolean);

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

        this.generateEmbeddingsAsync(
          dedupedProducts.map((p) => p.productUrl),
        ).catch((err) => {
          this.logger.error(
            `Embedding generation failed: ${err.message}`,
            err.stack,
          );
        });

        this.logger.log(
          `Persisted ${dedupedProducts.length} live-scraped products (BASIC only)`,
        );
      } catch (err) {
        this.logger.error(
          `Failed to persist live-scraped products: ${err.message}`,
          err.stack,
        );
      }
    }

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
  // RETAILER-SPECIFIC SCRAPERS (kept intact — NOT called from search path)
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
