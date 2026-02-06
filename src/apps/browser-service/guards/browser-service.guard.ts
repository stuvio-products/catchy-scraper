import {
  Injectable,
  CanActivate,
  ExecutionContext,
  UnauthorizedException,
  Logger,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

@Injectable()
export class BrowserServiceGuard implements CanActivate {
  private readonly logger = new Logger(BrowserServiceGuard.name);
  private readonly apiKey: string;

  constructor(private readonly configService: ConfigService) {
    this.apiKey =
      this.configService.get<string>('BROWSER_SERVICE_API_KEY') || '';
    if (!this.apiKey) {
      throw new Error('BROWSER_SERVICE_API_KEY must be configured');
    }
  }

  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest();
    const providedKey = request.headers['x-api-key'];

    if (!providedKey || providedKey !== this.apiKey) {
      this.logger.warn(`Unauthorized browser service access attempt`);
      throw new UnauthorizedException('Invalid or missing API key');
    }

    return true;
  }
}
