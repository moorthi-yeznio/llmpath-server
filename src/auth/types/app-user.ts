export type TenantMembershipRole =
  | 'tenant_admin'
  | 'tutor'
  | 'student'
  | 'finance_admin';

export interface SessionProfile {
  full_name: string | null;
  locale: string | null;
  timezone: string | null;
  avatar_url: string | null;
}

export interface AppUser {
  id: string;
  email: string;
  isPlatformAdmin: boolean;
  memberships: {
    tenantId: string;
    role: TenantMembershipRole;
  }[];
  profile: SessionProfile | null;
}
