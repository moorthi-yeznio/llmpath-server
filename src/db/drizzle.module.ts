import { Global, Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { drizzle } from 'drizzle-orm/node-postgres';
import { Pool } from 'pg';
import * as schema from './schema.js';
import { DRIZZLE } from './drizzle.constants.js';

export type DrizzleDb = ReturnType<typeof drizzle<typeof schema>>;

@Global()
@Module({
  providers: [
    {
      provide: DRIZZLE,
      useFactory: (config: ConfigService): DrizzleDb => {
        const connectionString = config.getOrThrow<string>('databaseUrl');
        const pool = new Pool({ connectionString });
        return drizzle(pool, { schema });
      },
      inject: [ConfigService],
    },
  ],
  exports: [DRIZZLE],
})
export class DrizzleModule {}
