import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
} from '@nestjs/common';

// Applied globally via APP_FILTER. Normalises every thrown HttpException
// (including ValidationPipe 400s and guard 401s) to one shape so the
// frontend's api.js only ever parses a single error contract.
@Catch(HttpException)
export class HttpExceptionFilter implements ExceptionFilter {
  catch(exception: HttpException, host: ArgumentsHost): void {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<{
      status: (code: number) => {
        json: (body: Record<string, unknown>) => void;
      };
    }>();
    const request = ctx.getRequest<{ url: string }>();
    const status = exception.getStatus();
    const body = exception.getResponse();
    let message: unknown = exception.message;
    if (typeof body === 'string') {
      message = body;
    } else if (
      typeof body === 'object' &&
      body !== null &&
      'message' in body
    ) {
      // 'in' narrowing gives body.message: unknown — ValidationPipe's
      // string[] passes through untouched, no cast needed.
      message = body.message;
    }

    response.status(status).json({
      statusCode: status,
      message,
      timestamp: new Date().toISOString(),
      path: request.url,
    });
  }
}
