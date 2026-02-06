"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.BrowserServiceAppModule = void 0;
const common_1 = require("@nestjs/common");
const config_1 = require("@nestjs/config");
const schedule_1 = require("@nestjs/schedule");
const env_validation_1 = require("../../shared/config/env.validation");
const browser_module_1 = require("../../shared/browser/browser.module");
const browser_controller_1 = require("./controllers/browser.controller");
let BrowserServiceAppModule = class BrowserServiceAppModule {
};
exports.BrowserServiceAppModule = BrowserServiceAppModule;
exports.BrowserServiceAppModule = BrowserServiceAppModule = __decorate([
    (0, common_1.Module)({
        imports: [
            config_1.ConfigModule.forRoot({
                isGlobal: true,
                validationSchema: env_validation_1.validationSchema,
                envFilePath: '.env',
            }),
            schedule_1.ScheduleModule.forRoot(),
            browser_module_1.BrowserModule,
        ],
        controllers: [browser_controller_1.BrowserController],
    })
], BrowserServiceAppModule);
//# sourceMappingURL=app.module.js.map