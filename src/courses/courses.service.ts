import { Inject, Injectable, NotFoundException } from '@nestjs/common';
import { and, eq } from 'drizzle-orm';
import type { NodePgDatabase } from 'drizzle-orm/node-postgres';
import { DRIZZLE } from '../db/drizzle.constants.js';
import * as schema from '../db/schema.js';
import { AuditService } from '../audit/audit.service.js';
import type { CreateCourseDto } from './dto/create-course.dto.js';
import type { UpdateCourseDto } from './dto/update-course.dto.js';

@Injectable()
export class CoursesService {
  constructor(
    @Inject(DRIZZLE)
    private readonly db: NodePgDatabase<typeof schema>,
    private readonly audit: AuditService,
  ) {}

  async listCourses(tenantId: string) {
    const rows = await this.db
      .select({
        id: schema.courses.id,
        tenant_id: schema.courses.organisationId,
        title: schema.courses.title,
        description: schema.courses.description,
        status: schema.courses.status,
        thumbnail_url: schema.courses.thumbnailUrl,
        duration_minutes: schema.courses.durationMinutes,
        level: schema.courses.level,
        created_by: schema.courses.createdBy,
        created_at: schema.courses.createdAt,
        updated_at: schema.courses.updatedAt,
      })
      .from(schema.courses)
      .where(eq(schema.courses.organisationId, tenantId))
      .orderBy(schema.courses.createdAt);
    return { courses: rows };
  }

  async getCourse(tenantId: string, courseId: string) {
    const [row] = await this.db
      .select({
        id: schema.courses.id,
        tenant_id: schema.courses.organisationId,
        title: schema.courses.title,
        description: schema.courses.description,
        status: schema.courses.status,
        thumbnail_url: schema.courses.thumbnailUrl,
        duration_minutes: schema.courses.durationMinutes,
        level: schema.courses.level,
        created_by: schema.courses.createdBy,
        created_at: schema.courses.createdAt,
        updated_at: schema.courses.updatedAt,
      })
      .from(schema.courses)
      .where(
        and(
          eq(schema.courses.id, courseId),
          eq(schema.courses.organisationId, tenantId),
        ),
      );

    if (!row) throw new NotFoundException('Course not found');
    return { course: row };
  }

  async createCourse(
    tenantId: string,
    dto: CreateCourseDto,
    actorUserId: string,
  ) {
    const [row] = await this.db
      .insert(schema.courses)
      .values({
        organisationId: tenantId,
        title: dto.title,
        description: dto.description ?? null,
        status: dto.status ?? 'draft',
        thumbnailUrl: dto.thumbnail_url ?? null,
        durationMinutes: dto.duration_minutes ?? null,
        level: dto.level ?? null,
        createdBy: actorUserId,
      })
      .returning({
        id: schema.courses.id,
        tenant_id: schema.courses.organisationId,
        title: schema.courses.title,
        description: schema.courses.description,
        status: schema.courses.status,
        thumbnail_url: schema.courses.thumbnailUrl,
        duration_minutes: schema.courses.durationMinutes,
        level: schema.courses.level,
        created_by: schema.courses.createdBy,
        created_at: schema.courses.createdAt,
        updated_at: schema.courses.updatedAt,
      });

    this.audit.log({
      actorUserId,
      entityType: 'course',
      entityId: row.id,
      action: 'create',
      tenantId,
      after: row,
    });

    return { course: row };
  }

  async updateCourse(
    tenantId: string,
    courseId: string,
    dto: UpdateCourseDto,
    actorUserId: string,
  ) {
    const existing = await this.getCourse(tenantId, courseId);

    const [row] = await this.db
      .update(schema.courses)
      .set({
        ...(dto.title !== undefined && { title: dto.title }),
        ...(dto.description !== undefined && { description: dto.description }),
        ...(dto.status !== undefined && { status: dto.status }),
        ...(dto.thumbnail_url !== undefined && {
          thumbnailUrl: dto.thumbnail_url,
        }),
        ...(dto.duration_minutes !== undefined && {
          durationMinutes: dto.duration_minutes,
        }),
        ...(dto.level !== undefined && { level: dto.level }),
        updatedAt: new Date(),
      })
      .where(
        and(
          eq(schema.courses.id, courseId),
          eq(schema.courses.organisationId, tenantId),
        ),
      )
      .returning({
        id: schema.courses.id,
        tenant_id: schema.courses.organisationId,
        title: schema.courses.title,
        description: schema.courses.description,
        status: schema.courses.status,
        thumbnail_url: schema.courses.thumbnailUrl,
        duration_minutes: schema.courses.durationMinutes,
        level: schema.courses.level,
        created_by: schema.courses.createdBy,
        created_at: schema.courses.createdAt,
        updated_at: schema.courses.updatedAt,
      });

    this.audit.log({
      actorUserId,
      entityType: 'course',
      entityId: courseId,
      action: 'update',
      tenantId,
      before: existing.course,
      after: row,
    });

    return { course: row };
  }

  async deleteCourse(tenantId: string, courseId: string, actorUserId: string) {
    const existing = await this.getCourse(tenantId, courseId);

    await this.db
      .delete(schema.courses)
      .where(
        and(
          eq(schema.courses.id, courseId),
          eq(schema.courses.organisationId, tenantId),
        ),
      );

    this.audit.log({
      actorUserId,
      entityType: 'course',
      entityId: courseId,
      action: 'delete',
      tenantId,
      before: existing.course,
    });
  }
}
