import { Module } from '@nestjs/common';
import { StudentProfileAccessGuard } from './student-profile-access.guard.js';
import { StudentsService } from './students.service.js';
import { TenantStudentsController } from './tenant-students.controller.js';

@Module({
  controllers: [TenantStudentsController],
  providers: [StudentsService, StudentProfileAccessGuard],
})
export class StudentsModule {}
