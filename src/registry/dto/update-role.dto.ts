import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsInt, IsOptional, IsString, MaxLength, Min } from 'class-validator';

export class UpdateRoleDto {
  @ApiPropertyOptional({ example: 'Content Manager' })
  @IsString()
  @MaxLength(128)
  @IsOptional()
  label?: string;

  @ApiPropertyOptional({ default: 0 })
  @IsInt()
  @Min(0)
  @IsOptional()
  sortOrder?: number;
}
