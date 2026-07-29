import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  HttpStatus,
  Inject,
  Injectable,
  type LoggerService,
} from '@nestjs/common';
import { HttpAdapterHost } from '@nestjs/core';
import { WINSTON_MODULE_NEST_PROVIDER } from 'nest-winston';

const INTERNAL_ERROR = 'Internal server error';

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

@Catch()
@Injectable()
export class HttpExceptionFilter implements ExceptionFilter {
  constructor(
    private readonly adapterHost: HttpAdapterHost,
    @Inject(WINSTON_MODULE_NEST_PROVIDER) private readonly logger: LoggerService,
  ) {}

  catch(exception: unknown, host: ArgumentsHost): void {
    const { httpAdapter } = this.adapterHost;
    const context = host.switchToHttp();
    const request = context.getRequest();
    const response = context.getResponse();
    const status =
      exception instanceof HttpException ? exception.getStatus() : HttpStatus.INTERNAL_SERVER_ERROR;

    if (status >= HttpStatus.INTERNAL_SERVER_ERROR) {
      this.logger.error(
        `${status} ${INTERNAL_ERROR}`,
        exception instanceof Error ? exception.stack : undefined,
        HttpExceptionFilter.name,
      );
    }

    if (httpAdapter.isHeadersSent(response)) {
      httpAdapter.end(response);
      return;
    }

    httpAdapter.reply(response, this.errorBody(exception, status), status);
  }

  private errorBody(exception: unknown, status: number): Record<string, unknown> {
    if (!(exception instanceof HttpException)) {
      return { is_success: false, message: INTERNAL_ERROR, data: null };
    }

    const response = exception.getResponse();
    const body = isRecord(response) ? response : {};
    const message = typeof response === 'string' ? response : body.message;
    const detail = Array.isArray(message)
      ? message.join('; ')
      : typeof message === 'string'
        ? message
        : 'Request failed';

    return { is_success: false, message: detail, data: null };
  }
}
