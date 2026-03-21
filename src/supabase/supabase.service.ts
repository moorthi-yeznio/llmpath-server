import {
  ConflictException,
  Injectable,
  InternalServerErrorException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createClient } from '@supabase/supabase-js';
import type { AppConfig } from '../config/index.js';

/** 100 years in hours — effectively permanent ban within Supabase */
const BAN_DURATION = '876000h';

@Injectable()
export class SupabaseService {
  readonly admin: ReturnType<typeof createClient>;

  constructor(private readonly config: ConfigService<AppConfig, true>) {
    this.admin = createClient(
      config.get('supabaseUrl', { infer: true }),
      config.get('supabaseServiceRoleKey', { infer: true }),
      { auth: { autoRefreshToken: false, persistSession: false } },
    );
  }

  /**
   * Creates a user in Supabase Auth.
   * email_confirm: true skips the confirmation email — admin-created accounts are
   * considered pre-verified (the admin is responsible for credential delivery).
   */
  async createUser(
    email: string,
    password: string,
  ): Promise<{ id: string; email: string }> {
    const { data, error } = await this.admin.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
    });

    if (error) {
      if (
        error.message.toLowerCase().includes('already') ||
        error.message.toLowerCase().includes('exists')
      ) {
        throw new ConflictException(`User with email ${email} already exists`);
      }
      throw new InternalServerErrorException(
        `Failed to create Supabase user: ${error.message}`,
      );
    }

    return { id: data.user.id, email: data.user.email! };
  }

  /**
   * Looks up a Supabase Auth user by email.
   * Uses listUsers with a filter — the Admin API does not provide a direct
   * getUserByEmail method.
   */
  async getUserByEmail(
    email: string,
  ): Promise<{ id: string; email: string } | null> {
    const { data, error } = await this.admin.auth.admin.listUsers();
    if (error) return null;
    const found = data.users.find(
      (u) => u.email?.toLowerCase() === email.toLowerCase(),
    );
    return found ? { id: found.id, email: found.email! } : null;
  }

  /** Bans the user in Supabase Auth — invalidates all active sessions. */
  async banUser(userId: string): Promise<void> {
    const { error } = await this.admin.auth.admin.updateUserById(userId, {
      ban_duration: BAN_DURATION,
    });
    if (error) {
      throw new InternalServerErrorException(
        `Failed to ban user: ${error.message}`,
      );
    }
  }

  /** Lifts the ban on a user in Supabase Auth. */
  async unbanUser(userId: string): Promise<void> {
    const { error } = await this.admin.auth.admin.updateUserById(userId, {
      ban_duration: 'none',
    });
    if (error) {
      throw new InternalServerErrorException(
        `Failed to unban user: ${error.message}`,
      );
    }
  }
}
