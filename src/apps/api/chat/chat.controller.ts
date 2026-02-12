import {
  Controller,
  Post,
  Body,
  Param,
  Get,
  NotFoundException,
  Inject,
  forwardRef,
  Query,
} from '@nestjs/common';
import { ChatService } from './chat.service';
import { SearchService } from '@/apps/api/search/search.service';
import { ChatCursorService } from '@/shared/scraping/services/chat-cursor.service';
import { getEnumKeyAsType } from '@/shared/lib/util';
import { SendMessageDto } from './dto/chat.dto';
import { MessageRole } from '@prisma/client';
import { UseGuards, UnauthorizedException } from '@nestjs/common';
import { JwtAuthGuard } from '@/apps/api/auth/guards/jwt-auth.guard';
import { CurrentUser } from '@/apps/api/auth/decorators/current-user.decorator';
import type { RequestUser } from '@/apps/api/auth/entities/auth.entities';

@Controller('chat')
@UseGuards(JwtAuthGuard)
export class ChatController {
  constructor(
    private readonly chatService: ChatService,
    @Inject(forwardRef(() => SearchService))
    private readonly searchService: SearchService,
    private readonly chatCursorService: ChatCursorService,
  ) {}

  @Get()
  async getUserChats(@CurrentUser() user: RequestUser) {
    return this.chatService.getUserChats(user.id);
  }

  @Get(':id/results')
  async getChatResults(
    @Param('id') chatId: string,
    @CurrentUser() user: RequestUser,
    @Query('cursor') cursor?: string,
    @Query('limit') limit?: string,
  ) {
    const chat = await this.chatService.getChat(chatId);
    if (chat.userId !== user.id)
      throw new UnauthorizedException('Access denied');

    const limitNum = limit ? parseInt(limit, 10) : 20;

    // If client sent a cursor (page 2+), use existing embedding search
    if (cursor) {
      const searchResult = await this.searchService.searchWithState(
        chat.state!,
        limitNum,
        cursor,
      );

      // Low-water-mark: if embedding search returned fewer than requested,
      // trigger background scraping for more retailer pages
      if (chat.state?.currentQuery && searchResult.products.length < limitNum) {
        this.searchService
          .backgroundScrapeNextPages(chat.state.currentQuery, 1, 5)
          .catch((err) =>
            console.error(
              `Background pagination trigger failed: ${err.message}`,
            ),
          );
      }

      return { chatId, ...searchResult };
    }

    // First page: try ChatCursor (deterministic, ProductQuery-based)
    if (chat.state?.currentQuery) {
      const queryHash = this.searchService.computeQueryHash(
        chat.state.currentQuery,
      );
      const retailers = ['myntra', 'flipkart', 'meesho', 'amazon'];

      const { products, totalAvailable } =
        await this.chatCursorService.getUnseenProducts(
          chatId,
          queryHash,
          retailers,
          limitNum,
        );

      if (products.length > 0) {
        // Advance cursors for the products we're serving
        await this.chatCursorService.advanceCursorsForProducts(
          chatId,
          queryHash,
          products,
        );

        // Low-water-mark: if we returned fewer products than requested,
        // the DB is running out — proactively scrape more pages in the background.
        // backgroundScrapeNextPages checks CrawlProgress per-retailer internally,
        // so it will only scrape pages that haven't been scraped yet.
        if (products.length < limitNum) {
          this.searchService
            .backgroundScrapeNextPages(chat.state.currentQuery, 1, 5)
            .catch((err) =>
              console.error(
                `Background pagination trigger failed: ${err.message}`,
              ),
            );
        }

        // Build cursor for client to request page 2 via embedding search
        // Only set nextCursor if more unseen products exist beyond what we just served
        const lastProduct = products[products.length - 1];
        const hasMore = totalAvailable > products.length;
        const nextCursor =
          hasMore && lastProduct ? `0.99:${lastProduct.id}` : null;

        return {
          chatId,
          products: products.map((p) => ({
            ...p,
            similarity: 0.99, // synthetic score for ProductQuery results
          })),
          nextCursor,
          totalAvailable,
          hasMore,
          source: 'product_query',
        };
      }
    }

    // Fallback: embedding-based search (for old chats or empty ProductQuery)
    const searchResult = await this.searchService.searchWithState(
      chat.state!,
      limitNum,
      undefined,
    );

    return {
      chatId,
      ...searchResult,
      source: 'embedding',
    };
  }

  @Post(':id/message')
  async sendMessage(
    @Param('id') chatId: string,
    @Body() body: SendMessageDto,
    @CurrentUser() user: RequestUser,
  ) {
    const chat = await this.chatService.getChat(chatId);
    if (chat.userId !== user.id)
      throw new UnauthorizedException('Access denied');

    // 1. Add User Message
    await this.chatService.addMessage(
      chatId,
      getEnumKeyAsType(MessageRole, MessageRole.USER) as MessageRole,
      body.text,
    );

    // 2. Update State (LLM Intent Extraction)
    const updatedState = await this.chatService.updateStateWithIntent(
      chatId,
      body.text,
    );

    // 3. Run Search with new State
    // Fetch first page of results for the new intent
    const searchResult = await this.searchService.searchWithState(
      updatedState,
      10, // Default limit
      undefined, // No cursor for first page
    );

    // 4. Add Assistant Message
    // Summarize the action or just say "Here are the results"
    const assistantContent =
      `Here are some ${updatedState.currentQuery} options.` +
      (updatedState.filters
        ? ` Filters: ${JSON.stringify(updatedState.filters)}`
        : '');

    await this.chatService.addMessage(
      chatId,
      getEnumKeyAsType(MessageRole, MessageRole.ASSISTANT) as MessageRole,
      assistantContent,
    );

    return {
      chatId,
      message: assistantContent,
      ...searchResult, // Include products in response
    };
  }

  @Get(':id')
  async getChat(@Param('id') chatId: string, @CurrentUser() user: RequestUser) {
    const chat = await this.chatService.getChat(chatId);
    if (chat.userId !== user.id)
      throw new UnauthorizedException('Access denied');
    if (!chat) {
      throw new NotFoundException('Chat not found');
    }
    return chat;
  }
}
