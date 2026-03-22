import {
  BadRequestException,
  Body,
  ConflictException,
  Controller,
  Delete,
  Get,
  HttpCode,
  NotFoundException,
  Param,
  Patch,
  Post,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { and, asc, count, eq } from 'drizzle-orm';
import { Inject } from '@nestjs/common';
import type { NodePgDatabase } from 'drizzle-orm/node-postgres';
import { DRIZZLE } from '../db/drizzle.constants.js';
import * as schema from '../db/schema.js';
import { PlatformAdminGuard } from '../auth/guards/platform-admin.guard.js';
import { CreateRoleDto } from './dto/create-role.dto.js';
import { UpdateRoleDto } from './dto/update-role.dto.js';

// Resources and their actions — kept as code constants (features require code).
const RESOURCE_ACTIONS: Record<string, string[]> = {
  users: ['view', 'invite', 'edit', 'delete'],
  tutors: ['view', 'invite', 'edit', 'delete'],
  students: ['view', 'invite', 'edit', 'delete'],
  courses: ['view', 'create', 'edit', 'delete'],
  batches: ['view', 'create', 'edit', 'delete', 'enroll'],
};

function isPgUniqueViolation(err: unknown): boolean {
  return (
    typeof err === 'object' &&
    err !== null &&
    'code' in err &&
    (err as { code: string }).code === '23505'
  );
}

@ApiTags('admin / roles')
@ApiBearerAuth()
@Controller('admin/roles')
@UseGuards(PlatformAdminGuard)
export class RolesController {
  constructor(
    @Inject(DRIZZLE)
    private readonly db: NodePgDatabase<typeof schema>,
  ) {}

  @Get()
  @ApiOperation({ summary: 'List all roles' })
  async list() {
    const rows = await this.db
      .select()
      .from(schema.roles)
      .orderBy(asc(schema.roles.sortOrder));
    return { roles: rows };
  }

  @Post()
  @ApiOperation({
    summary: 'Create a new role (seeds deny-all defaults for all resources)',
  })
  async create(@Body() dto: CreateRoleDto) {
    try {
      const [role] = await this.db
        .insert(schema.roles)
        .values({
          key: dto.key,
          label: dto.label,
          isSystem: false,
          isAdmin: false,
          sortOrder: dto.sortOrder ?? 0,
        })
        .returning();

      // Seed deny-all defaults for every resource × action
      const defaults = Object.entries(RESOURCE_ACTIONS).flatMap(
        ([resource, actions]) =>
          actions.map((action) => ({
            roleKey: role.key,
            resourceKey: resource,
            actionKey: action,
            allowed: false,
          })),
      );

      if (defaults.length) {
        await this.db
          .insert(schema.rolePermissionDefaults)
          .values(defaults)
          .onConflictDoNothing();
      }

      return { role };
    } catch (e) {
      if (isPgUniqueViolation(e)) {
        throw new ConflictException(`Role key '${dto.key}' already exists`);
      }
      throw e;
    }
  }

  @Patch(':key')
  @HttpCode(200)
  @ApiOperation({ summary: 'Update role label or sort order' })
  async update(@Param('key') key: string, @Body() dto: UpdateRoleDto) {
    const patch: Partial<typeof schema.roles.$inferInsert> = {};
    if (dto.label !== undefined) patch.label = dto.label;
    if (dto.sortOrder !== undefined) patch.sortOrder = dto.sortOrder;

    if (!Object.keys(patch).length) {
      throw new BadRequestException('No fields to update');
    }

    const [updated] = await this.db
      .update(schema.roles)
      .set(patch)
      .where(eq(schema.roles.key, key))
      .returning();

    if (!updated) throw new NotFoundException(`Role '${key}' not found`);
    return { role: updated };
  }

  @Delete(':key')
  @HttpCode(200)
  @ApiOperation({
    summary: 'Delete a non-system role (fails if active members exist)',
  })
  async remove(@Param('key') key: string) {
    const [role] = await this.db
      .select()
      .from(schema.roles)
      .where(eq(schema.roles.key, key))
      .limit(1);

    if (!role) throw new NotFoundException(`Role '${key}' not found`);
    if (role.isSystem)
      throw new BadRequestException('System roles cannot be deleted');

    // Guard: refuse deletion if any membership uses this role key
    const [{ value: memberCount }] = await this.db
      .select({ value: count() })
      .from(schema.tenantMemberships)
      .where(eq(schema.tenantMemberships.role, key));

    if (Number(memberCount) > 0) {
      throw new BadRequestException(
        `Cannot delete role '${key}' — ${memberCount} active member(s) still use it`,
      );
    }

    await this.db
      .delete(schema.roles)
      .where(and(eq(schema.roles.key, key), eq(schema.roles.isSystem, false)));

    return { deleted: true as const, key };
  }
}
