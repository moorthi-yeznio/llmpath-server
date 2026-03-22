import { Module, RequestMethod } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { APP_GUARD } from '@nestjs/core';
import { ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler';
import { LoggerModule } from 'nestjs-pino';
import { join } from 'node:path';
import { validateEnv } from './config/index.js';
import { AuthGuard } from './auth/guards/auth.guard.js';
import { AuthModule } from './auth/auth.module.js';
import { AppController } from './app.controller.js';
import { AppService } from './app.service.js';
import { HealthController } from './health.controller.js';
import { LandingController } from './landing.controller.js';
import { DrizzleModule } from './db/drizzle.module.js';
import { TenantsModule } from './tenants/tenants.module.js';
import { SupabaseModule } from './supabase/supabase.module.js';
import { AuditModule } from './audit/audit.module.js';
import { CoursesModule } from './courses/courses.module.js';
import { TutorsModule } from './tutors/tutors.module.js';
import { StudentsModule } from './students/students.module.js';
import { BatchesModule } from './batches/batches.module.js';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      // Load from project root so keys are available even if cwd quirks differ.
      envFilePath: [join(process.cwd(), '.env')],
      validate: validateEnv,
    }),
    DrizzleModule,
    SupabaseModule,
    AuditModule,
    AuthModule,
    TenantsModule,
    CoursesModule,
    TutorsModule,
    StudentsModule,
    BatchesModule,
    LoggerModule.forRootAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (config: ConfigService) => {
        const nodeEnv = config.get<'development' | 'test' | 'production'>(
          'nodeEnv',
        );
        return {
          // Nest 11 + path-to-regexp v7: avoid legacy `*` (becomes `/api/*` with global prefix) and the LegacyRouteConverter warning.
          // See https://github.com/iamolegga/nestjs-pino/issues/2213
          forRoutes: [{ path: '{*splat}', method: RequestMethod.ALL }],
          pinoHttp: {
            level: config.get<string>('logLevel'),
            transport:
              nodeEnv === 'development'
                ? {
                    target: 'pino-pretty',
                    options: { singleLine: true, colorize: true },
                  }
                : undefined,
          },
        };
      },
    }),
    ThrottlerModule.forRoot({
      throttlers: [
        {
          ttl: 60_000,
          limit: 100,
        },
      ],
    }),
  ],
  controllers: [LandingController, HealthController, AppController],
  providers: [
    AppService,
    {
      provide: APP_GUARD,
      useClass: ThrottlerGuard,
    },
    {
      provide: APP_GUARD,
      useClass: AuthGuard,
    },
  ],
})
export class AppModule {}
