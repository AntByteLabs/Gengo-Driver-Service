import { Request, Response, NextFunction } from 'express';
import { ZodSchema, ZodError } from 'zod';
import { AppError } from '../domain/errors.js';

type Target = 'body' | 'query' | 'params';

export function validate<T>(schema: ZodSchema<T>, target: Target = 'body') {
  return (req: Request, _res: Response, next: NextFunction): void => {
    const result = schema.safeParse(req[target]);
    if (!result.success) {
      const issue = result.error.issues[0];
      const field = issue?.path.join('.');
      const message = issue?.message ?? 'Validation error';
      return next(AppError.badRequest(message, field));
    }
    // Overwrite with parsed (coerced/stripped) value
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (req as any)[target] = result.data;
    next();
  };
}

export function isZodError(err: unknown): err is ZodError {
  return err instanceof ZodError;
}
