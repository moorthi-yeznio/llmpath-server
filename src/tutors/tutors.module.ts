import { Module } from '@nestjs/common';
import { TenantAccessGuard } from '../auth/guards/tenant-access.guard.js';
import { TutorsService } from './tutors.service.js';
import { TenantTutorsController } from './tenant-tutors.controller.js';

@Module({
  controllers: [TenantTutorsController],
  providers: [TutorsService, TenantAccessGuard],
})
export class TutorsModule {}
