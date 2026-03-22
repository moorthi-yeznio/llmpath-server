import { ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsArray,
  IsEnum,
  IsInt,
  IsOptional,
  IsPositive,
  IsString,
} from 'class-validator';

export class UpsertTutorProfileDto {
  @ApiPropertyOptional({ description: 'Short bio' })
  @IsOptional()
  @IsString()
  bio?: string;

  @ApiPropertyOptional({ description: 'Specialization topics', type: [String] })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  specializations?: string[];

  @ApiPropertyOptional({ description: 'Years of experience', minimum: 1 })
  @IsOptional()
  @IsInt()
  @IsPositive()
  experience_years?: number;

  @ApiPropertyOptional({ description: 'Free-text qualifications / education' })
  @IsOptional()
  @IsString()
  qualifications?: string;

  @ApiPropertyOptional({ enum: ['available', 'on_leave', 'retired'] })
  @IsOptional()
  @IsEnum(['available', 'on_leave', 'retired'])
  availability_status?: 'available' | 'on_leave' | 'retired';
}
