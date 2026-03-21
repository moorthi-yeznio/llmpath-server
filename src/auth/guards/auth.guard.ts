import {
  Injectable,
  type CanActivate,
  type ExecutionContext,
  UnauthorizedException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { Request } from 'express';
import { IS_PUBLIC_KEY } from '../../common/decorators/public.decorator.js';
import { AuthService } from '../auth.service.js';

function extractBearer(header: string | undefined): string | undefined {
  if (!header?.startsWith('Bearer ')) {
    return undefined;
  }
  return header.slice('Bearer '.length).trim() || undefined;
}

@Injectable()
export class AuthGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly authService: AuthService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const req = context.switchToHttp().getRequest<Request>();
    const url = req.originalUrl ?? req.url ?? '';
    if (url.includes('/docs')) {
      return true;
    }

    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (isPublic) {
      return true;
    }

    const token = extractBearer(req.headers.authorization);
    if (!token) {
      throw new UnauthorizedException('Missing bearer token');
    }

    const user = await this.authService.validateAccessToken(token);
    req.user = user;
    return true;
  }
}
