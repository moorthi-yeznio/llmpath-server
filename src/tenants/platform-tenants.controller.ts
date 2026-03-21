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
import { PlatformAdminGuard } from '../auth/guards/platform-admin.guard.js';
import type { AppUser } from '../auth/types/app-user.js';
import { CreateTenantDto } from './dto/create-tenant.dto.js';
import { UpdateTenantDto } from './dto/update-tenant.dto.js';
import { TenantsService } from './tenants.service.js';

@ApiTags('tenants')
@ApiBearerAuth()
@Controller('tenants')
@UseGuards(PlatformAdminGuard)
export class PlatformTenantsController {
  constructor(private readonly tenants: TenantsService) {}

  @Get()
  @ApiOperation({ summary: 'List tenants (platform admin)' })
  list() {
    return this.tenants.listTenants();
  }

  @Post()
  @HttpCode(201)
  @Throttle({ default: { limit: 20, ttl: 60_000 } })
  @ApiOperation({ summary: 'Create tenant (platform admin)' })
  @ApiResponse({ status: 201 })
  create(
    @Body() body: CreateTenantDto,
    @Req() req: Request & { user: AppUser },
  ) {
    return this.tenants.createTenant(body.name, body.slug, req.user.id);
  }

  @Patch(':tenantId')
  @Throttle({ default: { limit: 20, ttl: 60_000 } })
  @ApiOperation({ summary: 'Update tenant (platform admin)' })
  patch(
    @Param('tenantId', ParseUUIDPipe) tenantId: string,
    @Body() body: UpdateTenantDto,
    @Req() req: Request & { user: AppUser },
  ) {
    return this.tenants.updateTenant(
      tenantId,
      { name: body.name, slug: body.slug },
      req.user.id,
    );
  }

  @Delete(':tenantId')
  @Throttle({ default: { limit: 20, ttl: 60_000 } })
  @ApiOperation({ summary: 'Delete tenant (platform admin)' })
  remove(
    @Param('tenantId', ParseUUIDPipe) tenantId: string,
    @Req() req: Request & { user: AppUser },
  ) {
    return this.tenants.deleteTenant(tenantId, req.user.id);
  }
}
