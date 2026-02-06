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
var FakeProxyProvider_1;
Object.defineProperty(exports, "__esModule", { value: true });
exports.FakeProxyProvider = void 0;
const common_1 = require("@nestjs/common");
const config_1 = require("@nestjs/config");
let FakeProxyProvider = FakeProxyProvider_1 = class FakeProxyProvider {
    configService;
    logger = new common_1.Logger(FakeProxyProvider_1.name);
    proxies = new Map();
    metrics = new Map();
    proxyCounter = 0;
    constructor(configService) {
        this.configService = configService;
        this.initializeProxies();
    }
    initializeProxies() {
        const proxyCount = 10;
        const costPerMB = this.configService.get('FAKE_PROXY_COST_PER_MB') || 0.001;
        for (let i = 1; i <= proxyCount; i++) {
            const proxyId = `fake-proxy-${i}`;
            const proxy = {
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
    async getProxy(domain) {
        this.proxyCounter = (this.proxyCounter + 1) % this.proxies.size;
        const proxyId = `fake-proxy-${this.proxyCounter + 1}`;
        const proxy = this.proxies.get(proxyId);
        if (!proxy) {
            throw new Error(`Proxy ${proxyId} not found`);
        }
        this.logger.debug(`Assigned ${proxyId} for domain ${domain}`);
        return { ...proxy };
    }
    async reportFailure(proxyId) {
        const metrics = this.metrics.get(proxyId);
        if (metrics) {
            metrics.failureCount++;
            metrics.lastFailure = new Date();
            this.logger.warn(`Proxy ${proxyId} failure reported (total: ${metrics.failureCount})`);
        }
    }
    async reportSuccess(proxyId, bytesUsed) {
        const metrics = this.metrics.get(proxyId);
        if (metrics) {
            metrics.successCount++;
            metrics.totalBytesUsed += bytesUsed;
            metrics.lastUsed = new Date();
            this.logger.debug(`Proxy ${proxyId} success (bytes: ${bytesUsed}, total: ${metrics.successCount})`);
        }
    }
    getRandomRegion() {
        const regions = ['us-east', 'us-west', 'eu-west', 'ap-south'];
        return regions[Math.floor(Math.random() * regions.length)];
    }
    getMetrics() {
        return new Map(this.metrics);
    }
};
exports.FakeProxyProvider = FakeProxyProvider;
exports.FakeProxyProvider = FakeProxyProvider = FakeProxyProvider_1 = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [config_1.ConfigService])
], FakeProxyProvider);
//# sourceMappingURL=fake-proxy.provider.js.map