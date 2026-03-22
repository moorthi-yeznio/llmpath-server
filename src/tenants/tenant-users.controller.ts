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
import { CreateTenantMemberDto } from './dto/create-tenant-member.dto.js';
import { PatchTenantUserDto } from './dto/patch-tenant-user.dto.js';
import { TenantsService } from './tenants.service.js';

@ApiTags('tenant-users')
@ApiBearerAuth()
@Controller('organisations/users')
@UseGuards(TenantAccessGuard)
export class TenantUsersController {
  constructor(private readonly tenants: TenantsService) {}

  @Get()
  @ApiOperation({
    summary: 'List users in tenant (tenant admin or platform admin)',
  })
  list(@TenantId() organisationId: string) {
    return this.tenants.listTenantUsers(organisationId);
  }

  @Post()
  @HttpCode(201)
  @Throttle({ default: { limit: 20, ttl: 60_000 } })
  @ApiOperation({
    summary: 'Add tenant member (tenant admin or platform admin)',
  })
  @ApiResponse({ status: 201 })
  create(
    @TenantId() organisationId: string,
    @Body() body: CreateTenantMemberDto,
    @Req() req: Request & { user: AppUser },
  ) {
    const actorRole = req.user.memberships.find(
      (m) => m.organisationId === organisationId,
    )?.role;
    return this.tenants.createTenantMember(
      organisationId,
      body.email,
      body.password,
      body.role,
      req.user.id,
      actorRole,
    );
  }

  @Patch(':userId')
  @Throttle({ default: { limit: 20, ttl: 60_000 } })
  @ApiOperation({
    summary:
      'Update tenant user flags e.g. ban (tenant admin or platform admin)',
  })
  patch(
    @TenantId() organisationId: string,
    @Param('userId', ParseUUIDPipe) userId: string,
    @Body() body: PatchTenantUserDto,
    @Req() req: Request & { user: AppUser },
  ) {
    return this.tenants.patchTenantUser(
      organisationId,
      userId,
      { banned: body.banned },
      req.user.id,
    );
  }

  @Delete(':userId')
  @Throttle({ default: { limit: 20, ttl: 60_000 } })
  @ApiOperation({
    summary: 'Remove user from tenant (tenant admin or platform admin)',
  })
  remove(
    @TenantId() organisationId: string,
    @Param('userId', ParseUUIDPipe) userId: string,
    @Req() req: Request & { user: AppUser },
  ) {
    return this.tenants.removeTenantMember(organisationId, userId, req.user.id);
  }
}
