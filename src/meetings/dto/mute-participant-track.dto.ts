import { ApiProperty } from '@nestjs/swagger';
import { IsBoolean, IsString, MaxLength } from 'class-validator';

export class MuteParticipantTrackDto {
  @ApiProperty()
  @IsString()
  @MaxLength(256)
  participant_identity!: string;

  @ApiProperty({ description: 'LiveKit track SID' })
  @IsString()
  @MaxLength(128)
  track_sid!: string;

  @ApiProperty()
  @IsBoolean()
  muted!: boolean;
}
