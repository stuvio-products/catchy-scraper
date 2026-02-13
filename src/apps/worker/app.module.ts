import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { BullModule } from '@nestjs/bullmq';
import { validationSchema } from '../../shared/config/env.validation';
import { QUEUE_NAMES } from '../../shared/queue/queue.constants';
import { ScrapingModule } from '../../shared/scraping/scraping.module';
import { ScrapeProcessor } from './processors/scrape.processor';
import { PrismaModule } from '@/shared/prisma/prisma.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      validationSchema,
      envFilePath: '.env',
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
    ScrapingModule,
    PrismaModule,
  ],
  providers: [ScrapeProcessor],
})
export class WorkerAppModule {}
