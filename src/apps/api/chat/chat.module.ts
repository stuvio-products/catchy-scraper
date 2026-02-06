import { Module, forwardRef } from '@nestjs/common';
import { ChatController } from './chat.controller';
import { ChatService } from './chat.service';
import { PrismaModule } from '@/shared/prisma/prisma.module';
// import { SearchModule } from '@/apps/api/search/search.module'; // TODO: Add when search module is migrated
import { GeminiModule } from '@/shared/gemini/gemini.module';

import { ChatRepository } from './chat.repository';

@Module({
  imports: [PrismaModule, GeminiModule], // Remove SearchModule for now
  controllers: [ChatController], // Re-enabled
  providers: [ChatService, ChatRepository],
  exports: [ChatService, ChatRepository],
})
export class ChatModule {}
