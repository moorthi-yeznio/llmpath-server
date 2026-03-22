import { SetMetadata } from '@nestjs/common';

export const PERMISSION_KEY = 'permission';

export interface PermissionMeta {
  resource: string;
  action: string;
}

/** Marks a route as requiring a specific permission. Enforced by PermissionGuard. */
export const RequirePermission = (resource: string, action: string) =>
  SetMetadata(PERMISSION_KEY, { resource, action } satisfies PermissionMeta);
