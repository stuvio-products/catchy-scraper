import { Module, forwardRef } from '@nestjs/common';
import { SearchController } from '@/apps/api/search/search.controller';
import { SearchService } from '@/apps/api/search/search.service';
import { BullModule } from '@nestjs/bullmq';
import { QUEUE_NAMES } from '@/shared/queue/queue.constants';
import { ScrapingModule } from '@/shared/scraping/scraping.module';
import { GeminiModule } from '@/shared/gemini/gemini.module';
import { ChatModule } from '@/apps/api/chat/chat.module';
import { IntentModule } from '@/shared/intent/intent.module';

@Module({
  imports: [
    BullModule.registerQueue({
      name: QUEUE_NAMES.SCRAPE_QUEUE,
    }),
    ScrapingModule,
    GeminiModule,
    forwardRef(() => ChatModule),
    IntentModule,
  ],
  controllers: [SearchController],
  providers: [SearchService],
  exports: [SearchService],
})
export class SearchModule {}
