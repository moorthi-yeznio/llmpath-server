import {
  BadRequestException,
  ConflictException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { and, eq, sql } from 'drizzle-orm';
import type { NodePgDatabase } from 'drizzle-orm/node-postgres';
import { randomBytes } from 'node:crypto';
import { DRIZZLE } from '../db/drizzle.constants.js';
import * as schema from '../db/schema.js';
import { AuditService } from '../audit/audit.service.js';
import type { CreateBatchDto } from './dto/create-batch.dto.js';
import type { UpdateBatchDto } from './dto/update-batch.dto.js';
import type { EnrollStudentDto } from './dto/enroll-student.dto.js';
import type { JoinBatchDto } from './dto/join-batch.dto.js';

// ─── Select shapes ────────────────────────────────────────────────────────────

const BATCH_SHAPE = {
  id: schema.batches.id,
  tenant_id: schema.batches.tenantId,
  course_id: schema.batches.courseId,
  tutor_id: schema.batches.tutorId,
  name: schema.batches.name,
  status: schema.batches.status,
  start_date: schema.batches.startDate,
  end_date: schema.batches.endDate,
  max_students: schema.batches.maxStudents,
  join_code: schema.batches.joinCode,
  created_by: schema.batches.createdBy,
  created_at: schema.batches.createdAt,
  updated_at: schema.batches.updatedAt,
};

const ENROLLMENT_SHAPE = {
  id: schema.batchEnrollments.id,
  batch_id: schema.batchEnrollments.batchId,
  student_id: schema.batchEnrollments.studentId,
  tenant_id: schema.batchEnrollments.tenantId,
  enrolled_by: schema.batchEnrollments.enrolledBy,
  enrolled_at: schema.batchEnrollments.enrolledAt,
};

// ─── Helpers ──────────────────────────────────────────────────────────────────

function isPgUniqueViolation(err: unknown): boolean {
  return (
    typeof err === 'object' &&
    err !== null &&
    'code' in err &&
    (err as { code: string }).code === '23505'
  );
}

// ─── Service ──────────────────────────────────────────────────────────────────

@Injectable()
export class BatchesService {
  constructor(
    @Inject(DRIZZLE)
    private readonly db: NodePgDatabase<typeof schema>,
    private readonly audit: AuditService,
  ) {}

  private async generateUniqueJoinCode(): Promise<string> {
    for (let attempt = 0; attempt < 3; attempt++) {
      const code = randomBytes(4).toString('hex');
      const existing = await this.db
        .select({ id: schema.batches.id })
        .from(schema.batches)
        .where(eq(schema.batches.joinCode, code));
      if (existing.length === 0) return code;
    }
    throw new Error('Failed to generate unique join code after 3 attempts');
  }

  // ── Batch CRUD ────────────────────────────────────────────────────────────

  async listBatches(tenantId: string) {
    const rows = await this.db
      .select(BATCH_SHAPE)
      .from(schema.batches)
      .where(eq(schema.batches.tenantId, tenantId))
      .orderBy(schema.batches.createdAt);
    return { batches: rows };
  }

  async getBatch(tenantId: string, batchId: string) {
    const [row] = await this.db
      .select(BATCH_SHAPE)
      .from(schema.batches)
      .where(
        and(
          eq(schema.batches.id, batchId),
          eq(schema.batches.tenantId, tenantId),
        ),
      );
    if (!row) throw new NotFoundException('Batch not found');
    return { batch: row };
  }

  async createBatch(
    tenantId: string,
    dto: CreateBatchDto,
    actorUserId: string,
  ) {
    const joinCode = await this.generateUniqueJoinCode();

    const [row] = await this.db
      .insert(schema.batches)
      .values({
        tenantId,
        courseId: dto.course_id,
        tutorId: dto.tutor_id ?? null,
        name: dto.name,
        status: dto.status ?? 'draft',
        startDate: dto.start_date ?? null,
        endDate: dto.end_date ?? null,
        maxStudents: dto.max_students ?? null,
        joinCode,
        createdBy: actorUserId,
      })
      .returning(BATCH_SHAPE);

    this.audit.log({
      actorUserId,
      entityType: 'batch',
      entityId: row.id,
      action: 'create',
      tenantId,
      after: row,
    });

    return { batch: row };
  }

  async updateBatch(
    tenantId: string,
    batchId: string,
    dto: UpdateBatchDto,
    actorUserId: string,
  ) {
    const { batch: before } = await this.getBatch(tenantId, batchId);

    const [row] = await this.db
      .update(schema.batches)
      .set({
        ...(dto.name !== undefined && { name: dto.name }),
        ...(dto.course_id !== undefined && { courseId: dto.course_id }),
        ...(dto.tutor_id !== undefined && { tutorId: dto.tutor_id ?? null }),
        ...(dto.status !== undefined && { status: dto.status }),
        ...(dto.start_date !== undefined && {
          startDate: dto.start_date ?? null,
        }),
        ...(dto.end_date !== undefined && { endDate: dto.end_date ?? null }),
        ...(dto.max_students !== undefined && {
          maxStudents: dto.max_students ?? null,
        }),
        updatedAt: new Date(),
      })
      .where(
        and(
          eq(schema.batches.id, batchId),
          eq(schema.batches.tenantId, tenantId),
        ),
      )
      .returning(BATCH_SHAPE);

    this.audit.log({
      actorUserId,
      entityType: 'batch',
      entityId: batchId,
      action: 'update',
      tenantId,
      before,
      after: row,
    });

    return { batch: row };
  }

  async deleteBatch(tenantId: string, batchId: string, actorUserId: string) {
    const { batch: before } = await this.getBatch(tenantId, batchId);

    await this.db
      .delete(schema.batches)
      .where(
        and(
          eq(schema.batches.id, batchId),
          eq(schema.batches.tenantId, tenantId),
        ),
      );

    this.audit.log({
      actorUserId,
      entityType: 'batch',
      entityId: batchId,
      action: 'delete',
      tenantId,
      before,
    });
  }

  // ── Enrollments ───────────────────────────────────────────────────────────

  async listEnrollments(tenantId: string, batchId: string) {
    const rows = await this.db
      .select({
        ...ENROLLMENT_SHAPE,
        student_email: schema.users.email,
        student_full_name: schema.profiles.fullName,
      })
      .from(schema.batchEnrollments)
      .innerJoin(
        schema.users,
        eq(schema.batchEnrollments.studentId, schema.users.id),
      )
      .leftJoin(
        schema.profiles,
        eq(schema.batchEnrollments.studentId, schema.profiles.userId),
      )
      .where(
        and(
          eq(schema.batchEnrollments.batchId, batchId),
          eq(schema.batchEnrollments.tenantId, tenantId),
        ),
      )
      .orderBy(schema.batchEnrollments.enrolledAt);

    return { enrollments: rows };
  }

  async enrollStudent(
    tenantId: string,
    batchId: string,
    dto: EnrollStudentDto,
    actorUserId: string,
  ) {
    const { batch } = await this.getBatch(tenantId, batchId);

    // Verify the student is a tenant member with role 'student'
    const [membership] = await this.db
      .select({ role: schema.tenantMemberships.role })
      .from(schema.tenantMemberships)
      .where(
        and(
          eq(schema.tenantMemberships.tenantId, tenantId),
          eq(schema.tenantMemberships.userId, dto.student_id),
          eq(schema.tenantMemberships.role, 'student'),
        ),
      );
    if (!membership) {
      throw new BadRequestException('User is not a student in this tenant');
    }

    // Check capacity
    if (batch.max_students !== null) {
      const [{ count }] = await this.db
        .select({ count: sql<number>`count(*)::int` })
        .from(schema.batchEnrollments)
        .where(eq(schema.batchEnrollments.batchId, batchId));
      if (count >= batch.max_students) {
        throw new BadRequestException('Batch is at full capacity');
      }
    }

    try {
      const [row] = await this.db
        .insert(schema.batchEnrollments)
        .values({
          batchId,
          studentId: dto.student_id,
          tenantId,
          enrolledBy: actorUserId,
        })
        .returning(ENROLLMENT_SHAPE);

      this.audit.log({
        actorUserId,
        entityType: 'batch_enrollment',
        entityId: row.id,
        action: 'create',
        tenantId,
        after: row,
      });

      return { enrollment: row };
    } catch (err) {
      if (isPgUniqueViolation(err)) {
        throw new ConflictException(
          'Student is already enrolled in this batch',
        );
      }
      throw err;
    }
  }

  async removeEnrollment(
    tenantId: string,
    batchId: string,
    studentId: string,
    actorUserId: string,
  ) {
    const result = await this.db
      .delete(schema.batchEnrollments)
      .where(
        and(
          eq(schema.batchEnrollments.batchId, batchId),
          eq(schema.batchEnrollments.studentId, studentId),
          eq(schema.batchEnrollments.tenantId, tenantId),
        ),
      )
      .returning({ id: schema.batchEnrollments.id });

    if (result.length === 0) {
      throw new NotFoundException('Enrollment not found');
    }

    this.audit.log({
      actorUserId,
      entityType: 'batch_enrollment',
      entityId: result[0].id,
      action: 'delete',
      tenantId,
    });
  }

  // ── Student self-join ──────────────────────────────────────────────────────

  async joinByCode(tenantId: string, dto: JoinBatchDto, actorUserId: string) {
    const [batch] = await this.db
      .select(BATCH_SHAPE)
      .from(schema.batches)
      .where(
        and(
          eq(schema.batches.joinCode, dto.join_code),
          eq(schema.batches.tenantId, tenantId),
        ),
      );
    if (!batch) throw new NotFoundException('Invalid join code');
    if (batch.status !== 'active') {
      throw new BadRequestException('Batch is not open for enrollment');
    }

    // Check capacity
    if (batch.max_students !== null) {
      const [{ count }] = await this.db
        .select({ count: sql<number>`count(*)::int` })
        .from(schema.batchEnrollments)
        .where(eq(schema.batchEnrollments.batchId, batch.id));
      if (count >= batch.max_students) {
        throw new BadRequestException('Batch is at full capacity');
      }
    }

    try {
      const [enrollment] = await this.db
        .insert(schema.batchEnrollments)
        .values({
          batchId: batch.id,
          studentId: actorUserId,
          tenantId,
          enrolledBy: actorUserId,
        })
        .returning(ENROLLMENT_SHAPE);

      this.audit.log({
        actorUserId,
        entityType: 'batch_enrollment',
        entityId: enrollment.id,
        action: 'self_join',
        tenantId,
        after: enrollment,
      });

      return { batch, enrollment };
    } catch (err) {
      if (isPgUniqueViolation(err)) {
        throw new ConflictException('You are already enrolled in this batch');
      }
      throw err;
    }
  }

  async listMyBatches(tenantId: string, studentId: string) {
    const rows = await this.db
      .select({
        ...BATCH_SHAPE,
        enrolled_at: schema.batchEnrollments.enrolledAt,
      })
      .from(schema.batchEnrollments)
      .innerJoin(
        schema.batches,
        eq(schema.batchEnrollments.batchId, schema.batches.id),
      )
      .where(
        and(
          eq(schema.batchEnrollments.studentId, studentId),
          eq(schema.batchEnrollments.tenantId, tenantId),
        ),
      )
      .orderBy(schema.batchEnrollments.enrolledAt);

    return { batches: rows };
  }

  async listAvailableBatches(tenantId: string) {
    const rows = await this.db
      .select(BATCH_SHAPE)
      .from(schema.batches)
      .where(
        and(
          eq(schema.batches.tenantId, tenantId),
          eq(schema.batches.status, 'active'),
        ),
      )
      .orderBy(schema.batches.startDate);

    return { batches: rows };
  }

  async getBatchByJoinCode(tenantId: string, joinCode: string) {
    const [row] = await this.db
      .select(BATCH_SHAPE)
      .from(schema.batches)
      .where(
        and(
          eq(schema.batches.joinCode, joinCode),
          eq(schema.batches.tenantId, tenantId),
        ),
      );
    if (!row) throw new NotFoundException('Invalid join code');
    return { batch: row };
  }
}
