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
import { TenantMemberGuard } from '../auth/guards/tenant-member.guard.js';
import { TenantId } from '../auth/decorators/tenant-id.decorator.js';
import type { AppUser } from '../auth/types/app-user.js';
import { RequirePermission } from '../permissions/require-permission.decorator.js';
import { CreateCourseDto } from './dto/create-course.dto.js';
import { UpdateCourseDto } from './dto/update-course.dto.js';
import { CoursesService } from './courses.service.js';

@ApiTags('courses')
@ApiBearerAuth()
@Controller('organisations/courses')
@UseGuards(TenantMemberGuard)
export class TenantCoursesController {
  constructor(private readonly courses: CoursesService) {}

  @Get()
  @RequirePermission('courses', 'view')
  @ApiOperation({ summary: 'List courses for a tenant' })
  list(@TenantId() organisationId: string) {
    return this.courses.listCourses(organisationId);
  }

  @Get(':courseId')
  @RequirePermission('courses', 'view')
  @ApiOperation({ summary: 'Get a single course' })
  get(
    @TenantId() organisationId: string,
    @Param('courseId', ParseUUIDPipe) courseId: string,
  ) {
    return this.courses.getCourse(organisationId, courseId);
  }

  @Post()
  @HttpCode(201)
  @RequirePermission('courses', 'create')
  @Throttle({ default: { limit: 20, ttl: 60_000 } })
  @ApiOperation({ summary: 'Create a course' })
  @ApiResponse({ status: 201 })
  create(
    @TenantId() organisationId: string,
    @Body() body: CreateCourseDto,
    @Req() req: Request & { user: AppUser },
  ) {
    return this.courses.createCourse(organisationId, body, req.user.id);
  }

  @Patch(':courseId')
  @RequirePermission('courses', 'edit')
  @Throttle({ default: { limit: 20, ttl: 60_000 } })
  @ApiOperation({ summary: 'Update a course' })
  update(
    @TenantId() organisationId: string,
    @Param('courseId', ParseUUIDPipe) courseId: string,
    @Body() body: UpdateCourseDto,
    @Req() req: Request & { user: AppUser },
  ) {
    return this.courses.updateCourse(
      organisationId,
      courseId,
      body,
      req.user.id,
    );
  }

  @Delete(':courseId')
  @HttpCode(204)
  @RequirePermission('courses', 'delete')
  @Throttle({ default: { limit: 20, ttl: 60_000 } })
  @ApiOperation({ summary: 'Delete a course' })
  remove(
    @TenantId() organisationId: string,
    @Param('courseId', ParseUUIDPipe) courseId: string,
    @Req() req: Request & { user: AppUser },
  ) {
    return this.courses.deleteCourse(organisationId, courseId, req.user.id);
  }
}
