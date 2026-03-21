import { ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsArray,
  IsEnum,
  IsInt,
  IsNumber,
  IsOptional,
  IsPositive,
  IsString,
  Max,
  Min,
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

  @ApiPropertyOptional({ description: 'Hourly rate in USD', minimum: 5 })
  @IsOptional()
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(5)
  hourly_rate?: number;

  @ApiPropertyOptional({ description: 'Max students per session', minimum: 1 })
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(1000)
  max_students?: number;
}
