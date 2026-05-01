import { Request, Response, NextFunction } from 'express';
import { timingSafeEqual } from 'crypto';
import { config } from '../config.js';
import { AppError } from '../domain/errors.js';

export function requireAdminKey(req: Request, _res: Response, next: NextFunction): void {
  const provided = req.headers['x-admin-key'];
  if (typeof provided !== 'string' || provided.length === 0) {
    return next(AppError.unauthorized('Missing X-Admin-Key header'));
  }

  const expected = config.ADMIN_API_KEY;

  // Constant-time comparison to prevent timing attacks
  if (provided.length !== expected.length) {
    return next(AppError.forbidden('Invalid admin key'));
  }

  const a = Buffer.from(provided);
  const b = Buffer.from(expected);
  if (!timingSafeEqual(a, b)) {
    return next(AppError.forbidden('Invalid admin key'));
  }

  next();
}
