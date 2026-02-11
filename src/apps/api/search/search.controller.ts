import { Controller, Query, Get, UseGuards, Post, Body } from '@nestjs/common';
import { SearchService } from '@/apps/api/search/search.service';
import { JwtAuthGuard } from '@/apps/api/auth/guards/jwt-auth.guard';
import { CurrentUser } from '@/apps/api/auth/decorators/current-user.decorator';
import type { RequestUser } from '@/apps/api/auth/entities/auth.entities';

@Controller('search')
export class SearchController {
  constructor(private readonly searchService: SearchService) {}

  @Get()
  @UseGuards(JwtAuthGuard)
  async search(
    @Query('query') query: string,
    @CurrentUser() user?: RequestUser,
  ) {
    if (!query || query.trim().length === 0) {
      throw new Error('Query is required');
    }

    return this.searchService.searchWithIntent(user!.id, query);
  }

  @Post()
  @UseGuards(JwtAuthGuard)
  async searchWithFilters(
    @Body('query') query: string,
    @Body('filters') filters: any,
    @CurrentUser() user?: RequestUser,
  ) {
    return this.searchService.searchWithIntent(user!.id, query, filters);
  }

  @Post('myntra')
  @UseGuards(JwtAuthGuard)
  async searchMyntra(
    @Body('query') query: string,
    @CurrentUser() user: RequestUser,
  ) {
    return this.searchService.triggerMyntraSearch(user.id, query);
  }
}
