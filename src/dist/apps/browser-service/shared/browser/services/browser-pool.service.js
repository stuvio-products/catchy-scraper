"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
var __metadata = (this && this.__metadata) || function (k, v) {
    if (typeof Reflect === "object" && typeof Reflect.metadata === "function") return Reflect.metadata(k, v);
};
var BrowserPoolService_1;
Object.defineProperty(exports, "__esModule", { value: true });
exports.BrowserPoolService = void 0;
const common_1 = require("@nestjs/common");
const config_1 = require("@nestjs/config");
const playwright_1 = require("playwright");
const proxy_scheduler_service_1 = require("../../proxy/services/proxy-scheduler.service");
const uuid_1 = require("uuid");
let BrowserPoolService = BrowserPoolService_1 = class BrowserPoolService {
    configService;
    proxyScheduler;
    logger = new common_1.Logger(BrowserPoolService_1.name);
    browsers = new Map();
    browserCount;
    headless;
    constructor(configService, proxyScheduler) {
        this.configService = configService;
        this.proxyScheduler = proxyScheduler;
        this.browserCount = this.configService.get('BROWSER_COUNT') || 4;
        this.headless =
            this.configService.get('BROWSER_HEADLESS') !== false;
    }
    async onModuleInit() {
        this.logger.log(`Initializing browser pool with ${this.browserCount} browsers (headless: ${this.headless})`);
        for (let i = 0; i < this.browserCount; i++) {
            await this.launchBrowser();
        }
        this.logger.log(`Browser pool initialized with ${this.browsers.size} browsers`);
    }
    async onModuleDestroy() {
        this.logger.log('Shutting down browser pool...');
        for (const [id, instance] of this.browsers.entries()) {
            try {
                await instance.browser.close();
                this.logger.debug(`Closed browser ${id}`);
            }
            catch (error) {
                this.logger.error(`Failed to close browser ${id}: ${error.message}`);
            }
        }
        this.browsers.clear();
        this.logger.log('Browser pool shutdown complete');
    }
    async launchBrowser(domain) {
        const browserId = (0, uuid_1.v4)();
        try {
            const proxy = await this.proxyScheduler.selectProxy(domain || 'default');
            this.logger.log(`Launching browser ${browserId} with proxy ${proxy.id}`);
            const browser = await playwright_1.chromium.launch({
                headless: this.headless,
                proxy: {
                    server: `http://${proxy.host}:${proxy.port}`,
                    username: proxy.username,
                    password: proxy.password,
                },
                args: ['--no-sandbox', '--disable-setuid-sandbox'],
            });
            const instance = {
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
        }
        catch (error) {
            this.logger.error(`Failed to launch browser ${browserId}: ${error.message}`);
            throw error;
        }
    }
    async getBrowserForScraping(domain) {
        const healthyBrowsers = Array.from(this.browsers.values()).filter((b) => b.healthStatus === 'healthy');
        if (healthyBrowsers.length === 0) {
            throw new Error('No healthy browsers available');
        }
        const instance = healthyBrowsers[0];
        return {
            browser: instance.browser,
            proxy: instance.proxy,
            browserId: instance.id,
        };
    }
    async reportBrowserFailure(browserId) {
        const instance = this.browsers.get(browserId);
        if (!instance) {
            return;
        }
        instance.failureCount++;
        instance.healthStatus = instance.failureCount > 5 ? 'dead' : 'unhealthy';
        this.logger.warn(`Browser ${browserId} failure reported (count: ${instance.failureCount}, status: ${instance.healthStatus})`);
        await this.proxyScheduler.reportProxyFailure(instance.proxy.id, instance.domain || 'unknown');
    }
    async reportBrowserSuccess(browserId, bytesUsed) {
        const instance = this.browsers.get(browserId);
        if (!instance) {
            return;
        }
        instance.healthStatus = 'healthy';
        instance.failureCount = 0;
        instance.lastHealthCheck = new Date();
        await this.proxyScheduler.reportProxySuccess(instance.proxy.id, bytesUsed);
    }
    getPoolStats() {
        const browsers = Array.from(this.browsers.values());
        return {
            total: browsers.length,
            healthy: browsers.filter((b) => b.healthStatus === 'healthy').length,
            unhealthy: browsers.filter((b) => b.healthStatus === 'unhealthy').length,
            dead: browsers.filter((b) => b.healthStatus === 'dead').length,
        };
    }
};
exports.BrowserPoolService = BrowserPoolService;
exports.BrowserPoolService = BrowserPoolService = BrowserPoolService_1 = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [config_1.ConfigService,
        proxy_scheduler_service_1.ProxySchedulerService])
], BrowserPoolService);
//# sourceMappingURL=browser-pool.service.js.map