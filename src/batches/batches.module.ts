import { Module } from '@nestjs/common';
import { TenantEditorGuard } from '../auth/guards/tenant-editor.guard.js';
import { TenantMemberGuard } from '../auth/guards/tenant-member.guard.js';
import { BatchesService } from './batches.service.js';
import { TenantBatchesController } from './tenant-batches.controller.js';

@Module({
  controllers: [TenantBatchesController],
  providers: [BatchesService, TenantEditorGuard, TenantMemberGuard],
})
export class BatchesModule {}
