import {
  Injectable,
  type CanActivate,
  type ExecutionContext,
  BadRequestException,
  ForbiddenException,
} from '@nestjs/common';
import type { Request } from 'express';
import type { AppUser } from '../auth/types/app-user.js';

/**
 * Allows access to student profile endpoints if:
 * 1. The actor is a platform admin, OR
 * 2. The actor is a tenant_admin in the requested tenant, OR
 * 3. The actor is the student themselves (userId param === req.user.id)
 */
@Injectable()
export class StudentProfileAccessGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const req = context
      .switchToHttp()
      .getRequest<Request & { user?: AppUser }>();
    const user = req.user;
    if (!user) {
      throw new ForbiddenException();
    }
    const tenantId = req.headers['x-organisation-id'];
    if (!tenantId || typeof tenantId !== 'string') {
      throw new BadRequestException('x-organisation-id header is required');
    }
    if (user.isPlatformAdmin) {
      return true;
    }
    const isTenantAdmin = user.memberships.some(
      (m) => m.organisationId === tenantId && m.role === 'tenant_admin',
    );
    if (isTenantAdmin) {
      return true;
    }
    const userId = req.params['userId'];
    if (userId && user.id === userId) {
      return true;
    }
    throw new ForbiddenException('Tenant admin or self access required');
  }
}
