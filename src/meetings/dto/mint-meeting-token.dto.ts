import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsBoolean, IsOptional, IsString, MaxLength } from 'class-validator';

export class MintMeetingTokenDto {
  @ApiProperty({ example: 'Ada Lovelace' })
  @IsString()
  @MaxLength(200)
  display_name!: string;

  /**
   * When true, non-hosts join with publish disabled until the host admits them.
   * Ignored for the meeting host (host always gets full publish).
   */
  @ApiPropertyOptional({ default: true })
  @IsOptional()
  @IsBoolean()
  use_waiting_room?: boolean;
}
