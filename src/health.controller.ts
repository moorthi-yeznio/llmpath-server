import { Controller, Get } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';

/** Served at `/health` (excluded from global `api` prefix — see configure-app). */
@ApiTags('health')
@Controller('health')
export class HealthController {
  @Get()
  @ApiOperation({ summary: 'Liveness / readiness' })
  health() {
    return { status: 'ok' };
  }
}
