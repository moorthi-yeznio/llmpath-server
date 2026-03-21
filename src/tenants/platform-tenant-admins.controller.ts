import {
  Body,
  Controller,
  Delete,
  HttpCode,
  Param,
  ParseUUIDPipe,
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
import { PlatformAdminGuard } from '../auth/guards/platform-admin.guard.js';
import type { AppUser } from '../auth/types/app-user.js';
import { AssignTenantAdminDto } from './dto/assign-tenant-admin.dto.js';
import { TenantsService } from './tenants.service.js';

@ApiTags('tenants')
@ApiBearerAuth()
@Controller('tenants')
@UseGuards(PlatformAdminGuard)
export class PlatformTenantAdminsController {
  constructor(private readonly tenants: TenantsService) {}

  @Post(':tenantId/admins')
  @HttpCode(201)
  @Throttle({ default: { limit: 20, ttl: 60_000 } })
  @ApiOperation({
    summary: 'Assign tenant admin (create auth user if needed; platform admin)',
  })
  @ApiResponse({ status: 201 })
  assign(
    @Param('tenantId', ParseUUIDPipe) tenantId: string,
    @Body() body: AssignTenantAdminDto,
    @Req() req: Request & { user: AppUser },
  ) {
    return this.tenants.assignTenantAdmin(
      tenantId,
      body.email,
      body.password,
      req.user.id,
    );
  }

  @Delete(':tenantId/admins/:userId')
  @Throttle({ default: { limit: 20, ttl: 60_000 } })
  @ApiOperation({ summary: 'Remove tenant admin membership (platform admin)' })
  remove(
    @Param('tenantId', ParseUUIDPipe) tenantId: string,
    @Param('userId', ParseUUIDPipe) userId: string,
    @Req() req: Request & { user: AppUser },
  ) {
    return this.tenants.removeTenantAdmin(tenantId, userId, req.user.id);
  }
}
