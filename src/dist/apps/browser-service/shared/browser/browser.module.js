"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.BrowserModule = void 0;
const common_1 = require("@nestjs/common");
const config_1 = require("@nestjs/config");
const schedule_1 = require("@nestjs/schedule");
const proxy_module_1 = require("../proxy/proxy.module");
const browser_pool_service_1 = require("./services/browser-pool.service");
const browser_health_service_1 = require("./services/browser-health.service");
let BrowserModule = class BrowserModule {
};
exports.BrowserModule = BrowserModule;
exports.BrowserModule = BrowserModule = __decorate([
    (0, common_1.Module)({
        imports: [config_1.ConfigModule, schedule_1.ScheduleModule.forRoot(), proxy_module_1.ProxyModule],
        providers: [browser_pool_service_1.BrowserPoolService, browser_health_service_1.BrowserHealthService],
        exports: [browser_pool_service_1.BrowserPoolService],
    })
], BrowserModule);
//# sourceMappingURL=browser.module.js.map