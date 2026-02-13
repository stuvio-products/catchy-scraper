import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '@/shared/prisma/prisma.service';
import { GeminiService } from '@/shared/gemini/gemini.service';
import { ParsedProduct } from '@/shared/scraping/interfaces/parsed-product.interface';
import { ScrapStatus } from '@/prisma/client';
import { getEnumKeyAsType } from '@/shared/lib/util';

@Injectable()
export class ProductSaveService {
  private readonly logger = new Logger(ProductSaveService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly gemini: GeminiService,
  ) {}

  /**
   * Upsert products with specified scrap status
   */
  async upsertProducts(
    products: ParsedProduct[],
    scrapStatus: ScrapStatus,
  ): Promise<any[]> {
    const savedProducts: any[] = [];
    for (const product of products) {
      try {
        const saved = await this.prisma.client.product.upsert({
          where: { productUrl: product.productUrl },
          update: {
            title: product.productName,
            description: product.description,
            brand: product.brand,
            category: product.category,
            price: product.price,
            inStock: product.inStock ?? true,
            images: product.images,
            size: product.size || [],
            color: product.color || [],
            lastScraped: new Date(),
            scrapStatus: getEnumKeyAsType(
              ScrapStatus,
              scrapStatus,
            ) as ScrapStatus,
          },
          create: {
            title: product.productName,
            description: product.description,
            brand: product.brand,
            category: product.category,
            price: product.price,
            retailer: product.retailer,
            productUrl: product.productUrl,
            inStock: product.inStock ?? true,
            images: product.images,
            size: product.size || [],
            color: product.color || [],
            lastScraped: new Date(),
            scrapStatus: getEnumKeyAsType(
              ScrapStatus,
              scrapStatus,
            ) as ScrapStatus,
          },
        });
        savedProducts.push(saved);
      } catch (error) {
        this.logger.error(
          `Failed to upsert product ${product.productUrl}: ${error.message}`,
        );
      }
    }

    this.logger.log(
      `Upserted ${products.length} products with status ${getEnumKeyAsType(ScrapStatus, scrapStatus)}`,
    );
    return savedProducts;
  }

  /**
   * Update scrap status for a specific product
   */
  async updateScrapStatus(
    productUrl: string,
    status: ScrapStatus,
  ): Promise<void> {
    try {
      await this.prisma.client.product.update({
        where: { productUrl },
        data: {
          scrapStatus: getEnumKeyAsType(ScrapStatus, status) as ScrapStatus,
          lastScraped: new Date(),
        },
      });

      this.logger.log(
        `Updated ${productUrl} to status ${getEnumKeyAsType(ScrapStatus, status)}`,
      );
    } catch (error) {
      this.logger.error(
        `Failed to update status for ${productUrl}: ${error.message}`,
      );
    }
  }

  /**
   * Generate and save embedding for a product
   */
  async generateAndSaveEmbedding(productUrl: string): Promise<void> {
    try {
      const product = await this.prisma.client.product.findUnique({
        where: { productUrl },
      });

      if (!product) {
        this.logger.warn(`Product not found: ${productUrl}`);
        return;
      }

      // Style-focused embedding text (exclude category/brand for better semantic matching)
      // Casting to any because running containers might have stale Prisma client types
      const p = product;
      const textToEmbed = [
        p.title,
        ...(p.fit || []),
        ...(p.material || []),
        ...(p.styleTags || []),
        ...(p.color || []),
        (p.description || '').slice(0, 120),
      ]
        .filter(Boolean)
        .join(' ');
      const embedding = await this.gemini.generateEmbedding(textToEmbed);
      const vectorString = `[${embedding.join(',')}]`;

      await this.prisma.client.$executeRaw`
        UPDATE products
        SET embedding = ${vectorString}::vector
        WHERE product_url = ${productUrl}
      `;

      this.logger.log(`Generated embedding for ${productUrl}`);
    } catch (error) {
      this.logger.error(
        `Failed to generate embedding for ${productUrl}: ${error.message}`,
      );
    }
  }

  /**
   * Link products to a query via the ProductQuery join table.
   * Idempotent: uses ON CONFLICT DO NOTHING for concurrent safety.
   */
  async linkProductsToQuery(
    productIds: string[],
    queryHash: string,
    retailer: string,
    pageFound: number,
  ): Promise<void> {
    if (productIds.length === 0) return;

    // Build VALUES clause for bulk insert
    const values = productIds
      .map(
        (id, index) =>
          `('${id}'::uuid, '${queryHash}', '${retailer}', ${pageFound}, ${index}, NOW())`,
      )
      .join(',\n');

    try {
      await this.prisma.client.$executeRawUnsafe(`
        INSERT INTO product_queries (product_id, query_hash, retailer, page_found, rank, created_at)
        VALUES ${values}
        ON CONFLICT (product_id, query_hash, retailer) DO NOTHING
      `);

      this.logger.log(
        `Linked ${productIds.length} products to query ${queryHash} (page ${pageFound})`,
      );
    } catch (error) {
      this.logger.error(
        `Failed to link products to query ${queryHash}: ${error.message}`,
      );
    }
  }
}
