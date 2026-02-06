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
var BrowserClientScraper_1;
Object.defineProperty(exports, "__esModule", { value: true });
exports.BrowserClientScraper = void 0;
const common_1 = require("@nestjs/common");
const axios_1 = require("@nestjs/axios");
const config_1 = require("@nestjs/config");
const rxjs_1 = require("rxjs");
const scrape_strategy_enum_1 = require("../../domain/enums/scrape-strategy.enum");
let BrowserClientScraper = BrowserClientScraper_1 = class BrowserClientScraper {
    httpService;
    configService;
    logger = new common_1.Logger(BrowserClientScraper_1.name);
    browserServiceUrl;
    apiKey;
    constructor(httpService, configService) {
        this.httpService = httpService;
        this.configService = configService;
        const port = this.configService.get('BROWSER_SERVICE_PORT') || 3001;
        this.browserServiceUrl = `http://browser-service:${port}`;
        this.apiKey =
            this.configService.get('BROWSER_SERVICE_API_KEY') || '';
        if (!this.apiKey) {
            throw new Error('BROWSER_SERVICE_API_KEY must be configured');
        }
    }
    async scrape(scrapeRequest) {
        const startTime = Date.now();
        try {
            this.logger.log(`Requesting browser scrape from service: ${scrapeRequest.url}`);
            const response = await (0, rxjs_1.firstValueFrom)(this.httpService.post(`${this.browserServiceUrl}/browser/scrape`, scrapeRequest, {
                headers: {
                    'X-API-Key': this.apiKey,
                },
                timeout: scrapeRequest.options?.timeout || 30000,
            }));
            const duration = Date.now() - startTime;
            this.logger.log(`Browser scrape completed for ${scrapeRequest.domain} in ${duration}ms`);
            return {
                ...response.data,
                metadata: {
                    ...response.data.metadata,
                    strategy: scrape_strategy_enum_1.ScrapeStrategy.BROWSER,
                },
            };
        }
        catch (error) {
            const duration = Date.now() - startTime;
            this.logger.error(`Browser scrape failed for ${scrapeRequest.url}: ${error.message}`);
            return {
                success: false,
                error: error.message,
                metadata: {
                    strategy: scrape_strategy_enum_1.ScrapeStrategy.BROWSER,
                    bytesUsed: 0,
                    duration,
                    timestamp: new Date(),
                },
            };
        }
    }
};
exports.BrowserClientScraper = BrowserClientScraper;
exports.BrowserClientScraper = BrowserClientScraper = BrowserClientScraper_1 = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [axios_1.HttpService,
        config_1.ConfigService])
], BrowserClientScraper);
//# sourceMappingURL=browser-client.scraper.js.map