import { ApiProperty } from '@nestjs/swagger';
import { IsString, MaxLength, MinLength } from 'class-validator';

export class AcceptInviteDto {
  @ApiProperty({ description: 'Invite token from the email link' })
  @IsString()
  token!: string;

  @ApiProperty({ example: 'Jane Smith' })
  @IsString()
  @MaxLength(200)
  fullName!: string;

  @ApiProperty({ minLength: 8 })
  @IsString()
  @MinLength(8)
  password!: string;
}
