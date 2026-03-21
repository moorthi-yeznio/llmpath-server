import { Module } from '@nestjs/common';
import { TenantEditorGuard } from '../auth/guards/tenant-editor.guard.js';
import { CoursesService } from './courses.service.js';
import { TenantCoursesController } from './tenant-courses.controller.js';

@Module({
  controllers: [TenantCoursesController],
  providers: [CoursesService, TenantEditorGuard],
})
export class CoursesModule {}
