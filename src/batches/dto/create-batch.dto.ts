import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsDateString,
  IsEnum,
  IsInt,
  IsOptional,
  IsPositive,
  IsString,
  IsUUID,
  MaxLength,
  MinLength,
} from 'class-validator';

export class CreateBatchDto {
  @ApiProperty({ maxLength: 200 })
  @IsString()
  @MinLength(1)
  @MaxLength(200)
  name!: string;

  @ApiProperty({ description: 'Course UUID' })
  @IsUUID()
  course_id!: string;

  @ApiPropertyOptional({ description: 'Tutor user UUID' })
  @IsOptional()
  @IsUUID()
  tutor_id?: string;

  @ApiPropertyOptional({
    enum: ['draft', 'active', 'completed', 'cancelled'],
    default: 'draft',
  })
  @IsOptional()
  @IsEnum(['draft', 'active', 'completed', 'cancelled'])
  status?: 'draft' | 'active' | 'completed' | 'cancelled';

  @ApiPropertyOptional({ description: 'YYYY-MM-DD' })
  @IsOptional()
  @IsDateString()
  start_date?: string;

  @ApiPropertyOptional({ description: 'YYYY-MM-DD' })
  @IsOptional()
  @IsDateString()
  end_date?: string;

  @ApiPropertyOptional({ minimum: 1 })
  @IsOptional()
  @IsInt()
  @IsPositive()
  max_students?: number;
}
