import { Controller, Get } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiOkResponse } from '@nestjs/swagger';
import { AppService } from './app.service';

@ApiTags('Health')
@Controller()
export class AppController {
  constructor(private readonly appService: AppService) {}

  @Get()
  @ApiOperation({ summary: 'Health check', description: 'Returns a simple health check response.' })
  @ApiOkResponse({ description: 'Service is healthy.', type: String })
  getHello(): string {
    return this.appService.getHello();
  }
}
