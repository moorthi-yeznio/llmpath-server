import { ApiProperty } from '@nestjs/swagger';
import { IsString, MaxLength } from 'class-validator';

export class AdmitParticipantDto {
  @ApiProperty({
    description: 'LiveKit participant identity (same as issued in JWT)',
  })
  @IsString()
  @MaxLength(256)
  participant_identity!: string;
}
