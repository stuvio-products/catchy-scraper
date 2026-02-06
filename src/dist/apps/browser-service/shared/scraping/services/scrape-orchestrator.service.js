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
var ScrapeOrchestratorService_1;
Object.defineProperty(exports, "__esModule", { value: true });
exports.ScrapeOrchestratorService = void 0;
const common_1 = require("@nestjs/common");
const domain_strategy_service_1 = require("../../domain/services/domain-strategy.service");
const scrape_strategy_enum_1 = require("../../domain/enums/scrape-strategy.enum");
const fetch_scraper_1 = require("../scrapers/fetch.scraper");
const browser_client_scraper_1 = require("../scrapers/browser-client.scraper");
let ScrapeOrchestratorService = ScrapeOrchestratorService_1 = class ScrapeOrchestratorService {
    domainStrategy;
    fetchScraper;
    browserClientScraper;
    logger = new common_1.Logger(ScrapeOrchestratorService_1.name);
    constructor(domainStrategy, fetchScraper, browserClientScraper) {
        this.domainStrategy = domainStrategy;
        this.fetchScraper = fetchScraper;
        this.browserClientScraper = browserClientScraper;
    }
    async scrape(request) {
        const strategy = this.domainStrategy.getStrategy(request.domain);
        this.logger.log(`Orchestrating ${strategy} scrape for ${request.domain}: ${request.url}`);
        try {
            let result;
            if (strategy === scrape_strategy_enum_1.ScrapeStrategy.FETCH) {
                result = await this.fetchScraper.scrape(request);
            }
            else {
                result = await this.browserClientScraper.scrape(request);
            }
            this.logger.log(`Scrape ${result.success ? 'succeeded' : 'failed'} for ${request.domain}`);
            return result;
        }
        catch (error) {
            this.logger.error(`Scrape orchestration failed for ${request.url}: ${error.message}`);
            return {
                success: false,
                error: error.message,
                metadata: {
                    strategy,
                    bytesUsed: 0,
                    duration: 0,
                    timestamp: new Date(),
                },
            };
        }
    }
};
exports.ScrapeOrchestratorService = ScrapeOrchestratorService;
exports.ScrapeOrchestratorService = ScrapeOrchestratorService = ScrapeOrchestratorService_1 = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [domain_strategy_service_1.DomainStrategyService,
        fetch_scraper_1.FetchScraper,
        browser_client_scraper_1.BrowserClientScraper])
], ScrapeOrchestratorService);
//# sourceMappingURL=scrape-orchestrator.service.js.map