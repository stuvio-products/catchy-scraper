"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
var PrismaClientExceptionFilter_1;
Object.defineProperty(exports, "__esModule", { value: true });
exports.PrismaClientExceptionFilter = void 0;
const common_1 = require("@nestjs/common");
const core_1 = require("@nestjs/core");
const client_1 = require("@/prisma/client");
let PrismaClientExceptionFilter = PrismaClientExceptionFilter_1 = class PrismaClientExceptionFilter extends core_1.BaseExceptionFilter {
    logger = new common_1.Logger(PrismaClientExceptionFilter_1.name);
    catch(exception, host) {
        const ctx = host.switchToHttp();
        const response = ctx.getResponse();
        const request = ctx.getRequest();
        this.logger.error(`Prisma Error ${exception.code}: ${exception.message}`);
        switch (exception.code) {
            case 'P2025': {
                const status = common_1.HttpStatus.NOT_FOUND;
                const message = exception.message.replace(/\n/g, '');
                if (response.status && typeof response.send === 'function') {
                    response.status(status).send({
                        statusCode: status,
                        message: `Record not found`,
                        error: 'Not Found',
                        path: request.url,
                        timestamp: new Date().toISOString(),
                    });
                }
                else {
                    super.catch(exception, host);
                }
                break;
            }
            case 'P2002': {
                const status = common_1.HttpStatus.CONFLICT;
                const message = exception.message.replace(/\n/g, '');
                if (response.status && typeof response.send === 'function') {
                    response.status(status).send({
                        statusCode: status,
                        message: 'Unique constraint violation',
                        error: 'Conflict',
                        path: request.url,
                        timestamp: new Date().toISOString(),
                    });
                }
                else {
                    super.catch(exception, host);
                }
                break;
            }
            default:
                super.catch(exception, host);
                break;
        }
    }
};
exports.PrismaClientExceptionFilter = PrismaClientExceptionFilter;
exports.PrismaClientExceptionFilter = PrismaClientExceptionFilter = PrismaClientExceptionFilter_1 = __decorate([
    (0, common_1.Catch)(client_1.Prisma.PrismaClientKnownRequestError)
], PrismaClientExceptionFilter);
//# sourceMappingURL=prisma-client-exception.filter.js.map