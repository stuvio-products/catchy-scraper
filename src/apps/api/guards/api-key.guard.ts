import {
  Injectable,
  CanActivate,
  ExecutionContext,
  UnauthorizedException,
  Logger,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Observable } from 'rxjs';

@Injectable()
export class ApiKeyGuard implements CanActivate {
  private readonly logger = new Logger(ApiKeyGuard.name);
  private readonly apiKey: string;

  constructor(private readonly configService: ConfigService) {
    this.apiKey = this.configService.get<string>('API_KEY') || '';
    if (!this.apiKey) {
      throw new Error('API_KEY must be configured');
    }
  }

  canActivate(
    context: ExecutionContext,
  ): boolean | Promise<boolean> | Observable<boolean> {
    const request = context.switchToHttp().getRequest();
    const providedKey = request.headers['x-api-key'];

    if (!providedKey) {
      this.logger.warn('Missing API key in request');
      throw new UnauthorizedException('API key required');
    }

    if (providedKey !== this.apiKey) {
      this.logger.warn(`Invalid API key provided: ${providedKey}`);
      throw new UnauthorizedException('Invalid API key');
    }

    return true;
  }
}
