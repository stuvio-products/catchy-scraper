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
var BrowserHealthService_1;
Object.defineProperty(exports, "__esModule", { value: true });
exports.BrowserHealthService = void 0;
const common_1 = require("@nestjs/common");
const schedule_1 = require("@nestjs/schedule");
const browser_pool_service_1 = require("./browser-pool.service");
let BrowserHealthService = BrowserHealthService_1 = class BrowserHealthService {
    browserPool;
    logger = new common_1.Logger(BrowserHealthService_1.name);
    constructor(browserPool) {
        this.browserPool = browserPool;
    }
    async performHealthCheck() {
        this.logger.debug('Performing browser pool health check...');
        const stats = this.browserPool.getPoolStats();
        this.logger.log(`Browser pool health: ${stats.healthy} healthy, ${stats.unhealthy} unhealthy, ${stats.dead} dead (${stats.total} total)`);
    }
};
exports.BrowserHealthService = BrowserHealthService;
__decorate([
    (0, schedule_1.Cron)(schedule_1.CronExpression.EVERY_30_SECONDS),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", []),
    __metadata("design:returntype", Promise)
], BrowserHealthService.prototype, "performHealthCheck", null);
exports.BrowserHealthService = BrowserHealthService = BrowserHealthService_1 = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [browser_pool_service_1.BrowserPoolService])
], BrowserHealthService);
//# sourceMappingURL=browser-health.service.js.map