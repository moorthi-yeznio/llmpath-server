import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsEnum,
  IsInt,
  IsOptional,
  IsPositive,
  IsString,
  IsUrl,
  MaxLength,
  MinLength,
} from 'class-validator';

export class CreateCourseDto {
  @ApiProperty({ description: 'Course title', maxLength: 200 })
  @IsString()
  @MinLength(1)
  @MaxLength(200)
  title!: string;

  @ApiPropertyOptional({ description: 'Course description' })
  @IsOptional()
  @IsString()
  description?: string;

  @ApiPropertyOptional({ enum: ['draft', 'published'], default: 'draft' })
  @IsOptional()
  @IsEnum(['draft', 'published'])
  status?: 'draft' | 'published';

  @ApiPropertyOptional({ description: 'Thumbnail image URL' })
  @IsOptional()
  @IsUrl()
  thumbnail_url?: string;

  @ApiPropertyOptional({ description: 'Duration in minutes', minimum: 1 })
  @IsOptional()
  @IsInt()
  @IsPositive()
  duration_minutes?: number;

  @ApiPropertyOptional({ enum: ['beginner', 'intermediate', 'advanced'] })
  @IsOptional()
  @IsEnum(['beginner', 'intermediate', 'advanced'])
  level?: 'beginner' | 'intermediate' | 'advanced';

  @ApiPropertyOptional({
    description: 'Maximum number of students',
    minimum: 1,
  })
  @IsOptional()
  @IsInt()
  @IsPositive()
  max_students?: number;
}
