import { Injectable, NestInterceptor, ExecutionContext, CallHandler } from '@nestjs/common';
import { Observable } from 'rxjs';
import { map } from 'rxjs/operators';

@Injectable()
export class ResponseInterceptor implements NestInterceptor {
  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    return next.handle().pipe(
      map((res: unknown) => {
        let payload: unknown = res;
        let message = 'Success';

        if (res && typeof res === 'object' && 'data' in res) {
          payload = (res as Record<string, unknown>).data;
          const msg = (res as Record<string, unknown>).message;
          if (typeof msg === 'string') {
            message = msg;
          }
        }

        return {
          is_success: true,
          message,
          payload: payload ?? null,
        };
      }),
    );
  }
}
