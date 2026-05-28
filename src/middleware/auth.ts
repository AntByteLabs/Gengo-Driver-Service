import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { config } from '../config.js';
import { AppError } from '../domain/errors.js';
import { JwtPayload } from '../domain/types.js';

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      driver: JwtPayload;
      /** Populated by requireAuth for any authenticated role. */
      authUser: JwtPayload;
    }
  }
}

/** Accept any valid JWT regardless of role. Populates req.authUser. */
export function requireAuth(req: Request, _res: Response, next: NextFunction): void {
  const authHeader = req.headers.authorization;
  if (!authHeader?.startsWith('Bearer ')) {
    return next(AppError.unauthorized('Missing Bearer token'));
  }
  const token = authHeader.slice(7);
  try {
    const payload = jwt.verify(token, config.JWT_SECRET) as JwtPayload;
    req.authUser = payload;
    next();
  } catch {
    next(AppError.unauthorized('Invalid or expired token'));
  }
}

export function requireDriver(req: Request, _res: Response, next: NextFunction): void {
  const authHeader = req.headers.authorization;
  if (!authHeader?.startsWith('Bearer ')) {
    return next(AppError.unauthorized('Missing Bearer token'));
  }

  const token = authHeader.slice(7);
  let payload: JwtPayload;

  try {
    payload = jwt.verify(token, config.JWT_SECRET) as JwtPayload;
  } catch {
    return next(AppError.unauthorized('Invalid or expired token'));
  }

  if (payload.role !== 'driver') {
    return next(AppError.forbidden('Driver role required'));
  }

  req.driver = payload;
  next();
}
