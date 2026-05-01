import { Request, Response, NextFunction } from 'express';
import { v4 as uuidv4 } from 'uuid';

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      requestId: string;
    }
  }
}

export function requestIdMiddleware(
  req: Request,
  _res: Response,
  next: NextFunction,
): void {
  req.requestId = (req.headers['x-request-id'] as string | undefined) ?? uuidv4();
  next();
}

export function buildMeta(req: Request): { requestId: string; ts: number } {
  return { requestId: req.requestId, ts: Date.now() };
}
