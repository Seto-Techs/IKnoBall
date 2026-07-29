import { Controller, Get, HttpStatus } from '@nestjs/common';
import { ApiOperation, ApiProperty, ApiTags } from '@nestjs/swagger';
import { AllowAnonymous } from '@thallesp/nestjs-better-auth';
import { response, type ApiResponse } from './common/http/response';
import { ApiDataResponse } from './common/openapi/response';
import { AppService } from './app.service';

export class HealthResponse {
  @ApiProperty({ example: 'ok' })
  status!: 'ok';
}

@AllowAnonymous()
@ApiTags('Health')
@Controller()
export class AppController {
  constructor(private readonly appService: AppService) {}

  @Get()
  @ApiOperation({ summary: 'Health check' })
  @ApiDataResponse(HealthResponse, HttpStatus.OK, 'Service is healthy.', 'Service is healthy.')
  getHello(): ApiResponse<HealthResponse> {
    this.appService.getHello();
    return response(true, 'Service is healthy.', { status: 'ok' });
  }
}
