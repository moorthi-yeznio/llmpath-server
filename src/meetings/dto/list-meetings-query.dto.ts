import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsISO8601, IsInt, IsOptional, Max, Min } from 'class-validator';
import { Type } from 'class-transformer';

export class ListMeetingsQueryDto {
  @ApiPropertyOptional({
    description: 'Max results per page',
    default: 20,
    minimum: 1,
    maximum: 100,
  })
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(100)
  @Type(() => Number)
  limit?: number;

  @ApiPropertyOptional({
    description: 'Cursor from previous page (created_at of last item)',
  })
  @IsOptional()
  @IsISO8601()
  cursor?: string;
}
