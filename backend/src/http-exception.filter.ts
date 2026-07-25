import {
  ExceptionFilter,
  Catch,
  ArgumentsHost,
  HttpException,
  HttpStatus,
} from '@nestjs/common';
import { Response } from 'express';

@Catch()
export class HttpExceptionFilter implements ExceptionFilter {
  catch(exception: unknown, host: ArgumentsHost) {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();

    let status = HttpStatus.INTERNAL_SERVER_ERROR;
    let message: string | string[] = 'Internal server error';
    let payload: unknown = null;

    if (exception instanceof HttpException) {
      status = exception.getStatus();
      const res = exception.getResponse();

      if (typeof res === 'object' && res !== null) {
        payload = 'payload' in res ? (res as Record<string, unknown>).payload : null;
        const msg = (res as Record<string, unknown>).message;
        message = typeof msg === 'string' || Array.isArray(msg) ? msg : message;
      } else if (typeof res === 'string') {
        message = res;
      }
    } else if (exception instanceof Error) {
      message = exception.message;
    }

    response.status(status).json({
      is_success: false,
      message,
      payload,
    });
  }
}
