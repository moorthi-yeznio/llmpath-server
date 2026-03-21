import { Controller, Get } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { Public } from './common/decorators/public.decorator.js';
import { AppService } from './app.service.js';

@ApiTags('app')
@Public()
@Controller()
export class AppController {
  constructor(private readonly appService: AppService) {}

  @Get('hello')
  @ApiOperation({ summary: 'Sample greeting' })
  getHello(): string {
    return this.appService.getHello();
  }
}
