import { Module } from '@nestjs/common';
import { DomainStrategyService } from './services/domain-strategy.service';

@Module({
  providers: [DomainStrategyService],
  exports: [DomainStrategyService],
})
export class DomainModule {}
