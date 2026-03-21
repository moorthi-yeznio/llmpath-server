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
import type { AppUser } from '../auth/types/app-user.js';
import { CreateTenantMemberDto } from './dto/create-tenant-member.dto.js';
import { PatchTenantUserDto } from './dto/patch-tenant-user.dto.js';
import { TenantsService } from './tenants.service.js';

@ApiTags('tenant-users')
@ApiBearerAuth()
@Controller('tenants/:tenantId/users')
@UseGuards(TenantAccessGuard)
export class TenantUsersController {
  constructor(private readonly tenants: TenantsService) {}

  @Get()
  @ApiOperation({
    summary: 'List users in tenant (tenant admin or platform admin)',
  })
  list(@Param('tenantId', ParseUUIDPipe) tenantId: string) {
    return this.tenants.listTenantUsers(tenantId);
  }

  @Post()
  @HttpCode(201)
  @Throttle({ default: { limit: 20, ttl: 60_000 } })
  @ApiOperation({
    summary: 'Add tenant member (tenant admin or platform admin)',
  })
  @ApiResponse({ status: 201 })
  create(
    @Param('tenantId', ParseUUIDPipe) tenantId: string,
    @Body() body: CreateTenantMemberDto,
    @Req() req: Request & { user: AppUser },
  ) {
    return this.tenants.createTenantMember(
      tenantId,
      body.email,
      body.password,
      body.role,
      req.user.id,
    );
  }

  @Patch(':userId')
  @Throttle({ default: { limit: 20, ttl: 60_000 } })
  @ApiOperation({
    summary:
      'Update tenant user flags e.g. ban (tenant admin or platform admin)',
  })
  patch(
    @Param('tenantId', ParseUUIDPipe) tenantId: string,
    @Param('userId', ParseUUIDPipe) userId: string,
    @Body() body: PatchTenantUserDto,
    @Req() req: Request & { user: AppUser },
  ) {
    return this.tenants.patchTenantUser(
      tenantId,
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
    @Param('tenantId', ParseUUIDPipe) tenantId: string,
    @Param('userId', ParseUUIDPipe) userId: string,
    @Req() req: Request & { user: AppUser },
  ) {
    return this.tenants.removeTenantMember(tenantId, userId, req.user.id);
  }
}
