import { Injectable, Logger } from '@nestjs/common';
import { ScrapeStrategy } from '../enums/scrape-strategy.enum';
import {
  DomainStrategyConfig,
  IStrategyResolver,
} from '../interfaces/domain-strategy.interface';
import * as domainStrategiesConfig from '../config/domain-strategies.json';

@Injectable()
export class DomainStrategyService implements IStrategyResolver {
  private readonly logger = new Logger(DomainStrategyService.name);
  private readonly strategyMap: DomainStrategyConfig;
  private readonly defaultStrategy = ScrapeStrategy.FETCH;

  constructor() {
    this.strategyMap = domainStrategiesConfig as DomainStrategyConfig;
    this.logger.log(
      `Loaded ${Object.keys(this.strategyMap).length} domain strategies`,
    );
  }

  getStrategy(domain: string): ScrapeStrategy {
    // Normalize domain (remove www., protocol, etc.)
    const normalizedDomain = this.normalizeDomain(domain);

    // Check exact match
    if (this.strategyMap[normalizedDomain]) {
      this.logger.debug(
        `Domain ${normalizedDomain} → ${this.strategyMap[normalizedDomain]}`,
      );
      return this.strategyMap[normalizedDomain];
    }

    // Use default strategy
    this.logger.debug(
      `Domain ${normalizedDomain} → ${this.defaultStrategy} (default)`,
    );
    return this.defaultStrategy;
  }

  private normalizeDomain(domain: string): string {
    return domain
      .toLowerCase()
      .replace(/^https?:\/\//, '')
      .replace(/^www\./, '')
      .split('/')[0];
  }
}
