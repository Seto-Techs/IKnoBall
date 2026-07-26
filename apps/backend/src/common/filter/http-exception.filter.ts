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

interface ProblemDetails {
  type: 'about:blank';
  title: string;
  status: number;
  detail: string;
  instance: string;
  errors?: unknown;
}

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
    const problem = this.problem(exception, status, httpAdapter.getRequestUrl(request));

    if (status >= HttpStatus.INTERNAL_SERVER_ERROR) {
      this.logger.error(
        `${status} ${problem.title}`,
        exception instanceof Error ? exception.stack : undefined,
        HttpExceptionFilter.name,
      );
    }

    if (httpAdapter.isHeadersSent(response)) {
      httpAdapter.end(response);
      return;
    }

    httpAdapter.setHeader(response, 'content-type', 'application/problem+json');
    httpAdapter.reply(response, problem, status);
  }

  private problem(exception: unknown, status: number, instance: string): ProblemDetails {
    if (!(exception instanceof HttpException)) {
      return {
        type: 'about:blank',
        title: INTERNAL_ERROR,
        status,
        detail: INTERNAL_ERROR,
        instance,
      };
    }

    const response = exception.getResponse();
    const body = isRecord(response) ? response : {};
    const message = typeof response === 'string' ? response : body.message;
    const detail = Array.isArray(message)
      ? message.join('; ')
      : typeof message === 'string'
        ? message
        : 'Request failed';
    const problem: ProblemDetails = {
      type: 'about:blank',
      title: typeof body.error === 'string' ? body.error : detail,
      status,
      detail,
      instance,
    };

    if ('errors' in body) problem.errors = body.errors;
    return problem;
  }
}
