import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  HttpStatus,
} from '@nestjs/common';
import type { Response } from 'express';

const STATUS_CODES: Record<number, string> = {
  [HttpStatus.BAD_REQUEST]: 'BAD_REQUEST',
  [HttpStatus.UNAUTHORIZED]: 'UNAUTHORIZED',
  [HttpStatus.FORBIDDEN]: 'FORBIDDEN',
  [HttpStatus.NOT_FOUND]: 'NOT_FOUND',
  [HttpStatus.CONFLICT]: 'CONFLICT',
  [HttpStatus.UNPROCESSABLE_ENTITY]: 'UNPROCESSABLE_ENTITY',
  [HttpStatus.TOO_MANY_REQUESTS]: 'TOO_MANY_REQUESTS',
  [HttpStatus.INTERNAL_SERVER_ERROR]: 'INTERNAL_SERVER_ERROR',
};

@Catch(HttpException)
export class HttpExceptionFilter implements ExceptionFilter {
  catch(exception: HttpException, host: ArgumentsHost): void {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();
    const status = exception.getStatus();
    const raw = exception.getResponse();

    const code = STATUS_CODES[status] ?? 'ERROR';

    let message: string;
    let details: unknown;

    if (typeof raw === 'string') {
      message = raw;
    } else if (typeof raw === 'object' && raw !== null) {
      const r = raw as Record<string, unknown>;
      // class-validator errors come as { message: string[] }
      if (Array.isArray(r['message'])) {
        message = 'Validation failed';
        details = r['message'];
      } else {
        message = typeof r['message'] === 'string' ? r['message'] : code;
      }
    } else {
      message = code;
    }

    response.status(status).json({
      success: false,
      error: {
        code,
        message,
        ...(details !== undefined && { details }),
      },
    });
  }
}
