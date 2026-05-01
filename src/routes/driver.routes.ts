import { Router, Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import { requireDriver } from '../middleware/auth.js';
import { validate } from '../middleware/validate.js';
import { buildMeta } from '../middleware/request-id.js';
import { offerService } from '../services/offer.service.js';
import { tripService } from '../services/trip.service.js';
import { driverService } from '../services/driver.service.js';

const router = Router();

// ─── Zod schemas ──────────────────────────────────────────────────────────────

const startTripBody = z.object({
  pickupPin: z.string().min(1).max(10),
});

const earningsQuery = z.object({
  from: z.coerce.number().int().positive().optional(),
  to: z.coerce.number().int().positive().optional(),
  groupBy: z.enum(['day', 'week', 'month']).default('day'),
});

// ─── POST /v1/driver/offers/:offerId/accept ───────────────────────────────────

router.post(
  '/offers/:offerId/accept',
  requireDriver,
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { offerId } = req.params as { offerId: string };
      const idempotencyKey = req.headers['idempotency-key'] as string | undefined;

      const data = await offerService.acceptOffer(
        offerId,
        req.driver.driverId,
        idempotencyKey,
      );

      res.status(200).json({ success: true, data, meta: buildMeta(req) });
    } catch (err) {
      next(err);
    }
  },
);

// ─── POST /v1/driver/offers/:offerId/decline ──────────────────────────────────

router.post(
  '/offers/:offerId/decline',
  requireDriver,
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { offerId } = req.params as { offerId: string };
      await offerService.declineOffer(offerId, req.driver.driverId);
      res.sendStatus(204);
    } catch (err) {
      next(err);
    }
  },
);

// ─── POST /v1/driver/trips/:id/arrived ───────────────────────────────────────

router.post(
  '/trips/:id/arrived',
  requireDriver,
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { id } = req.params as { id: string };
      const data = await tripService.markArrived(id, req.driver.driverId);
      res.status(200).json({ success: true, data, meta: buildMeta(req) });
    } catch (err) {
      next(err);
    }
  },
);

// ─── POST /v1/driver/trips/:id/start ─────────────────────────────────────────

router.post(
  '/trips/:id/start',
  requireDriver,
  validate(startTripBody, 'body'),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { id } = req.params as { id: string };
      const { pickupPin } = req.body as z.infer<typeof startTripBody>;
      const data = await tripService.startTrip(id, req.driver.driverId, pickupPin);
      res.status(200).json({ success: true, data, meta: buildMeta(req) });
    } catch (err) {
      next(err);
    }
  },
);

// ─── POST /v1/driver/trips/:id/complete ──────────────────────────────────────

router.post(
  '/trips/:id/complete',
  requireDriver,
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { id } = req.params as { id: string };
      const data = await tripService.completeTrip(id, req.driver.driverId);
      res.status(200).json({ success: true, data, meta: buildMeta(req) });
    } catch (err) {
      next(err);
    }
  },
);

// ─── POST /v1/driver/offline ──────────────────────────────────────────────────

router.post(
  '/offline',
  requireDriver,
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      await driverService.goOffline(req.driver.driverId);
      res.sendStatus(204);
    } catch (err) {
      next(err);
    }
  },
);

// ─── GET /v1/driver/earnings ──────────────────────────────────────────────────

router.get(
  '/earnings',
  requireDriver,
  validate(earningsQuery, 'query'),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { from, to, groupBy } = req.query as unknown as z.infer<
        typeof earningsQuery
      >;

      const now = Date.now();
      const resolvedFrom = from ?? now - 30 * 24 * 60 * 60 * 1000; // default: 30 days ago
      const resolvedTo = to ?? now;

      const data = await driverService.getEarnings(
        req.driver.driverId,
        resolvedFrom,
        resolvedTo,
        groupBy,
      );

      res.status(200).json({ success: true, data, meta: buildMeta(req) });
    } catch (err) {
      next(err);
    }
  },
);

export default router;
