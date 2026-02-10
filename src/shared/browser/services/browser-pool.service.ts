import {
  Injectable,
  Logger,
  OnModuleInit,
  OnModuleDestroy,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { chromium, Browser, BrowserContext, Page } from 'playwright';
import { ProxySchedulerService } from '@/shared/proxy/services/proxy-scheduler.service';
import { Proxy } from '@/shared/proxy/interfaces/proxy.interface';
import {
  BrowserInstance,
  BrowserPoolStats,
} from '../interfaces/browser-instance.interface';
import { v4 as uuidv4 } from 'uuid';

@Injectable()
export class BrowserPoolService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(BrowserPoolService.name);
  private readonly browsers: Map<string, BrowserInstance> = new Map();
  private readonly browserCount: number;
  private readonly headless: boolean;

  constructor(
    private readonly configService: ConfigService,
    private readonly proxyScheduler: ProxySchedulerService,
  ) {
    this.browserCount = this.configService.get<number>('BROWSER_COUNT') || 4;
    this.headless =
      this.configService.get<boolean>('BROWSER_HEADLESS') !== false;
  }

  /**
   * Check if domain should launch browser in visible mode for debugging
   */
  private isDebugDomain(domain?: string): boolean {
    if (!domain) return false;

    const debugDomains =
      this.configService.get<string>('DEBUG_BROWSER_DOMAINS') || '';

    if (!debugDomains) return false;

    const domains = debugDomains.split(',').map((d) => d.trim().toLowerCase());
    const normalizedDomain = domain.toLowerCase();

    return domains.some((d) => normalizedDomain.includes(d));
  }

  async onModuleInit() {
    this.logger.log(
      `Initializing browser pool with ${this.browserCount} browsers (headless: ${this.headless})`,
    );

    for (let i = 0; i < this.browserCount; i++) {
      await this.launchBrowser();
    }

    this.logger.log(
      `Browser pool initialized with ${this.browsers.size} browsers`,
    );
  }

  async onModuleDestroy() {
    this.logger.log('Shutting down browser pool...');

    for (const [id, instance] of this.browsers.entries()) {
      try {
        await instance.browser.close();
        this.logger.debug(`Closed browser ${id}`);
      } catch (error) {
        this.logger.error(`Failed to close browser ${id}: ${error.message}`);
      }
    }

    this.browsers.clear();
    this.logger.log('Browser pool shutdown complete');
  }

  private async launchBrowser(domain?: string): Promise<BrowserInstance> {
    const browserId = uuidv4();

    try {
      // Get proxy for this browser
      const proxy = await this.proxyScheduler.selectProxy(domain || 'default');

      this.logger.log(`Launching browser ${browserId} with proxy ${proxy.id}`);

      // Enable visible browser for debug domains
      const headlessMode = this.isDebugDomain(domain) ? false : this.headless;

      if (!headlessMode && domain) {
        this.logger.log(
          `Launching browser ${browserId} in VISIBLE mode for debugging domain: ${domain}`,
        );
      }

      const isFakeProxy = proxy.host.includes('fake.com');

      const browser = await chromium.launch({
        headless: headlessMode,
        // proxy: isFakeProxy
        //   ? undefined
        //   : {
        //       server: `http://${proxy.host}:${proxy.port}`,
        //       username: proxy.username,
        //       password: proxy.password,
        //     },
        args: [
          '--no-sandbox',
          '--disable-setuid-sandbox',
          '--disable-blink-features=AutomationControlled',
          '--disable-infobars',
          '--window-position=0,0',
          '--ignore-certificate-errors',
          '--ignore-certificate-errors-spki-list',
          '--disable-dev-shm-usage',
        ],
      });

      const instance: BrowserInstance = {
        id: browserId,
        browser,
        proxy,
        healthStatus: 'healthy',
        lastHealthCheck: new Date(),
        failureCount: 0,
        createdAt: new Date(),
        domain,
      };

      this.browsers.set(browserId, instance);
      this.logger.log(`Browser ${browserId} launched successfully`);

      return instance;
    } catch (error) {
      this.logger.error(
        `Failed to launch browser ${browserId}: ${error.message}`,
      );
      throw error;
    }
  }

  async getBrowserForScraping(
    domain: string,
  ): Promise<{ browser: Browser; proxy: Proxy; browserId: string }> {
    // Find least busy healthy browser
    const healthyBrowsers = Array.from(this.browsers.values()).filter(
      (b) => b.healthStatus === 'healthy',
    );

    if (healthyBrowsers.length === 0) {
      throw new Error('No healthy browsers available');
    }

    // Simple round-robin for now
    const instance = healthyBrowsers[0];

    return {
      browser: instance.browser,
      proxy: instance.proxy,
      browserId: instance.id,
    };
  }

  async reportBrowserFailure(browserId: string): Promise<void> {
    const instance = this.browsers.get(browserId);
    if (!instance) {
      return;
    }

    instance.failureCount++;
    instance.healthStatus = instance.failureCount > 5 ? 'dead' : 'unhealthy';

    this.logger.warn(
      `Browser ${browserId} failure reported (count: ${instance.failureCount}, status: ${instance.healthStatus})`,
    );

    // Report proxy failure
    await this.proxyScheduler.reportProxyFailure(
      instance.proxy.id,
      instance.domain || 'unknown',
    );
  }

  async reportBrowserSuccess(
    browserId: string,
    bytesUsed: number,
  ): Promise<void> {
    const instance = this.browsers.get(browserId);
    if (!instance) {
      return;
    }

    instance.healthStatus = 'healthy';
    instance.failureCount = 0;
    instance.lastHealthCheck = new Date();

    // Report proxy success
    await this.proxyScheduler.reportProxySuccess(instance.proxy.id, bytesUsed);
  }

  getPoolStats(): BrowserPoolStats {
    const browsers = Array.from(this.browsers.values());

    return {
      total: browsers.length,
      healthy: browsers.filter((b) => b.healthStatus === 'healthy').length,
      unhealthy: browsers.filter((b) => b.healthStatus === 'unhealthy').length,
      dead: browsers.filter((b) => b.healthStatus === 'dead').length,
    };
  }
}
