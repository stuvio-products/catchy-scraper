import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '@/shared/prisma/prisma.service';

interface UnseenProduct {
  id: string;
  title: string;
  description: string | null;
  brand: string | null;
  category: string | null;
  price: number | null;
  productUrl: string | null;
  images: string[];
  retailer: string | null;
  scrapStatus: string;
  lastScraped: Date | null;
  pageFound: number;
  rank: number;
}

@Injectable()
export class ChatCursorService {
  private readonly logger = new Logger(ChatCursorService.name);

  constructor(private readonly prisma: PrismaService) {}

  /**
   * Get products not yet shown to this chat for the given query.
   * Queries ProductQuery join table, skipping already-seen products via offset.
   * Returns products ordered by (page_found ASC, rank ASC) for deterministic pagination.
   */
  async getUnseenProducts(
    chatId: string,
    queryHash: string,
    retailers: string[],
    limit: number = 20,
  ): Promise<{ products: UnseenProduct[]; totalAvailable: number }> {
    if (retailers.length === 0) return { products: [], totalAvailable: 0 };

    // Get minimum offset across all retailer cursors for this chat+query
    const cursors = await this.prisma.client.chatCursor.findMany({
      where: {
        chatId,
        queryHash,
        retailer: { in: retailers },
      },
    });

    // Build combined offset: sum of all retailer offsets
    const totalOffset = cursors.reduce((sum, c) => sum + c.offset, 0);

    // Build retailer placeholder for raw SQL
    const retailerList = retailers.map((r) => `'${r}'`).join(',');

    // Count total available products for this query across retailers
    const countResult = await this.prisma.client.$queryRawUnsafe<
      Array<{ count: bigint }>
    >(
      `SELECT COUNT(*) as count
       FROM product_queries pq
       WHERE pq.query_hash = $1
       AND pq.retailer IN (${retailerList})`,
      queryHash,
    );
    const totalAvailable = Number(countResult[0]?.count ?? 0);

    // Fetch products with offset-based pagination
    const products = await this.prisma.client.$queryRawUnsafe<UnseenProduct[]>(
      `SELECT
         p.id, p.title, p.description, p.brand, p.category, p.price,
         p.product_url AS "productUrl", p.images, p.retailer,
         p.scrap_status AS "scrapStatus", p.last_scraped AS "lastScraped",
         pq.page_found AS "pageFound", pq.rank
       FROM product_queries pq
       JOIN products p ON p.id = pq.product_id
       WHERE pq.query_hash = $1
       AND pq.retailer IN (${retailerList})
       ORDER BY pq.page_found ASC, pq.rank ASC, p.id ASC
       OFFSET $2
       LIMIT $3`,
      queryHash,
      totalOffset,
      limit,
    );

    return { products, totalAvailable };
  }

  /**
   * Advance the cursor for a specific chat + query + retailer.
   * Uses upsert: creates if first page, increments if subsequent.
   */
  async advanceCursor(
    chatId: string,
    queryHash: string,
    retailer: string,
    advanceBy: number,
  ): Promise<void> {
    await this.prisma.client.chatCursor.upsert({
      where: {
        chatId_queryHash_retailer: { chatId, queryHash, retailer },
      },
      update: {
        offset: { increment: advanceBy },
      },
      create: {
        chatId,
        queryHash,
        retailer,
        offset: advanceBy,
      },
    });
  }

  /**
   * Advance cursors for all retailers at once after serving a mixed page.
   * Counts how many products per retailer were served and advances each.
   */
  async advanceCursorsForProducts(
    chatId: string,
    queryHash: string,
    products: Array<{ retailer: string | null }>,
  ): Promise<void> {
    // Count per retailer
    const counts = new Map<string, number>();
    for (const p of products) {
      if (!p.retailer) continue;
      counts.set(p.retailer, (counts.get(p.retailer) || 0) + 1);
    }

    // Advance each retailer cursor
    const promises = Array.from(counts.entries()).map(([retailer, count]) =>
      this.advanceCursor(chatId, queryHash, retailer, count),
    );
    await Promise.all(promises);
  }

  /**
   * Reset all cursors for a chat + query (used when user refines query).
   */
  async resetCursors(chatId: string, queryHash: string): Promise<void> {
    await this.prisma.client.chatCursor.deleteMany({
      where: { chatId, queryHash },
    });
    this.logger.log(`Reset cursors for chat ${chatId} / query ${queryHash}`);
  }
}
