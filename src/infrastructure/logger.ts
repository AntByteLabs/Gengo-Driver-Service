// Structured logger for driver-svc. Wraps `createLogger` from @gengo/shared
// (pino + PII redact list covering phone, OTP, JWTs, admin keys, license_no,
// vehicle_plate, pickup_pin) and exposes a `loggerFor(req)` helper so every
// log line in a request handler is tagged with `requestId` for cross-service
// tracing.
//
// CLAUDE.md §10: logs must NEVER contain JWTs, OTPs, raw card data, or full
// phone numbers. Same applies to license_no / vehicle_plate / pickup_pin —
// they are added to the redact list at the @gengo/shared layer so we never
// have to remember to scrub at the call site.

import type { Request } from 'express';
import { createLogger, type Logger } from '@gengo/shared';

export const logger: Logger = createLogger({ name: 'driver-svc' });

export function loggerFor(req: Request): Logger {
  return logger.child({ requestId: req.requestId });
}
