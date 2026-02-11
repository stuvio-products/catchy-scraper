import { Controller, Post, Get, Param } from '@nestjs/common';
import { ProductViewService } from './product-view.service';

@Controller('products')
export class ProductViewController {
  constructor(private readonly productViewService: ProductViewService) {}

  /**
   * POST /products/:productId/view
   *
   * Triggered when the user clicks a product card.
   * Starts detail scraping if needed and returns current product data.
   */
  @Post(':productId/view')
  async viewProduct(@Param('productId') productId: string) {
    return this.productViewService.handleProductView(productId);
  }

  /**
   * GET /products/:productId/detail-status
   *
   * Polling endpoint for frontend to check scrape progress.
   * Returns { scrapeState, scrapeStatus, lastDetailedScrapedAt }.
   */
  @Get(':productId/detail-status')
  async getDetailStatus(@Param('productId') productId: string) {
    return this.productViewService.getDetailStatus(productId);
  }
}
