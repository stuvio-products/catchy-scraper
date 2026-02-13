import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import { BaseExceptionFilter } from '@nestjs/core';
import { Prisma } from '@/prisma/client';
import { Response } from 'express'; // or fastify

// Since we are using Fastify (checked via main.ts), we handle response accordingly.
// However, BaseExceptionFilter usually handles platform differences if we extend it properly.
// But for type safety, lets assume FastifyReply.
// Actually, NestFastifyApplication in main.ts indicates Fastify.
// Let's use the 'http' adapter approach which is agnostic or handle generic arguments.

@Catch(Prisma.PrismaClientKnownRequestError)
export class PrismaClientExceptionFilter extends BaseExceptionFilter {
  private readonly logger = new Logger(PrismaClientExceptionFilter.name);

  catch(exception: Prisma.PrismaClientKnownRequestError, host: ArgumentsHost) {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse();
    const request = ctx.getRequest();

    this.logger.error(`Prisma Error ${exception.code}: ${exception.message}`);

    switch (exception.code) {
      case 'P2025': {
        const status = HttpStatus.NOT_FOUND;
        const message = exception.message.replace(/\n/g, '');

        // Fastify response handling
        if (response.status && typeof response.send === 'function') {
          response.status(status).send({
            statusCode: status,
            message: `Record not found`, // Cleaner message
            error: 'Not Found',
            path: request.url,
            timestamp: new Date().toISOString(),
          });
        } else {
          super.catch(exception, host);
        }
        break;
      }
      case 'P2002': {
        const status = HttpStatus.CONFLICT;
        const message = exception.message.replace(/\n/g, '');

        if (response.status && typeof response.send === 'function') {
          response.status(status).send({
            statusCode: status,
            message: 'Unique constraint violation',
            error: 'Conflict',
            path: request.url,
            timestamp: new Date().toISOString(),
          });
        } else {
          super.catch(exception, host);
        }
        break;
      }
      default:
        // default 500
        super.catch(exception, host);
        break;
    }
  }
}
