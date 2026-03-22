import { Module } from '@nestjs/common';
import { PlatformAdminGuard } from '../auth/guards/platform-admin.guard.js';
import { TenantAccessGuard } from '../auth/guards/tenant-access.guard.js';
import {
  PlatformTenantAdminsController,
  PlatformTenantsController,
  TenantUsersController,
} from './tenant-controllers.js';
import { TenantsService } from './tenants.service.js';
import { PermissionsModule } from '../permissions/permissions.module.js';
import { MailModule } from '../mail/mail.module.js';

@Module({
  imports: [PermissionsModule, MailModule],
  controllers: [
    PlatformTenantsController,
    PlatformTenantAdminsController,
    TenantUsersController,
  ],
  providers: [TenantsService, PlatformAdminGuard, TenantAccessGuard],
})
export class TenantsModule {}
