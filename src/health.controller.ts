import { Controller, Get } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { Public } from './common/decorators/public.decorator.js';

/** Served at `/health` (excluded from global `api` prefix — see configure-app). */
@ApiTags('health')
@Public()
@Controller('health')
export class HealthController {
  @Get()
  @ApiOperation({ summary: 'Liveness / readiness' })
  health() {
    return { status: 'ok' };
  }
}
