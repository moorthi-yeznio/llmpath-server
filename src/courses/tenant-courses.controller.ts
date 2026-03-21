import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Req,
  UseGuards,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOperation,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import type { Request } from 'express';
import { TenantEditorGuard } from '../auth/guards/tenant-editor.guard.js';
import type { AppUser } from '../auth/types/app-user.js';
import { CreateCourseDto } from './dto/create-course.dto.js';
import { UpdateCourseDto } from './dto/update-course.dto.js';
import { CoursesService } from './courses.service.js';

@ApiTags('courses')
@ApiBearerAuth()
@Controller('tenants/:tenantId/courses')
@UseGuards(TenantEditorGuard)
export class TenantCoursesController {
  constructor(private readonly courses: CoursesService) {}

  @Get()
  @ApiOperation({ summary: 'List courses for a tenant' })
  list(@Param('tenantId', ParseUUIDPipe) tenantId: string) {
    return this.courses.listCourses(tenantId);
  }

  @Get(':courseId')
  @ApiOperation({ summary: 'Get a single course' })
  get(
    @Param('tenantId', ParseUUIDPipe) tenantId: string,
    @Param('courseId', ParseUUIDPipe) courseId: string,
  ) {
    return this.courses.getCourse(tenantId, courseId);
  }

  @Post()
  @HttpCode(201)
  @Throttle({ default: { limit: 20, ttl: 60_000 } })
  @ApiOperation({ summary: 'Create a course' })
  @ApiResponse({ status: 201 })
  create(
    @Param('tenantId', ParseUUIDPipe) tenantId: string,
    @Body() body: CreateCourseDto,
    @Req() req: Request & { user: AppUser },
  ) {
    return this.courses.createCourse(tenantId, body, req.user.id);
  }

  @Patch(':courseId')
  @Throttle({ default: { limit: 20, ttl: 60_000 } })
  @ApiOperation({ summary: 'Update a course' })
  update(
    @Param('tenantId', ParseUUIDPipe) tenantId: string,
    @Param('courseId', ParseUUIDPipe) courseId: string,
    @Body() body: UpdateCourseDto,
    @Req() req: Request & { user: AppUser },
  ) {
    return this.courses.updateCourse(tenantId, courseId, body, req.user.id);
  }

  @Delete(':courseId')
  @HttpCode(204)
  @Throttle({ default: { limit: 20, ttl: 60_000 } })
  @ApiOperation({ summary: 'Delete a course' })
  remove(
    @Param('tenantId', ParseUUIDPipe) tenantId: string,
    @Param('courseId', ParseUUIDPipe) courseId: string,
    @Req() req: Request & { user: AppUser },
  ) {
    return this.courses.deleteCourse(tenantId, courseId, req.user.id);
  }
}
