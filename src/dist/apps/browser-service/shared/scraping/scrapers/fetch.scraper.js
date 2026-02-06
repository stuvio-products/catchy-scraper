"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
var FetchScraper_1;
Object.defineProperty(exports, "__esModule", { value: true });
exports.FetchScraper = void 0;
const common_1 = require("@nestjs/common");
const scrape_strategy_enum_1 = require("../../domain/enums/scrape-strategy.enum");
const undici_1 = require("undici");
let FetchScraper = FetchScraper_1 = class FetchScraper {
    logger = new common_1.Logger(FetchScraper_1.name);
    async scrape(scrapeRequest) {
        const startTime = Date.now();
        const { url, domain, options } = scrapeRequest;
        try {
            this.logger.log(`Fetch scraping: ${url}`);
            const response = await (0, undici_1.request)(url, {
                method: 'GET',
                headers: {
                    'User-Agent': options?.userAgent ||
                        'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
                },
                headersTimeout: options?.timeout || 10000,
            });
            const body = await response.body.text();
            const duration = Date.now() - startTime;
            const bytesUsed = Buffer.byteLength(body, 'utf8');
            this.logger.log(`Fetch completed for ${domain}: ${bytesUsed} bytes in ${duration}ms`);
            return {
                success: true,
                data: body,
                metadata: {
                    strategy: scrape_strategy_enum_1.ScrapeStrategy.FETCH,
                    bytesUsed,
                    duration,
                    timestamp: new Date(),
                },
            };
        }
        catch (error) {
            const duration = Date.now() - startTime;
            this.logger.error(`Fetch failed for ${url}: ${error.message}`);
            return {
                success: false,
                error: error.message,
                metadata: {
                    strategy: scrape_strategy_enum_1.ScrapeStrategy.FETCH,
                    bytesUsed: 0,
                    duration,
                    timestamp: new Date(),
                },
            };
        }
    }
};
exports.FetchScraper = FetchScraper;
exports.FetchScraper = FetchScraper = FetchScraper_1 = __decorate([
    (0, common_1.Injectable)()
], FetchScraper);
//# sourceMappingURL=fetch.scraper.js.map