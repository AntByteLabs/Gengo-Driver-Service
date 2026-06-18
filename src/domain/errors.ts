export type ErrorCode =
  | 'UNAUTHORIZED'
  | 'FORBIDDEN'
  | 'NOT_FOUND'
  | 'BAD_REQUEST'
  | 'OFFER_TAKEN'
  | 'OFFER_EXPIRED'
  | 'TRIP_STATE_INVALID'
  | 'DRIVER_NOT_FOUND'
  | 'DRIVER_NOT_APPROVED'
  | 'DRIVER_DEBT_BLOCKED'
  | 'INTERNAL_ERROR'
  | 'IDEMPOTENCY_CONFLICT';

export class AppError extends Error {
  constructor(
    public readonly code: ErrorCode,
    message: string,
    public readonly httpStatus: number,
    public readonly field?: string,
  ) {
    super(message);
    this.name = 'AppError';
    // Maintain proper prototype chain for instanceof checks
    Object.setPrototypeOf(this, AppError.prototype);
  }

  static unauthorized(message = 'Unauthorized'): AppError {
    return new AppError('UNAUTHORIZED', message, 401);
  }

  static forbidden(message = 'Forbidden'): AppError {
    return new AppError('FORBIDDEN', message, 403);
  }

  static notFound(resource: string): AppError {
    return new AppError('NOT_FOUND', `${resource} not found`, 404);
  }

  static badRequest(message: string, field?: string): AppError {
    return new AppError('BAD_REQUEST', message, 400, field);
  }

  static driverNotApproved(approvalStatus: string): AppError {
    return new AppError(
      'DRIVER_NOT_APPROVED',
      `Driver account is not approved (status: ${approvalStatus}). Complete KYC and wait for approval before going online or taking trips.`,
      403,
    );
  }

  static driverDebtBlocked(debtPaisa: number, limitPaisa: number): AppError {
    const debt = Math.round(debtPaisa / 100);
    const limit = Math.round(limitPaisa / 100);
    return new AppError(
      'DRIVER_DEBT_BLOCKED',
      `You owe the platform Rs ${debt}, over your Rs ${limit} limit. Settle your balance to go back online.`,
      403,
    );
  }

  static offerTaken(): AppError {
    return new AppError('OFFER_TAKEN', 'Offer has already been accepted by another driver', 409);
  }

  static offerExpired(): AppError {
    return new AppError('OFFER_EXPIRED', 'Offer has expired', 410);
  }

  static tripStateInvalid(current: string, expected: string): AppError {
    return new AppError(
      'TRIP_STATE_INVALID',
      `Trip is in state '${current}', expected '${expected}'`,
      409,
    );
  }

  static internal(message = 'Internal server error'): AppError {
    return new AppError('INTERNAL_ERROR', message, 500);
  }
}
