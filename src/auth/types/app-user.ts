// Known system roles listed for IDE autocomplete.
// Roles are now DB-driven — any string is valid at runtime.
export type TenantMembershipRole =
  | 'tenant_admin'
  | 'tutor'
  | 'student'
  | 'finance_admin'
  | (string & {});

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
    organisationId: string;
    role: TenantMembershipRole;
  }[];
  profile: SessionProfile | null;
}
