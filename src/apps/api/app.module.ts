import { Module } from '@nestjs/common';
import { loadEnv } from '@/shared/config/load-env';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { BullModule } from '@nestjs/bullmq';
import { CacheModule } from '@nestjs/cache-manager';
import { ScheduleModule } from '@nestjs/schedule';
import { redisStore } from 'cache-manager-redis-yet';
import { validationSchema } from '@/shared/config/env.validation';
import { QUEUE_NAMES } from '@/shared/queue/queue.constants';

// Existing scraper modules
import { ScrapeController } from './controllers/scrape.controller';
import { HealthController } from './controllers/health.controller';

// Migrated backend modules
import { PrismaModule } from '@/shared/prisma/prisma.module';
import { AuthModule } from './auth/auth.module';
import { CollectionsModule } from './collections/collections.module';
import { FeedbackModule } from './feedback/feedback.module';
import { UsersModule } from './users/users.module';
import { MailModule } from '@/shared/mail/mail.module';
import { ChatModule } from './chat/chat.module'; // Re-enabled
import { SearchModule } from './search/search.module';
import { ProductViewModule } from './product-view/product-view.module';

loadEnv();

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      validationSchema,
      ignoreEnvFile: true,
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
    ScheduleModule.forRoot(),
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
    // Backend modules
    PrismaModule,
    AuthModule,
    UsersModule,
    CollectionsModule,
    FeedbackModule,
    MailModule,
    ChatModule, // Re-enabled (search features stubbed)
    SearchModule,
    ProductViewModule,
  ],
  controllers: [ScrapeController, HealthController],
  providers: [],
})
export class ApiAppModule {}
