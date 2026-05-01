import express, { Request, Response } from 'express';
import { requestIdMiddleware } from './middleware/request-id.js';
import { errorHandler } from './middleware/error-handler.js';
import driverRoutes from './routes/driver.routes.js';
import adminRoutes from './routes/admin.routes.js';

export function createApp(): express.Application {
  const app = express();

  // ── Global middleware ──────────────────────────────────────────────────────
  app.use(express.json({ limit: '256kb' }));
  app.use(requestIdMiddleware);

  // Disable fingerprinting headers
  app.disable('x-powered-by');

  // ── Health / liveness ──────────────────────────────────────────────────────
  app.get('/healthz', (_req: Request, res: Response) => {
    res.json({ status: 'ok', service: 'driver-svc', ts: Date.now() });
  });

  // ── Route mounts ───────────────────────────────────────────────────────────
  app.use('/v1/driver', driverRoutes);
  app.use('/v1/admin', adminRoutes);

  // ── Catch-all 404 ──────────────────────────────────────────────────────────
  app.use((_req: Request, res: Response) => {
    res.status(404).json({
      success: false,
      error: { code: 'NOT_FOUND', message: 'Route not found' },
    });
  });

  // ── Error handler (must be last) ───────────────────────────────────────────
  app.use(errorHandler);

  return app;
}
