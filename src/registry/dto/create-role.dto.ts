import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsInt,
  IsOptional,
  IsString,
  Matches,
  MaxLength,
  Min,
} from 'class-validator';

export class CreateRoleDto {
  @ApiProperty({ example: 'content_manager' })
  @IsString()
  @Matches(/^[a-z][a-z0-9_]*$/, {
    message:
      'key must be lowercase letters, digits, or underscores, starting with a letter',
  })
  @MaxLength(64)
  key: string;

  @ApiProperty({ example: 'Content Manager' })
  @IsString()
  @MaxLength(128)
  label: string;

  @ApiPropertyOptional({ default: 0 })
  @IsInt()
  @Min(0)
  @IsOptional()
  sortOrder?: number;
}
