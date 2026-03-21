import type { CorsOptions } from '@nestjs/common/interfaces/external/cors-options.interface';
import {
  RequestMethod,
  ValidationPipe,
  type INestApplication,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import helmet from 'helmet';
import { Logger } from 'nestjs-pino';

export function configureApp(app: INestApplication): void {
  app.useLogger(app.get(Logger));

  const config = app.get(ConfigService);
  const corsOrigins = config.get<string[]>('corsOrigins') ?? [];

  app.use(helmet());

  const corsOptions: CorsOptions = {
    origin: (
      origin: string | undefined,
      callback: (err: Error | null, allow?: boolean) => void,
    ) => {
      if (!origin) {
        callback(null, true);
        return;
      }
      if (corsOrigins.includes(origin)) {
        callback(null, true);
        return;
      }
      callback(new Error('Not allowed by CORS'));
    },
    credentials: true,
  };
  app.enableCors(corsOptions);

  app.setGlobalPrefix('api', {
    exclude: [
      { path: '/', method: RequestMethod.GET },
      { path: 'health', method: RequestMethod.GET },
    ],
  });

  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
    }),
  );

  const swaggerConfig = new DocumentBuilder()
    .setTitle('llmpath-server')
    .setDescription('Learning portal API')
    .setVersion('1.0')
    .build();
  // Under pnpm, @nestjs/swagger can resolve typings against a different @nestjs/common instance than the app;
  // at runtime there is still a single Nest app. Align types for SwaggerModule only.
  const swaggerApp = app as unknown as Parameters<
    typeof SwaggerModule.createDocument
  >[0];
  const document = SwaggerModule.createDocument(swaggerApp, swaggerConfig);
  SwaggerModule.setup('docs', swaggerApp, document, {
    useGlobalPrefix: true,
  });
}
