"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.ScrapingModule = void 0;
const common_1 = require("@nestjs/common");
const axios_1 = require("@nestjs/axios");
const config_1 = require("@nestjs/config");
const domain_module_1 = require("../domain/domain.module");
const fetch_scraper_1 = require("./scrapers/fetch.scraper");
const browser_client_scraper_1 = require("./scrapers/browser-client.scraper");
const scrape_orchestrator_service_1 = require("./services/scrape-orchestrator.service");
let ScrapingModule = class ScrapingModule {
};
exports.ScrapingModule = ScrapingModule;
exports.ScrapingModule = ScrapingModule = __decorate([
    (0, common_1.Module)({
        imports: [axios_1.HttpModule, config_1.ConfigModule, domain_module_1.DomainModule],
        providers: [fetch_scraper_1.FetchScraper, browser_client_scraper_1.BrowserClientScraper, scrape_orchestrator_service_1.ScrapeOrchestratorService],
        exports: [scrape_orchestrator_service_1.ScrapeOrchestratorService],
    })
], ScrapingModule);
//# sourceMappingURL=scraping.module.js.map