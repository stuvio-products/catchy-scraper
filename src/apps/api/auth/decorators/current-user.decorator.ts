import { createParamDecorator, ExecutionContext } from '@nestjs/common';
import type { RequestUser } from '@/apps/api/auth/entities/auth.entities';

export const CurrentUser = createParamDecorator(
  (data: unknown, ctx: ExecutionContext): RequestUser => {
    const request = ctx.switchToHttp().getRequest();
    return request.user as RequestUser;
  },
);
