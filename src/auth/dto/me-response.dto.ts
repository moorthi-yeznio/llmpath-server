import { ApiProperty } from '@nestjs/swagger';
import type { TenantMembershipRole } from '../types/app-user.js';

const ROLE_ENUM: TenantMembershipRole[] = [
  'tenant_admin',
  'tutor',
  'student',
  'finance_admin',
];

export class MembershipDto {
  @ApiProperty()
  organisation_id!: string;

  @ApiProperty({ enum: ROLE_ENUM })
  role!: TenantMembershipRole;
}

export class ProfileDto {
  @ApiProperty({ nullable: true })
  full_name!: string | null;

  @ApiProperty({ nullable: true })
  locale!: string | null;

  @ApiProperty({ nullable: true })
  timezone!: string | null;

  @ApiProperty({ nullable: true })
  avatar_url!: string | null;
}

export class MeUserDto {
  @ApiProperty()
  id!: string;

  @ApiProperty()
  email!: string;

  @ApiProperty()
  is_platform_admin!: boolean;

  @ApiProperty({ type: [MembershipDto] })
  memberships!: MembershipDto[];

  @ApiProperty({ type: ProfileDto, nullable: true })
  profile!: ProfileDto | null;
}

export class MeResponseDto {
  @ApiProperty({ type: MeUserDto })
  user!: MeUserDto;
}
