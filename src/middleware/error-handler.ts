import { Request, Response, NextFunction } from 'express';
import { AppError } from '../domain/errors.js';
import { buildMeta } from './request-id.js';

// eslint-disable-next-line @typescript-eslint/no-unused-vars
export function errorHandler(
  err: unknown,
  req: Request,
  res: Response,
  _next: NextFunction,
): void {
  if (err instanceof AppError) {
    const body: Record<string, unknown> = {
      success: false,
      error: {
        code: err.code,
        message: err.message,
        ...(err.field !== undefined ? { field: err.field } : {}),
      },
      meta: buildMeta(req),
    };
    res.status(err.httpStatus).json(body);
    return;
  }

  // Unknown / unhandled error — never leak details in production
  const isDev = process.env['NODE_ENV'] !== 'production';
  console.error('[error-handler] unhandled error', err);

  res.status(500).json({
    success: false,
    error: {
      code: 'INTERNAL_ERROR',
      message: isDev && err instanceof Error ? err.message : 'Internal server error',
    },
    meta: buildMeta(req),
  });
}
