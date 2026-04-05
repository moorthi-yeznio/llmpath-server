import { ApiProperty } from '@nestjs/swagger';
import { IsString, MaxLength } from 'class-validator';

export class StopRecordingDto {
  @ApiProperty()
  @IsString()
  @MaxLength(128)
  egress_id!: string;
}
