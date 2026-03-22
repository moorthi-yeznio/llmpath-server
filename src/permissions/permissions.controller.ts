import {
  Body,
  Controller,
  Get,
  HttpCode,
  Patch,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { TenantAccessGuard } from '../auth/guards/tenant-access.guard.js';
import { TenantId } from '../auth/decorators/tenant-id.decorator.js';
import { PermissionsService } from './permissions.service.js';
import { UpdatePermissionDto } from './dto/update-permission.dto.js';

@ApiTags('permissions')
@ApiBearerAuth()
@Controller('organisations/permissions')
@UseGuards(TenantAccessGuard)
export class PermissionsController {
  constructor(private readonly permissions: PermissionsService) {}

  @Get()
  @ApiOperation({
    summary:
      'Get enriched permission matrix (roles + permissions) for a tenant',
  })
  getMatrix(@TenantId() organisationId: string) {
    return this.permissions.getEnrichedMatrix(organisationId);
  }

  @Patch()
  @HttpCode(200)
  @ApiOperation({ summary: 'Update a single permission cell' })
  update(
    @TenantId() organisationId: string,
    @Body() body: UpdatePermissionDto,
  ) {
    return this.permissions.updatePermission(
      organisationId,
      body.role,
      body.resource,
      body.action,
      body.allowed,
    );
  }
}
