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
});

export type Env = z.infer<typeof envSchema>;

export type AppConfig = {
  nodeEnv: Env['NODE_ENV'];
  port: number;
  logLevel: (typeof logLevels)[number];
  corsOrigins: string[];
};

export function validateEnv(config: Record<string, unknown>): AppConfig {
  const parsed = envSchema.parse(config);
  return {
    nodeEnv: parsed.NODE_ENV,
    port: parsed.PORT,
    logLevel: parsed.LOG_LEVEL,
    corsOrigins: parsed.CORS_ORIGINS,
  };
}
