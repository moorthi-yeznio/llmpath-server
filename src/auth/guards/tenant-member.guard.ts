import {
  Injectable,
  type CanActivate,
  type ExecutionContext,
  BadRequestException,
  ForbiddenException,
} from '@nestjs/common';
import type { Request } from 'express';
import type { AppUser } from '../types/app-user.js';

/**
 * Grants access to any authenticated member of the target tenant (any role).
 * Used for student self-join actions and viewing own batch data.
 */
@Injectable()
export class TenantMemberGuard implements CanActivate {
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
    const isMember = user.memberships.some(
      (m) => m.organisationId === tenantId,
    );
    if (!isMember) {
      throw new ForbiddenException('Tenant membership required');
    }
    return true;
  }
}
