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
  /** Resend email service API key */
  RESEND_API_KEY: z.string().min(1),
  /** From address used for invite emails */
  RESEND_FROM: z.string().default('invites@llmpath.com'),
  /** Public URL of the web app, used to build invite links */
  APP_URL: z.string().default('http://localhost:3001'),

  /** LiveKit HTTP(S) API base (same host as server Twirp), e.g. http://127.0.0.1:7880 */
  LIVEKIT_HTTP_URL: z.string().url(),
  LIVEKIT_API_KEY: z.string().min(1),
  LIVEKIT_API_SECRET: z
    .string()
    .min(
      32,
      'LIVEKIT_API_SECRET must be at least 32 characters for JWT security',
    ),
  /**
   * Directory on the API host where recording files are stored (must match the host path
   * mounted into the Egress container).
   */
  LIVEKIT_RECORDINGS_DIR: z.string().min(1),
  /**
   * Absolute filepath prefix as seen by the Egress process (e.g. /out or /recordings).
   * Final path = `${LIVEKIT_EGRESS_FILE_PREFIX}/${relativePath}`.
   * Must be the in-container mount path, not a host path or env var name.
   */
  LIVEKIT_EGRESS_FILE_PREFIX: z
    .string()
    .min(1)
    .refine((p) => p.startsWith('/'), {
      message:
        'LIVEKIT_EGRESS_FILE_PREFIX must be an absolute path inside the Egress container (e.g. /out)',
    })
    .refine((p) => !p.includes(':'), {
      message:
        'LIVEKIT_EGRESS_FILE_PREFIX must not contain ":" — use only the in-container path (e.g. /out), not host paths or KEY:value pairs',
    })
    .refine((p) => !p.startsWith('LIVEKIT_'), {
      message:
        'LIVEKIT_EGRESS_FILE_PREFIX looks like an env var name; set the resolved path (e.g. /out)',
    }),
  /**
   * Room composite layout for the built-in egress template (see LiveKit docs).
   * `speaker` = large main track + thin strip (better when screen sharing). An empty layout
   * in the API produced a 50/50 grid for two video tracks. `grid` works for many tiles and
   * switches to speaker while screen share is active. Use `-light` for a white background.
   */
  LIVEKIT_RECORDING_LAYOUT: z.string().default('speaker'),
  /** Optional base URL for a custom recording web app (reachable from the egress container). */
  LIVEKIT_EGRESS_CUSTOM_BASE_URL: z.string().url().optional(),
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
  resendApiKey: string;
  resendFrom: string;
  appUrl: string;
  livekitHttpUrl: string;
  livekitApiKey: string;
  livekitApiSecret: string;
  livekitRecordingsDir: string;
  livekitEgressFilePrefix: string;
  livekitRecordingLayout: string;
  livekitEgressCustomBaseUrl: string | undefined;
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
    resendApiKey: parsed.RESEND_API_KEY,
    resendFrom: parsed.RESEND_FROM,
    appUrl: parsed.APP_URL,
    livekitHttpUrl: parsed.LIVEKIT_HTTP_URL,
    livekitApiKey: parsed.LIVEKIT_API_KEY,
    livekitApiSecret: parsed.LIVEKIT_API_SECRET,
    livekitRecordingsDir: parsed.LIVEKIT_RECORDINGS_DIR,
    livekitEgressFilePrefix: parsed.LIVEKIT_EGRESS_FILE_PREFIX,
    livekitRecordingLayout: parsed.LIVEKIT_RECORDING_LAYOUT,
    livekitEgressCustomBaseUrl: parsed.LIVEKIT_EGRESS_CUSTOM_BASE_URL,
  };
}
