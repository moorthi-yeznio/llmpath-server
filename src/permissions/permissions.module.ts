import { Module } from '@nestjs/common';
import { DrizzleModule } from '../db/drizzle.module.js';
import { PermissionsService } from './permissions.service.js';
import { PermissionGuard } from './permission.guard.js';
import { PermissionsController } from './permissions.controller.js';

@Module({
  imports: [DrizzleModule],
  controllers: [PermissionsController],
  providers: [PermissionsService, PermissionGuard],
  exports: [PermissionsService, PermissionGuard],
})
export class PermissionsModule {}
