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
import { TenantEditorGuard } from '../auth/guards/tenant-editor.guard.js';
import { TenantMemberGuard } from '../auth/guards/tenant-member.guard.js';
import { BatchesService } from './batches.service.js';
import { CreateBatchDto } from './dto/create-batch.dto.js';
import { UpdateBatchDto } from './dto/update-batch.dto.js';
import { EnrollStudentDto } from './dto/enroll-student.dto.js';
import { JoinBatchDto } from './dto/join-batch.dto.js';

@ApiTags('batches')
@ApiBearerAuth()
@Controller('tenants/:tenantId/batches')
export class TenantBatchesController {
  constructor(private readonly batches: BatchesService) {}

  // ── LITERAL ROUTES FIRST (must appear before /:batchId) ──────────────────

  @Get('mine')
  @UseGuards(TenantMemberGuard)
  @ApiOperation({
    summary: 'List batches the authenticated user is enrolled in',
  })
  getMyBatches(
    @Param('tenantId', ParseUUIDPipe) tenantId: string,
    @Req() req: Request & { user: AppUser },
  ) {
    return this.batches.listMyBatches(tenantId, req.user.id);
  }

  @Get('available')
  @UseGuards(TenantMemberGuard)
  @ApiOperation({ summary: 'List active batches available to join' })
  getAvailable(@Param('tenantId', ParseUUIDPipe) tenantId: string) {
    return this.batches.listAvailableBatches(tenantId);
  }

  @Get('preview/:joinCode')
  @ApiOperation({
    summary: 'Preview batch info by join code (auth required, no tenant guard)',
  })
  previewByJoinCode(
    @Param('tenantId', ParseUUIDPipe) tenantId: string,
    @Param('joinCode') joinCode: string,
  ) {
    return this.batches.getBatchByJoinCode(tenantId, joinCode);
  }

  @Post('join')
  @HttpCode(200)
  @Throttle({ default: { limit: 20, ttl: 60_000 } })
  @UseGuards(TenantMemberGuard)
  @ApiOperation({ summary: 'Self-join a batch via join code' })
  joinBatch(
    @Param('tenantId', ParseUUIDPipe) tenantId: string,
    @Body() body: JoinBatchDto,
    @Req() req: Request & { user: AppUser },
  ) {
    return this.batches.joinByCode(tenantId, body, req.user.id);
  }

  // ── PARAMETERIZED ROUTES ─────────────────────────────────────────────────

  @Get()
  @UseGuards(TenantEditorGuard)
  @ApiOperation({ summary: 'List all batches in tenant' })
  list(@Param('tenantId', ParseUUIDPipe) tenantId: string) {
    return this.batches.listBatches(tenantId);
  }

  @Get(':batchId')
  @UseGuards(TenantEditorGuard)
  @ApiOperation({ summary: 'Get a batch' })
  get(
    @Param('tenantId', ParseUUIDPipe) tenantId: string,
    @Param('batchId', ParseUUIDPipe) batchId: string,
  ) {
    return this.batches.getBatch(tenantId, batchId);
  }

  @Post()
  @HttpCode(201)
  @Throttle({ default: { limit: 20, ttl: 60_000 } })
  @UseGuards(TenantEditorGuard)
  @ApiOperation({ summary: 'Create a batch' })
  @ApiResponse({ status: 201 })
  create(
    @Param('tenantId', ParseUUIDPipe) tenantId: string,
    @Body() body: CreateBatchDto,
    @Req() req: Request & { user: AppUser },
  ) {
    return this.batches.createBatch(tenantId, body, req.user.id);
  }

  @Patch(':batchId')
  @Throttle({ default: { limit: 20, ttl: 60_000 } })
  @UseGuards(TenantEditorGuard)
  @ApiOperation({ summary: 'Update a batch' })
  update(
    @Param('tenantId', ParseUUIDPipe) tenantId: string,
    @Param('batchId', ParseUUIDPipe) batchId: string,
    @Body() body: UpdateBatchDto,
    @Req() req: Request & { user: AppUser },
  ) {
    return this.batches.updateBatch(tenantId, batchId, body, req.user.id);
  }

  @Delete(':batchId')
  @HttpCode(204)
  @Throttle({ default: { limit: 20, ttl: 60_000 } })
  @UseGuards(TenantEditorGuard)
  @ApiOperation({ summary: 'Delete a batch' })
  remove(
    @Param('tenantId', ParseUUIDPipe) tenantId: string,
    @Param('batchId', ParseUUIDPipe) batchId: string,
    @Req() req: Request & { user: AppUser },
  ) {
    return this.batches.deleteBatch(tenantId, batchId, req.user.id);
  }

  // ── Enrollment sub-routes ─────────────────────────────────────────────────

  @Get(':batchId/enrollments')
  @UseGuards(TenantEditorGuard)
  @ApiOperation({ summary: 'List enrolled students for a batch' })
  listEnrollments(
    @Param('tenantId', ParseUUIDPipe) tenantId: string,
    @Param('batchId', ParseUUIDPipe) batchId: string,
  ) {
    return this.batches.listEnrollments(tenantId, batchId);
  }

  @Post(':batchId/enrollments')
  @HttpCode(201)
  @Throttle({ default: { limit: 20, ttl: 60_000 } })
  @UseGuards(TenantEditorGuard)
  @ApiOperation({ summary: 'Enroll a student in a batch' })
  @ApiResponse({ status: 201 })
  enroll(
    @Param('tenantId', ParseUUIDPipe) tenantId: string,
    @Param('batchId', ParseUUIDPipe) batchId: string,
    @Body() body: EnrollStudentDto,
    @Req() req: Request & { user: AppUser },
  ) {
    return this.batches.enrollStudent(tenantId, batchId, body, req.user.id);
  }

  @Delete(':batchId/enrollments/:studentId')
  @HttpCode(204)
  @Throttle({ default: { limit: 20, ttl: 60_000 } })
  @UseGuards(TenantEditorGuard)
  @ApiOperation({ summary: 'Remove a student from a batch' })
  removeEnrollment(
    @Param('tenantId', ParseUUIDPipe) tenantId: string,
    @Param('batchId', ParseUUIDPipe) batchId: string,
    @Param('studentId', ParseUUIDPipe) studentId: string,
    @Req() req: Request & { user: AppUser },
  ) {
    return this.batches.removeEnrollment(
      tenantId,
      batchId,
      studentId,
      req.user.id,
    );
  }
}
