import { PartialType } from '@nestjs/swagger';
import { CreateBatchDto } from './create-batch.dto.js';

export class UpdateBatchDto extends PartialType(CreateBatchDto) {}
