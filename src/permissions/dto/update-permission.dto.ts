import { IsBoolean, IsIn, IsString, MaxLength } from 'class-validator';

const ROLES = ['tenant_admin', 'finance_admin', 'tutor', 'student'] as const;
const RESOURCES = [
  'users',
  'tutors',
  'students',
  'courses',
  'batches',
] as const;
const ACTIONS = [
  'view',
  'create',
  'edit',
  'delete',
  'invite',
  'enroll',
] as const;

export class UpdatePermissionDto {
  @IsString()
  @IsIn(ROLES)
  role!: string;

  @IsString()
  @IsIn(RESOURCES)
  resource!: string;

  @IsString()
  @IsIn(ACTIONS)
  @MaxLength(64)
  action!: string;

  @IsBoolean()
  allowed!: boolean;
}
