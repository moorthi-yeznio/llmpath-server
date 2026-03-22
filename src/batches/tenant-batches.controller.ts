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
import { TenantMemberGuard } from '../auth/guards/tenant-member.guard.js';
import { TenantId } from '../auth/decorators/tenant-id.decorator.js';
import { RequirePermission } from '../permissions/require-permission.decorator.js';
import { BatchesService } from './batches.service.js';
import { CreateBatchDto } from './dto/create-batch.dto.js';
import { UpdateBatchDto } from './dto/update-batch.dto.js';
import { EnrollStudentDto } from './dto/enroll-student.dto.js';
import { JoinBatchDto } from './dto/join-batch.dto.js';

@ApiTags('batches')
@ApiBearerAuth()
@Controller('organisations/batches')
@UseGuards(TenantMemberGuard)
export class TenantBatchesController {
  constructor(private readonly batches: BatchesService) {}

  // ── LITERAL ROUTES FIRST (must appear before /:batchId) ──────────────────

  @Get('mine')
  @ApiOperation({
    summary: 'List batches the authenticated user is enrolled in',
  })
  getMyBatches(
    @TenantId() organisationId: string,
    @Req() req: Request & { user: AppUser },
  ) {
    return this.batches.listMyBatches(organisationId, req.user.id);
  }

  @Get('available')
  @ApiOperation({ summary: 'List active batches available to join' })
  getAvailable(@TenantId() organisationId: string) {
    return this.batches.listAvailableBatches(organisationId);
  }

  @Get('preview/:joinCode')
  @ApiOperation({
    summary: 'Preview batch info by join code (auth required, no tenant guard)',
  })
  previewByJoinCode(
    @TenantId() organisationId: string,
    @Param('joinCode') joinCode: string,
  ) {
    return this.batches.getBatchByJoinCode(organisationId, joinCode);
  }

  @Post('join')
  @HttpCode(200)
  @RequirePermission('batches', 'enroll')
  @Throttle({ default: { limit: 20, ttl: 60_000 } })
  @ApiOperation({ summary: 'Self-join a batch via join code' })
  joinBatch(
    @TenantId() organisationId: string,
    @Body() body: JoinBatchDto,
    @Req() req: Request & { user: AppUser },
  ) {
    return this.batches.joinByCode(organisationId, body, req.user.id);
  }

  // ── PARAMETERIZED ROUTES ─────────────────────────────────────────────────

  @Get()
  @RequirePermission('batches', 'view')
  @ApiOperation({ summary: 'List all batches in tenant' })
  list(@TenantId() organisationId: string) {
    return this.batches.listBatches(organisationId);
  }

  @Get(':batchId')
  @RequirePermission('batches', 'view')
  @ApiOperation({ summary: 'Get a batch' })
  get(
    @TenantId() organisationId: string,
    @Param('batchId', ParseUUIDPipe) batchId: string,
  ) {
    return this.batches.getBatch(organisationId, batchId);
  }

  @Post()
  @HttpCode(201)
  @RequirePermission('batches', 'create')
  @Throttle({ default: { limit: 20, ttl: 60_000 } })
  @ApiOperation({ summary: 'Create a batch' })
  @ApiResponse({ status: 201 })
  create(
    @TenantId() organisationId: string,
    @Body() body: CreateBatchDto,
    @Req() req: Request & { user: AppUser },
  ) {
    return this.batches.createBatch(organisationId, body, req.user.id);
  }

  @Patch(':batchId')
  @RequirePermission('batches', 'edit')
  @Throttle({ default: { limit: 20, ttl: 60_000 } })
  @ApiOperation({ summary: 'Update a batch' })
  update(
    @TenantId() organisationId: string,
    @Param('batchId', ParseUUIDPipe) batchId: string,
    @Body() body: UpdateBatchDto,
    @Req() req: Request & { user: AppUser },
  ) {
    return this.batches.updateBatch(organisationId, batchId, body, req.user.id);
  }

  @Delete(':batchId')
  @HttpCode(204)
  @RequirePermission('batches', 'delete')
  @Throttle({ default: { limit: 20, ttl: 60_000 } })
  @ApiOperation({ summary: 'Delete a batch' })
  remove(
    @TenantId() organisationId: string,
    @Param('batchId', ParseUUIDPipe) batchId: string,
    @Req() req: Request & { user: AppUser },
  ) {
    return this.batches.deleteBatch(organisationId, batchId, req.user.id);
  }

  // ── Enrollment sub-routes ─────────────────────────────────────────────────

  @Get(':batchId/enrollments')
  @RequirePermission('batches', 'view')
  @ApiOperation({ summary: 'List enrolled students for a batch' })
  listEnrollments(
    @TenantId() organisationId: string,
    @Param('batchId', ParseUUIDPipe) batchId: string,
  ) {
    return this.batches.listEnrollments(organisationId, batchId);
  }

  @Post(':batchId/enrollments')
  @HttpCode(201)
  @RequirePermission('batches', 'enroll')
  @Throttle({ default: { limit: 20, ttl: 60_000 } })
  @ApiOperation({ summary: 'Enroll a student in a batch' })
  @ApiResponse({ status: 201 })
  enroll(
    @TenantId() organisationId: string,
    @Param('batchId', ParseUUIDPipe) batchId: string,
    @Body() body: EnrollStudentDto,
    @Req() req: Request & { user: AppUser },
  ) {
    return this.batches.enrollStudent(
      organisationId,
      batchId,
      body,
      req.user.id,
    );
  }

  @Delete(':batchId/enrollments/:studentId')
  @HttpCode(204)
  @RequirePermission('batches', 'edit')
  @Throttle({ default: { limit: 20, ttl: 60_000 } })
  @ApiOperation({ summary: 'Remove a student from a batch' })
  removeEnrollment(
    @TenantId() organisationId: string,
    @Param('batchId', ParseUUIDPipe) batchId: string,
    @Param('studentId', ParseUUIDPipe) studentId: string,
    @Req() req: Request & { user: AppUser },
  ) {
    return this.batches.removeEnrollment(
      organisationId,
      batchId,
      studentId,
      req.user.id,
    );
  }
}
