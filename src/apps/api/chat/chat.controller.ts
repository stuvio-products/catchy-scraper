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
// import { SearchService } from '@/apps/api/search/search.service';
import { SendMessageDto } from './dto/chat.dto';
import { MessageRole } from '@/generated/prisma/client';
import { UseGuards, UnauthorizedException } from '@nestjs/common';
import { JwtAuthGuard } from '@/apps/api/auth/guards/jwt-auth.guard';
import { CurrentUser } from '@/apps/api/auth/decorators/current-user.decorator';
import type { RequestUser } from '@/apps/api/auth/entities/auth.entities';

@Controller('chat')
@UseGuards(JwtAuthGuard)
export class ChatController {
  constructor(
    private readonly chatService: ChatService,
    // @Inject(forwardRef(() => SearchService))
    // private readonly searchService: SearchService,
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

    // const limitNum = limit ? parseInt(limit, 10) : 10;
    // const cursorNum = cursor ? parseFloat(cursor) : undefined;

    // const searchResult = await this.searchService.searchWithState(
    //   chat.state!,
    //   limitNum,
    //   cursorNum,
    // );

    return {
      chatId,
      // ...searchResult,
      message: 'Search results unavailable (SearchModule not yet migrated)',
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
    await this.chatService.addMessage(chatId, MessageRole.USER, body.text);

    // 2. Update State (LLM Intent Extraction)
    const updatedState = await this.chatService.updateStateWithIntent(
      chatId,
      body.text,
    );

    // 3. Run Search with new State
    // const searchResult = await this.searchService.searchWithState(updatedState);

    // 4. Add Assistant Message
    // Summarize the action or just say "Here are the results"
    // Ideally, we could generate a response text using LLM too, but for now simple response.
    const assistantContent =
      `Here are some ${updatedState.currentQuery} options.` +
      (updatedState.filters
        ? ` Filters: ${JSON.stringify(updatedState.filters)}`
        : '');

    await this.chatService.addMessage(
      chatId,
      MessageRole.ASSISTANT,
      assistantContent,
    );

    return {
      chatId,
      // ...searchResult,
      message: assistantContent,
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
