import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { ScheduleModule } from '@nestjs/schedule';
import { ProxyModule } from '@/shared/proxy/proxy.module';
import { BrowserPoolService } from './services/browser-pool.service';
import { BrowserHealthService } from './services/browser-health.service';

@Module({
  imports: [ConfigModule, ScheduleModule, ProxyModule],
  providers: [BrowserPoolService, BrowserHealthService],
  exports: [BrowserPoolService],
})
export class BrowserModule {}
