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
import { TenantAccessGuard } from '../auth/guards/tenant-access.guard.js';
import { TenantId } from '../auth/decorators/tenant-id.decorator.js';
import type { AppUser } from '../auth/types/app-user.js';
import { UpsertTutorProfileDto } from './dto/upsert-tutor-profile.dto.js';
import { CreateTutorCertificationDto } from './dto/create-tutor-certification.dto.js';
import { CreateTutorSocialLinkDto } from './dto/create-tutor-social-link.dto.js';
import { TutorsService } from './tutors.service.js';

@ApiTags('tutors')
@ApiBearerAuth()
@Controller('organisations/users/:userId/tutor')
@UseGuards(TenantAccessGuard)
export class TenantTutorsController {
  constructor(private readonly tutors: TutorsService) {}

  // ─── Profile ──────────────────────────────────────────────────────────────

  @Get()
  @ApiOperation({
    summary: 'Get tutor profile with certifications and social links',
  })
  getProfile(
    @TenantId() organisationId: string,
    @Param('userId', ParseUUIDPipe) userId: string,
  ) {
    return this.tutors.getTutorProfile(organisationId, userId);
  }

  @Patch()
  @Throttle({ default: { limit: 20, ttl: 60_000 } })
  @ApiOperation({ summary: 'Create or update tutor profile' })
  upsertProfile(
    @TenantId() organisationId: string,
    @Param('userId', ParseUUIDPipe) userId: string,
    @Body() body: UpsertTutorProfileDto,
    @Req() req: Request & { user: AppUser },
  ) {
    return this.tutors.upsertTutorProfile(
      organisationId,
      userId,
      body,
      req.user.id,
    );
  }

  // ─── Certifications ───────────────────────────────────────────────────────

  @Post('certifications')
  @HttpCode(201)
  @Throttle({ default: { limit: 20, ttl: 60_000 } })
  @ApiOperation({ summary: 'Add a certification to a tutor' })
  @ApiResponse({ status: 201 })
  addCertification(
    @TenantId() organisationId: string,
    @Param('userId', ParseUUIDPipe) userId: string,
    @Body() body: CreateTutorCertificationDto,
    @Req() req: Request & { user: AppUser },
  ) {
    return this.tutors.addCertification(
      organisationId,
      userId,
      body,
      req.user.id,
    );
  }

  @Delete('certifications/:certId')
  @HttpCode(204)
  @Throttle({ default: { limit: 20, ttl: 60_000 } })
  @ApiOperation({ summary: 'Remove a certification from a tutor' })
  removeCertification(
    @TenantId() organisationId: string,
    @Param('certId', ParseUUIDPipe) certId: string,
    @Req() req: Request & { user: AppUser },
  ) {
    return this.tutors.removeCertification(organisationId, certId, req.user.id);
  }

  // ─── Social links ─────────────────────────────────────────────────────────

  @Post('social-links')
  @HttpCode(201)
  @Throttle({ default: { limit: 20, ttl: 60_000 } })
  @ApiOperation({ summary: 'Add or update a social link for a tutor' })
  @ApiResponse({ status: 201 })
  upsertSocialLink(
    @TenantId() organisationId: string,
    @Param('userId', ParseUUIDPipe) userId: string,
    @Body() body: CreateTutorSocialLinkDto,
    @Req() req: Request & { user: AppUser },
  ) {
    return this.tutors.upsertSocialLink(
      organisationId,
      userId,
      body,
      req.user.id,
    );
  }

  @Delete('social-links/:linkId')
  @HttpCode(204)
  @Throttle({ default: { limit: 20, ttl: 60_000 } })
  @ApiOperation({ summary: 'Remove a social link from a tutor' })
  removeSocialLink(
    @TenantId() organisationId: string,
    @Param('linkId', ParseUUIDPipe) linkId: string,
    @Req() req: Request & { user: AppUser },
  ) {
    return this.tutors.removeSocialLink(organisationId, linkId, req.user.id);
  }
}
