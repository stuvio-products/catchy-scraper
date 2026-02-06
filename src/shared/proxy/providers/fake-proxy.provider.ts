import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  IProxyProvider,
  Proxy,
  ProxyMetrics,
} from '@/shared/proxy/interfaces/proxy.interface';

@Injectable()
export class FakeProxyProvider implements IProxyProvider {
  private readonly logger = new Logger(FakeProxyProvider.name);
  private readonly proxies: Map<string, Proxy> = new Map();
  private readonly metrics: Map<string, ProxyMetrics> = new Map();
  private proxyCounter = 0;

  constructor(private readonly configService: ConfigService) {
    this.initializeProxies();
  }

  private initializeProxies(): void {
    const proxyCount = 10; // Create pool of fake proxies
    const costPerMB =
      this.configService.get<number>('FAKE_PROXY_COST_PER_MB') || 0.001;

    for (let i = 1; i <= proxyCount; i++) {
      const proxyId = `fake-proxy-${i}`;
      const proxy: Proxy = {
        id: proxyId,
        host: `proxy-${i}.fake.com`,
        port: 8080 + i,
        username: `user${i}`,
        password: `pass${i}`,
        region: this.getRandomRegion(),
        costPerMB,
        costPerRequest: 0.0001,
      };

      this.proxies.set(proxyId, proxy);
      this.metrics.set(proxyId, {
        failureCount: 0,
        successCount: 0,
        totalBytesUsed: 0,
        lastUsed: new Date(),
      });
    }

    this.logger.log(`Initialized ${proxyCount} fake proxies`);
  }

  async getProxy(domain: string): Promise<Proxy> {
    // Simple round-robin selection
    this.proxyCounter = (this.proxyCounter + 1) % this.proxies.size;
    const proxyId = `fake-proxy-${this.proxyCounter + 1}`;
    const proxy = this.proxies.get(proxyId);

    if (!proxy) {
      throw new Error(`Proxy ${proxyId} not found`);
    }

    this.logger.debug(`Assigned ${proxyId} for domain ${domain}`);
    return { ...proxy };
  }

  async reportFailure(proxyId: string): Promise<void> {
    const metrics = this.metrics.get(proxyId);
    if (metrics) {
      metrics.failureCount++;
      metrics.lastFailure = new Date();
      this.logger.warn(
        `Proxy ${proxyId} failure reported (total: ${metrics.failureCount})`,
      );
    }
  }

  async reportSuccess(proxyId: string, bytesUsed: number): Promise<void> {
    const metrics = this.metrics.get(proxyId);
    if (metrics) {
      metrics.successCount++;
      metrics.totalBytesUsed += bytesUsed;
      metrics.lastUsed = new Date();
      this.logger.debug(
        `Proxy ${proxyId} success (bytes: ${bytesUsed}, total: ${metrics.successCount})`,
      );
    }
  }

  private getRandomRegion(): string {
    const regions = ['us-east', 'us-west', 'eu-west', 'ap-south'];
    return regions[Math.floor(Math.random() * regions.length)];
  }

  // Utility method for monitoring
  getMetrics(): Map<string, ProxyMetrics> {
    return new Map(this.metrics);
  }
}
