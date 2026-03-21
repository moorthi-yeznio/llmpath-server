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
 * Grants access to platform admins, tenant admins, and tutors within the target tenant.
 * Used for resources that tutors can create and manage (e.g. courses).
 */
@Injectable()
export class TenantEditorGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const req = context
      .switchToHttp()
      .getRequest<Request & { user?: AppUser }>();
    const user = req.user;
    if (!user) {
      throw new ForbiddenException();
    }
    const tenantId = req.params['tenantId'];
    if (!tenantId) {
      throw new BadRequestException('tenantId is required');
    }
    if (user.isPlatformAdmin) {
      return true;
    }
    const allowed = user.memberships.some(
      (m) =>
        m.tenantId === tenantId &&
        (m.role === 'tenant_admin' || m.role === 'tutor'),
    );
    if (!allowed) {
      throw new ForbiddenException(
        'Tenant admin, tutor, or platform admin access required',
      );
    }
    return true;
  }
}
