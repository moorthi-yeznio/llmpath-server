import { Module, RequestMethod } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { APP_GUARD } from '@nestjs/core';
import { ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler';
import { LoggerModule } from 'nestjs-pino';
import { validateEnv } from './config';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { HealthController } from './health.controller';
import { LandingController } from './landing.controller';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      validate: validateEnv,
    }),
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
  ],
})
export class AppModule {}
