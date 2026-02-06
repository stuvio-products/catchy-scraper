"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const core_1 = require("@nestjs/core");
const common_1 = require("@nestjs/common");
const config_1 = require("@nestjs/config");
const app_module_1 = require("./app.module");
async function bootstrap() {
    const logger = new common_1.Logger('BrowserService');
    const app = await core_1.NestFactory.create(app_module_1.BrowserServiceAppModule);
    const configService = app.get(config_1.ConfigService);
    const port = configService.get('BROWSER_SERVICE_PORT') || 3001;
    app.useGlobalPipes(new common_1.ValidationPipe({
        whitelist: true,
        forbidNonWhitelisted: true,
        transform: true,
    }));
    app.enableShutdownHooks();
    await app.listen(port);
    logger.log(`🌐 Browser Service running on http://localhost:${port}`);
    logger.log('⚠️  This service should NOT be exposed publicly!');
}
bootstrap();
//# sourceMappingURL=main.js.map