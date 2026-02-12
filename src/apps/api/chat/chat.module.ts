import { Module, forwardRef } from '@nestjs/common';
import { ChatController } from './chat.controller';
import { ChatService } from './chat.service';
import { PrismaModule } from '@/shared/prisma/prisma.module';
import { SearchModule } from '@/apps/api/search/search.module';
import { GeminiModule } from '@/shared/gemini/gemini.module';
import { IntentModule } from '@/shared/intent/intent.module';
import { ScrapingModule } from '@/shared/scraping/scraping.module';

import { ChatRepository } from './chat.repository';

@Module({
  imports: [
    PrismaModule,
    GeminiModule,
    IntentModule,
    ScrapingModule,
    forwardRef(() => SearchModule),
  ],
  controllers: [ChatController], // Re-enabled
  providers: [ChatService, ChatRepository],
  exports: [ChatService, ChatRepository],
})
export class ChatModule {}
