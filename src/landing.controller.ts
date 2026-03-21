import { Controller, Get } from '@nestjs/common';
import { ApiExcludeController } from '@nestjs/swagger';

/** Served at `/` (excluded from global `api` prefix — see configure-app). */
@ApiExcludeController()
@Controller()
export class LandingController {
  @Get()
  root() {
    return {
      service: 'llmpath-server',
      api: '/api/hello',
      docs: '/api/docs',
    };
  }
}
