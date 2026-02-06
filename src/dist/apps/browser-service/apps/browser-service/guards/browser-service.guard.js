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
var BrowserServiceGuard_1;
Object.defineProperty(exports, "__esModule", { value: true });
exports.BrowserServiceGuard = void 0;
const common_1 = require("@nestjs/common");
const config_1 = require("@nestjs/config");
let BrowserServiceGuard = BrowserServiceGuard_1 = class BrowserServiceGuard {
    configService;
    logger = new common_1.Logger(BrowserServiceGuard_1.name);
    apiKey;
    constructor(configService) {
        this.configService = configService;
        this.apiKey =
            this.configService.get('BROWSER_SERVICE_API_KEY') || '';
        if (!this.apiKey) {
            throw new Error('BROWSER_SERVICE_API_KEY must be configured');
        }
    }
    canActivate(context) {
        const request = context.switchToHttp().getRequest();
        const providedKey = request.headers['x-api-key'];
        if (!providedKey || providedKey !== this.apiKey) {
            this.logger.warn(`Unauthorized browser service access attempt`);
            throw new common_1.UnauthorizedException('Invalid or missing API key');
        }
        return true;
    }
};
exports.BrowserServiceGuard = BrowserServiceGuard;
exports.BrowserServiceGuard = BrowserServiceGuard = BrowserServiceGuard_1 = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [config_1.ConfigService])
], BrowserServiceGuard);
//# sourceMappingURL=browser-service.guard.js.map