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
import type { AppUser } from '../auth/types/app-user.js';
import { StudentProfileAccessGuard } from './student-profile-access.guard.js';
import { UpsertStudentProfileDto } from './dto/upsert-student-profile.dto.js';
import { CreateStudentContactDto } from './dto/create-student-contact.dto.js';
import { StudentsService } from './students.service.js';

@ApiTags('students')
@ApiBearerAuth()
@Controller('tenants/:tenantId/users/:userId/student')
@UseGuards(StudentProfileAccessGuard)
export class TenantStudentsController {
  constructor(private readonly students: StudentsService) {}

  // ─── Profile ──────────────────────────────────────────────────────────────

  @Get()
  @ApiOperation({ summary: 'Get student profile with emergency contacts' })
  getProfile(
    @Param('tenantId', ParseUUIDPipe) tenantId: string,
    @Param('userId', ParseUUIDPipe) userId: string,
  ) {
    return this.students.getStudentProfile(tenantId, userId);
  }

  @Patch()
  @Throttle({ default: { limit: 20, ttl: 60_000 } })
  @ApiOperation({ summary: 'Create or update student profile' })
  upsertProfile(
    @Param('tenantId', ParseUUIDPipe) tenantId: string,
    @Param('userId', ParseUUIDPipe) userId: string,
    @Body() body: UpsertStudentProfileDto,
    @Req() req: Request & { user: AppUser },
  ) {
    return this.students.upsertStudentProfile(
      tenantId,
      userId,
      body,
      req.user.id,
    );
  }

  // ─── Emergency contacts ───────────────────────────────────────────────────

  @Post('emergency-contacts')
  @HttpCode(201)
  @Throttle({ default: { limit: 20, ttl: 60_000 } })
  @ApiOperation({ summary: 'Add an emergency contact for a student' })
  @ApiResponse({ status: 201 })
  addContact(
    @Param('tenantId', ParseUUIDPipe) tenantId: string,
    @Param('userId', ParseUUIDPipe) userId: string,
    @Body() body: CreateStudentContactDto,
    @Req() req: Request & { user: AppUser },
  ) {
    return this.students.addEmergencyContact(
      tenantId,
      userId,
      body,
      req.user.id,
    );
  }

  @Delete('emergency-contacts/:contactId')
  @HttpCode(204)
  @Throttle({ default: { limit: 20, ttl: 60_000 } })
  @ApiOperation({ summary: 'Remove an emergency contact from a student' })
  removeContact(
    @Param('tenantId', ParseUUIDPipe) tenantId: string,
    @Param('contactId', ParseUUIDPipe) contactId: string,
    @Req() req: Request & { user: AppUser },
  ) {
    return this.students.removeEmergencyContact(
      tenantId,
      contactId,
      req.user.id,
    );
  }
}
