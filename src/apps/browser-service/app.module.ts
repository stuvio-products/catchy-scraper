import { Module } from '@nestjs/common';
import { loadEnv } from '@/shared/config/load-env';
import { ConfigModule } from '@nestjs/config';
import { ScheduleModule } from '@nestjs/schedule';
import { validationSchema } from '@/shared/config/env.validation';
import { BrowserModule } from '@/shared/browser/browser.module';
import { BrowserController } from './controllers/browser.controller';

loadEnv();

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      validationSchema,
      ignoreEnvFile: true,
    }),
    ScheduleModule.forRoot(),
    BrowserModule,
  ],
  controllers: [BrowserController],
})
export class BrowserServiceAppModule {}
