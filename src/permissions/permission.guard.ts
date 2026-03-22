import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { Request } from 'express';
import type { AppUser } from '../auth/types/app-user.js';
import {
  PERMISSION_KEY,
  type PermissionMeta,
} from './require-permission.decorator.js';
import { PermissionsService } from './permissions.service.js';

@Injectable()
export class PermissionGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly permissions: PermissionsService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const meta = this.reflector.get<PermissionMeta | undefined>(
      PERMISSION_KEY,
      context.getHandler(),
    );
    // No @RequirePermission on this handler → pass through
    if (!meta) return true;

    const req = context
      .switchToHttp()
      .getRequest<Request & { user?: AppUser }>();
    const user = req.user;

    // Should never happen (AuthGuard runs first), but be defensive
    if (!user) return false;

    // Platform admins bypass all permission checks
    if (user.isPlatformAdmin) return true;

    const tenantId = req.headers['x-organisation-id'];
    if (!tenantId || typeof tenantId !== 'string') return true;

    const membership = user.memberships.find(
      (m) => m.organisationId === tenantId,
    );
    if (!membership) {
      throw new ForbiddenException('Not a member of this tenant');
    }

    const allowed = await this.permissions.hasPermission(
      tenantId,
      membership.role,
      meta.resource,
      meta.action,
    );

    if (!allowed) {
      throw new ForbiddenException(
        `Permission denied: ${meta.resource}:${meta.action}`,
      );
    }

    return true;
  }
}
