import { Injectable, Logger } from '@nestjs/common';
import type { IProxyProvider } from '@/shared/proxy/interfaces/proxy.interface';
import type { Proxy } from '@/shared/proxy/interfaces/proxy.interface';

interface ProxyScore {
  proxy: Proxy;
  score: number;
}

@Injectable()
export class ProxySchedulerService {
  private readonly logger = new Logger(ProxySchedulerService.name);
  private readonly domainToProxy: Map<string, string> = new Map(); // Sticky sessions

  constructor(private readonly proxyProvider: IProxyProvider) {}

  async selectProxy(domain: string): Promise<Proxy> {
    // Check for sticky session
    const cachedProxyId = this.domainToProxy.get(domain);
    if (cachedProxyId) {
      this.logger.debug(
        `Using sticky proxy ${cachedProxyId} for domain ${domain}`,
      );
      // In production, verify proxy is still healthy before returning
    }

    // Get a new proxy from provider
    const proxy = await this.proxyProvider.getProxy(domain);

    // Store for sticky session
    this.domainToProxy.set(domain, proxy.id);

    return proxy;
  }

  async reportProxyFailure(proxyId: string, domain: string): Promise<void> {
    this.logger.warn(`Proxy ${proxyId} failed for domain ${domain}`);

    // Report to provider
    await this.proxyProvider.reportFailure(proxyId);

    // Clear sticky session to force rotation
    this.domainToProxy.delete(domain);
  }

  async reportProxySuccess(proxyId: string, bytesUsed: number): Promise<void> {
    await this.proxyProvider.reportSuccess(proxyId, bytesUsed);
  }
}
