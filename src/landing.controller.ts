import { Controller, Get } from '@nestjs/common';
import { ApiExcludeController } from '@nestjs/swagger';
import { Public } from './common/decorators/public.decorator.js';

/** Served at `/` (excluded from global `api` prefix — see configure-app). */
@ApiExcludeController()
@Public()
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
