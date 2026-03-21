import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsEnum, IsOptional, IsString, MaxLength } from 'class-validator';

export class UpsertStudentProfileDto {
  @ApiPropertyOptional({ description: 'Short bio / about me' })
  @IsOptional()
  @IsString()
  bio?: string;

  @ApiPropertyOptional({ description: 'What the student wants to achieve' })
  @IsOptional()
  @IsString()
  learning_goals?: string;

  @ApiPropertyOptional({
    enum: [
      'high_school',
      'undergraduate',
      'postgraduate',
      'professional',
      'other',
    ],
  })
  @IsOptional()
  @IsEnum([
    'high_school',
    'undergraduate',
    'postgraduate',
    'professional',
    'other',
  ])
  education_level?:
    | 'high_school'
    | 'undergraduate'
    | 'postgraduate'
    | 'professional'
    | 'other';

  @ApiPropertyOptional({
    description: 'Current job title or role',
    maxLength: 200,
  })
  @IsOptional()
  @IsString()
  @MaxLength(200)
  occupation?: string;
}
