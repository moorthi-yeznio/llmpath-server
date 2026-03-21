import { z } from 'zod';

const logLevels = [
  'trace',
  'debug',
  'info',
  'warn',
  'error',
  'fatal',
  'silent',
] as const;

const envSchema = z.object({
  NODE_ENV: z
    .enum(['development', 'test', 'production'])
    .default('development'),
  PORT: z.coerce.number().int().positive().default(3000),
  LOG_LEVEL: z.enum(logLevels).default('info'),
  CORS_ORIGINS: z
    .string()
    .optional()
    .transform((v) =>
      (v ?? '')
        .split(',')
        .map((s) => s.trim())
        .filter(Boolean),
    ),
  /** Supabase Postgres or any Postgres (Settings → Database → URI) */
  DATABASE_URL: z.string().min(1),
  /** Supabase project URL (Settings → API → Project URL) */
  SUPABASE_URL: z.string().min(1),
  /** Supabase service role key (Settings → API → Secret key) — keep secret, server-only */
  SUPABASE_SERVICE_ROLE_KEY: z.string().min(1),
});

export type Env = z.infer<typeof envSchema>;

export type AppConfig = {
  nodeEnv: Env['NODE_ENV'];
  port: number;
  logLevel: (typeof logLevels)[number];
  corsOrigins: string[];
  databaseUrl: string;
  supabaseUrl: string;
  supabaseServiceRoleKey: string;
};

export function validateEnv(config: Record<string, unknown>): AppConfig {
  const parsed = envSchema.parse(config);
  return {
    nodeEnv: parsed.NODE_ENV,
    port: parsed.PORT,
    logLevel: parsed.LOG_LEVEL,
    corsOrigins: parsed.CORS_ORIGINS,
    databaseUrl: parsed.DATABASE_URL,
    supabaseUrl: parsed.SUPABASE_URL,
    supabaseServiceRoleKey: parsed.SUPABASE_SERVICE_ROLE_KEY,
  };
}
