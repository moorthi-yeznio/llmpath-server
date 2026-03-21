import {
  Injectable,
  type CanActivate,
  type ExecutionContext,
  ForbiddenException,
} from '@nestjs/common';
import type { Request } from 'express';
import type { AppUser } from '../types/app-user.js';

@Injectable()
export class PlatformAdminGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const req = context
      .switchToHttp()
      .getRequest<Request & { user?: AppUser }>();
    const user = req.user;
    if (!user?.isPlatformAdmin) {
      throw new ForbiddenException('Platform admin access required');
    }
    return true;
  }
}
