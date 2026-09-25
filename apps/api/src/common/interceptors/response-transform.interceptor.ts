import {
  CallHandler,
  ExecutionContext,
  Injectable,
  NestInterceptor,
} from '@nestjs/common';
import { map, Observable } from 'rxjs';

// Applied globally via APP_INTERCEPTOR. Wraps plain handler results as
// `{ data }` so api.js has one success contract.
// SSE subscriptions pass through untouched: EventSource always sends
// `Accept: text/event-stream`, and wrapping events would corrupt the
// live stream the status panel consumes (TRD §5.3).
@Injectable()
export class ResponseTransformInterceptor implements NestInterceptor {
  intercept(
    context: ExecutionContext,
    next: CallHandler,
  ): Observable<{ data: unknown } | unknown> {
    const request = context
      .switchToHttp()
      .getRequest<{ headers: Record<string, string | undefined> }>();
    if (request.headers.accept === 'text/event-stream') {
      return next.handle();
    }
    return next.handle().pipe(map((result: unknown) => ({ data: result })));
  }
}
