import { ScrapeStrategy } from '@/shared/domain/enums/scrape-strategy.enum';

export interface ScrapeRequest {
  url: string;
  domain: string;
  useStrategy?: ScrapeStrategy;
  options?: {
    waitForSelector?: string;
    timeout?: number;
    screenshot?: boolean;
    userAgent?: string;
    // Scroll configuration for infinite scroll/pagination
    scrollIterations?: number;
    scrollDistance?: number;
    delayBetweenScrolls?: number;
  };
}

export interface ScrapeResult {
  success: boolean;
  data?: string; // HTML content
  screenshot?: string; // Base64 encoded
  error?: string;
  metadata: {
    strategy: ScrapeStrategy;
    bytesUsed: number;
    duration: number;
    proxyId?: string;
    timestamp: Date;
  };
}

export interface IScraper {
  scrape(request: ScrapeRequest): Promise<ScrapeResult>;
}
