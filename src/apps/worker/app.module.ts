import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { BullModule } from '@nestjs/bullmq';
import { CacheModule } from '@nestjs/cache-manager';
import { redisStore } from 'cache-manager-redis-yet';
import { validationSchema } from '../../shared/config/env.validation';
import { QUEUE_NAMES } from '../../shared/queue/queue.constants';
import { ScrapingModule } from '../../shared/scraping/scraping.module';
import { ScrapeProcessor } from './processors/scrape.processor';
import { ProductDetailProcessor } from './processors/product-detail.processor';
import { PrismaModule } from '@/shared/prisma/prisma.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      validationSchema,
      envFilePath: '.env',
    }),
    CacheModule.registerAsync({
      isGlobal: true,
      useFactory: async () => ({
        store: await redisStore({
          socket: {
            host: process.env.REDIS_HOST || 'localhost',
            port: parseInt(process.env.REDIS_PORT ?? '6379'),
          },
        }),
      }),
    }),
    BullModule.forRootAsync({
      imports: [ConfigModule],
      useFactory: (configService: ConfigService) => ({
        connection: {
          host: configService.get<string>('REDIS_HOST'),
          port: configService.get<number>('REDIS_PORT'),
        },
      }),
      inject: [ConfigService],
    }),
    BullModule.registerQueue({
      name: QUEUE_NAMES.SCRAPE_QUEUE,
    }),
    BullModule.registerQueue({
      name: QUEUE_NAMES.PRODUCT_DETAIL_QUEUE,
    }),
    ScrapingModule,
    PrismaModule,
  ],
  providers: [ScrapeProcessor, ProductDetailProcessor],
})
export class WorkerAppModule {}
