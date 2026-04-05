import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsString, MaxLength } from 'class-validator';

export class CreateMeetingDto {
  @ApiPropertyOptional({ example: 'Weekly standup' })
  @IsOptional()
  @IsString()
  @MaxLength(200)
  title?: string;
}
