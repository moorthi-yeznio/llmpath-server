import { ApiProperty } from '@nestjs/swagger';
import { IsEmail, IsEnum, IsString, MinLength } from 'class-validator';
import type { TenantMembershipRole } from '../../auth/types/app-user.js';

const MEMBER_ROLES = ['tutor', 'student', 'finance_admin'] as const;
type MemberRole = (typeof MEMBER_ROLES)[number];

export class CreateTenantMemberDto {
  @ApiProperty()
  @IsEmail()
  email!: string;

  @ApiProperty()
  @IsString()
  @MinLength(8)
  password!: string;

  @ApiProperty({
    enum: MEMBER_ROLES,
    description:
      'Role within this tenant (tenant_admin is set via the admins endpoint)',
  })
  @IsEnum(MEMBER_ROLES)
  role!: MemberRole & TenantMembershipRole;
}
