import { ScrapeStrategy } from '@/shared/domain/enums/scrape-strategy.enum';

export interface DomainStrategyConfig {
  [domain: string]: ScrapeStrategy;
}

export interface IStrategyResolver {
  getStrategy(domain: string): ScrapeStrategy;
}
