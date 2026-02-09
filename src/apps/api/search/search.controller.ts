import { Controller, Post, Body, Query, Get } from '@nestjs/common';
import { SearchService } from '@/apps/api/search/search.service';

@Controller('search')
export class SearchController {
  constructor(private readonly searchService: SearchService) {}

  @Get()
  async search(@Query('query') query: string) {
    if (!query || query.trim().length === 0) {
      throw new Error('Query is required');
    }
    return this.searchService.triggerUnifiedSearch(query);
  }

  @Post('myntra')
  async searchMyntra(@Body('query') query: string) {
    return this.searchService.triggerMyntraSearch(query);
  }
}
