import { Module } from '@nestjs/common';
import { DrizzleModule } from '../db/drizzle.module.js';
import { RolesController } from './roles.controller.js';

@Module({
  imports: [DrizzleModule],
  controllers: [RolesController],
})
export class RegistryModule {}
