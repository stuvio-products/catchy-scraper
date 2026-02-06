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
var __param = (this && this.__param) || function (paramIndex, decorator) {
    return function (target, key) { decorator(target, key, paramIndex); }
};
var BrowserController_1;
Object.defineProperty(exports, "__esModule", { value: true });
exports.BrowserController = void 0;
const common_1 = require("@nestjs/common");
const browser_pool_service_1 = require("../../../shared/browser/services/browser-pool.service");
const browser_service_guard_1 = require("../guards/browser-service.guard");
let BrowserController = BrowserController_1 = class BrowserController {
    browserPool;
    logger = new common_1.Logger(BrowserController_1.name);
    constructor(browserPool) {
        this.browserPool = browserPool;
    }
    async scrape(request) {
        const startTime = Date.now();
        const { url, domain, options } = request;
        this.logger.log(`Browser scrape request for: ${url}`);
        try {
            const { browser, proxy, browserId } = await this.browserPool.getBrowserForScraping(domain);
            const context = await browser.newContext({
                userAgent: options?.userAgent ||
                    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
            });
            const page = await context.newPage();
            try {
                await page.goto(url, {
                    timeout: options?.timeout || 30000,
                    waitUntil: 'networkidle',
                });
                if (options?.waitForSelector) {
                    await page.waitForSelector(options.waitForSelector, {
                        timeout: 10000,
                    });
                }
                const html = await page.content();
                let screenshot;
                if (options?.screenshot) {
                    const buffer = await page.screenshot({ type: 'png' });
                    screenshot = buffer.toString('base64');
                }
                const duration = Date.now() - startTime;
                const bytesUsed = Buffer.byteLength(html, 'utf8');
                await this.browserPool.reportBrowserSuccess(browserId, bytesUsed);
                this.logger.log(`Browser scrape completed: ${domain} (${bytesUsed} bytes in ${duration}ms)`);
                return {
                    success: true,
                    data: html,
                    screenshot,
                    metadata: {
                        bytesUsed,
                        duration,
                        proxyId: proxy.id,
                        timestamp: new Date(),
                    },
                };
            }
            finally {
                await page.close();
                await context.close();
            }
        }
        catch (error) {
            const duration = Date.now() - startTime;
            this.logger.error(`Browser scrape failed for ${url}: ${error.message}`);
            return {
                success: false,
                error: error.message,
                metadata: {
                    bytesUsed: 0,
                    duration,
                    timestamp: new Date(),
                },
            };
        }
    }
    getHealth() {
        const stats = this.browserPool.getPoolStats();
        return {
            status: 'ok',
            timestamp: new Date().toISOString(),
            service: 'browser-service',
            browsers: stats,
        };
    }
};
exports.BrowserController = BrowserController;
__decorate([
    (0, common_1.Post)('scrape'),
    (0, common_1.HttpCode)(common_1.HttpStatus.OK),
    __param(0, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object]),
    __metadata("design:returntype", Promise)
], BrowserController.prototype, "scrape", null);
__decorate([
    (0, common_1.Get)('health'),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", []),
    __metadata("design:returntype", void 0)
], BrowserController.prototype, "getHealth", null);
exports.BrowserController = BrowserController = BrowserController_1 = __decorate([
    (0, common_1.Controller)('browser'),
    (0, common_1.UseGuards)(browser_service_guard_1.BrowserServiceGuard),
    __metadata("design:paramtypes", [browser_pool_service_1.BrowserPoolService])
], BrowserController);
//# sourceMappingURL=browser.controller.js.map