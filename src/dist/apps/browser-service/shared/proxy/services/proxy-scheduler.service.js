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
var ProxySchedulerService_1;
Object.defineProperty(exports, "__esModule", { value: true });
exports.ProxySchedulerService = void 0;
const common_1 = require("@nestjs/common");
let ProxySchedulerService = ProxySchedulerService_1 = class ProxySchedulerService {
    proxyProvider;
    logger = new common_1.Logger(ProxySchedulerService_1.name);
    domainToProxy = new Map();
    constructor(proxyProvider) {
        this.proxyProvider = proxyProvider;
    }
    async selectProxy(domain) {
        const cachedProxyId = this.domainToProxy.get(domain);
        if (cachedProxyId) {
            this.logger.debug(`Using sticky proxy ${cachedProxyId} for domain ${domain}`);
        }
        const proxy = await this.proxyProvider.getProxy(domain);
        this.domainToProxy.set(domain, proxy.id);
        return proxy;
    }
    async reportProxyFailure(proxyId, domain) {
        this.logger.warn(`Proxy ${proxyId} failed for domain ${domain}`);
        await this.proxyProvider.reportFailure(proxyId);
        this.domainToProxy.delete(domain);
    }
    async reportProxySuccess(proxyId, bytesUsed) {
        await this.proxyProvider.reportSuccess(proxyId, bytesUsed);
    }
};
exports.ProxySchedulerService = ProxySchedulerService;
exports.ProxySchedulerService = ProxySchedulerService = ProxySchedulerService_1 = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [Object])
], ProxySchedulerService);
//# sourceMappingURL=proxy-scheduler.service.js.map