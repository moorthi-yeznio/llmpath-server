import { Inject, Injectable, Logger } from '@nestjs/common';
import type { NodePgDatabase } from 'drizzle-orm/node-postgres';
import { DRIZZLE } from '../db/drizzle.constants.js';
import * as schema from '../db/schema.js';

export type AuditEntry = {
  actorUserId: string;
  entityType: string;
  entityId: string;
  action: string;
  before?: Record<string, unknown>;
  after?: Record<string, unknown>;
  tenantId?: string;
};

@Injectable()
export class AuditService {
  private readonly logger = new Logger(AuditService.name);

  constructor(
    @Inject(DRIZZLE)
    private readonly db: NodePgDatabase<typeof schema>,
  ) {}

  /**
   * Writes an audit log entry. Fire-and-forget — never throws.
   * Failures are logged but do not affect the calling operation.
   */
  log(entry: AuditEntry): void {
    this.db
      .insert(schema.auditLogs)
      .values({
        actorUserId: entry.actorUserId,
        entityType: entry.entityType,
        entityId: entry.entityId,
        action: entry.action,
        beforeJson: entry.before ?? null,
        afterJson: entry.after ?? null,
        organisationId: entry.tenantId ?? null,
      })
      .catch((err: unknown) => {
        this.logger.error(
          { err, entry },
          'Failed to write audit log — non-fatal',
        );
      });
  }
}
