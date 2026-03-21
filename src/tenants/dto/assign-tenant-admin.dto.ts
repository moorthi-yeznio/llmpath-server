import { ApiProperty } from '@nestjs/swagger';
import { IsEmail, IsString, MinLength } from 'class-validator';

export class AssignTenantAdminDto {
  @ApiProperty()
  @IsEmail()
  email!: string;

  @ApiProperty({
    description:
      'Initial password for the new user (required if the account does not exist)',
  })
  @IsString()
  @MinLength(8)
  password!: string;
}
