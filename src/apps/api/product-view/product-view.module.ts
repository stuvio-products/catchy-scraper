import { Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bullmq';
import { ProductViewController } from './product-view.controller';
import { ProductViewService } from './product-view.service';
import { ScrapingModule } from '@/shared/scraping/scraping.module';
import { PrismaModule } from '@/shared/prisma/prisma.module';
import { QUEUE_NAMES } from '@/shared/queue/queue.constants';

@Module({
  imports: [
    BullModule.registerQueue({
      name: QUEUE_NAMES.PRODUCT_DETAIL_QUEUE,
    }),
    ScrapingModule,
    PrismaModule,
  ],
  controllers: [ProductViewController],
  providers: [ProductViewService],
})
export class ProductViewModule {}
