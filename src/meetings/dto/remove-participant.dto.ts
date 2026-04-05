import { ApiProperty } from '@nestjs/swagger';
import { IsString, MaxLength } from 'class-validator';

export class RemoveParticipantDto {
  @ApiProperty()
  @IsString()
  @MaxLength(256)
  participant_identity!: string;
}
