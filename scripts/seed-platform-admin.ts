/**
 * Seeds a platform admin user via Supabase Auth + local DB.
 * Usage (from repo root): pnpm run seed:platform-admin
 * Requires: DATABASE_URL, SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY,
 *           PLATFORM_ADMIN_EMAIL, PLATFORM_ADMIN_PASSWORD
 * Apply migrations first: pnpm exec drizzle-kit migrate
 */
import { createClient } from '@supabase/supabase-js';
import { eq } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/node-postgres';
import { Pool } from 'pg';
import * as schema from '../src/db/schema.js';

/** Supabase admin `listUsers()` row; explicit so generics do not collapse to `never`. */
type AuthAdminUser = {
  id: string;
  email?: string | null;
};

async function main(): Promise<void> {
  const databaseUrl = process.env.DATABASE_URL;
  const supabaseUrl = process.env.SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const emailRaw = process.env.PLATFORM_ADMIN_EMAIL;
  const password = process.env.PLATFORM_ADMIN_PASSWORD;

  if (
    !databaseUrl ||
    !supabaseUrl ||
    !serviceRoleKey ||
    !emailRaw ||
    !password
  ) {
    console.error(
      'Missing: DATABASE_URL, SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, PLATFORM_ADMIN_EMAIL, PLATFORM_ADMIN_PASSWORD',
    );
    process.exit(1);
  }

  const email = emailRaw.trim().toLowerCase();

  const supabase = createClient(supabaseUrl, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  const pool = new Pool({ connectionString: databaseUrl });
  const db = drizzle(pool, { schema });

  try {
    // Step 1: ensure user exists in Supabase Auth
    let userId: string;

    const { data: listData } = await supabase.auth.admin.listUsers();
    const users = (listData?.users ?? []) as AuthAdminUser[];
    const existing = users.find((u) => u.email?.toLowerCase() === email);

    if (existing) {
      userId = existing.id;
      console.log('Supabase Auth user already exists:', userId, email);
    } else {
      const { data, error } = await supabase.auth.admin.createUser({
        email,
        password,
        email_confirm: true,
      });
      if (error || !data?.user) {
        console.error('Failed to create Supabase Auth user:', error?.message);
        process.exit(1);
      }
      userId = data.user.id;
      console.log('Created Supabase Auth user:', userId, email);
    }

    // Step 2: upsert local shadow user record
    await db
      .insert(schema.users)
      .values({ id: userId, email, status: 'active' })
      .onConflictDoNothing();
    console.log('Local user record ensured:', userId);

    // Step 3: grant platform admin role
    const [pa] = await db
      .select()
      .from(schema.platformAdmins)
      .where(eq(schema.platformAdmins.userId, userId))
      .limit(1);

    if (pa) {
      console.log('Already a platform admin — nothing to do.');
    } else {
      await db.insert(schema.platformAdmins).values({ userId });
      console.log('Platform admin role granted for', userId);
    }
  } finally {
    await pool.end();
  }
}

main().catch((err: unknown) => {
  console.error(err);
  process.exit(1);
});
