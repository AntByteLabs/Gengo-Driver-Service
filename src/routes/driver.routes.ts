import fs from 'node:fs';
import path from 'node:path';
import { Router, Request, Response, NextFunction } from 'express';
// eslint-disable-next-line @typescript-eslint/no-require-imports
const multer = require('multer') as typeof import('multer');
type FileFilterCallback = Parameters<NonNullable<import('multer').Options['fileFilter']>>[2];

interface UploadedFile {
  fieldname: string;
  originalname: string;
  mimetype: string;
  path: string;
  size: number;
}
import { z } from 'zod';
import { requireDriver, requireAuth } from '../middleware/auth.js';
import { validate } from '../middleware/validate.js';
import { buildMeta } from '../middleware/request-id.js';
import { offerService } from '../services/offer.service.js';
import { tripService } from '../services/trip.service.js';
import { driverService } from '../services/driver.service.js';
import { registrationService } from '../services/registration.service.js';
import { AppError } from '../domain/errors.js';
import { config } from '../config.js';

const router = Router();

// ─── Multer (KYC file uploads) ────────────────────────────────────────────────

fs.mkdirSync(config.UPLOAD_DIR, { recursive: true });

const upload = multer({
  dest: config.UPLOAD_DIR,
  limits: { fileSize: 10 * 1024 * 1024 }, // 10 MiB
  fileFilter(_req: Request, file: UploadedFile, cb: FileFilterCallback) {
    const allowed = ['image/jpeg', 'image/png', 'image/webp', 'application/pdf'];
    if (allowed.includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error('Only JPEG, PNG, WebP, or PDF files are accepted'));
    }
  },
});

// ─── Zod schemas ──────────────────────────────────────────────────────────────

const startTripBody = z.object({
  pickupPin: z.string().min(1).max(10),
});

const earningsQuery = z.object({
  from: z.coerce.number().int().positive().optional(),
  to: z.coerce.number().int().positive().optional(),
  groupBy: z.enum(['day', 'week', 'month']).default('day'),
});

const registerBody = z.object({
  name: z.string().min(1).max(120).optional(),
  email: z.string().email().optional(),
  vehicleType: z.enum(['BIKE', 'CAR', 'AUTO', 'ELECTRIC']),
  make: z.string().max(80).optional(),
  model: z.string().max(80).optional(),
  year: z.coerce.number().int().min(1990).max(2030).optional(),
  plate: z.string().max(20).optional(),
  color: z.string().max(40).optional(),
});

const uploadDocQuery = z.object({
  docType: z.enum(['LICENSE', 'BLUEBOOK']),
});

// ─── POST /v1/driver/register ─────────────────────────────────────────────────
// Open to any authenticated user (rider or driver) so riders can register
// as drivers without needing to log in again with a different role.

router.post(
  '/register',
  requireAuth,
  validate(registerBody, 'body'),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const body = req.body as z.infer<typeof registerBody>;
      const result = await registrationService.register({
        userId: req.authUser.sub,
        name: body.name ?? null,
        email: body.email ?? null,
        vehicleType: body.vehicleType,
        make: body.make ?? null,
        model: body.model ?? null,
        year: body.year ?? null,
        plate: body.plate ?? null,
        color: body.color ?? null,
      });
      res.status(201).json({ success: true, data: result, meta: buildMeta(req) });
    } catch (err) {
      next(err);
    }
  },
);

// ─── GET /v1/driver/status ────────────────────────────────────────────────────

router.get(
  '/status',
  requireAuth,
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const data = await registrationService.getStatusByUserId(req.authUser.sub);
      res.status(200).json({ success: true, data, meta: buildMeta(req) });
    } catch (err) {
      next(err);
    }
  },
);

// ─── POST /v1/driver/kyc/upload ───────────────────────────────────────────────

router.post(
  '/kyc/upload',
  requireAuth,
  validate(uploadDocQuery, 'query'),
  (req: Request, res: Response, next: NextFunction) => {
    upload.single('file')(req, res, (err: unknown) => {
      if (err instanceof (multer as unknown as { MulterError: typeof Error }).MulterError) {
        return next(AppError.badRequest(err.message));
      }
      if (err instanceof Error) {
        return next(AppError.badRequest(err.message));
      }
      next();
    });
  },
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  async (req: any, res: Response, next: NextFunction) => {
    try {
      const file = req.file as UploadedFile | undefined;
      if (!file) throw AppError.badRequest('No file uploaded');

      const { docType } = req.query as z.infer<typeof uploadDocQuery>;

      // Rename the file multer wrote (no extension) to keep the extension.
      const ext = path.extname(file.originalname).toLowerCase() || '.bin';
      const newPath = `${file.path}${ext}`;
      fs.renameSync(file.path, newPath);

      const result = await registrationService.uploadDocumentByUserId({
        userId: req.authUser.sub,
        docType,
        filePath: newPath,
        originalName: file.originalname,
      });

      res.status(200).json({ success: true, data: result, meta: buildMeta(req) });
    } catch (err) {
      next(err);
    }
  },
);

// ─── POST /v1/driver/offers/:offerId/accept ───────────────────────────────────

router.post(
  '/offers/:offerId/accept',
  requireDriver,
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { offerId } = req.params as { offerId: string };
      const idempotencyKey = req.headers['idempotency-key'] as string | undefined;
      const data = await offerService.acceptOffer(offerId, req.driver.driverId, idempotencyKey);
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

// ─── POST /v1/driver/online ───────────────────────────────────────────────────

router.post(
  '/online',
  requireDriver,
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      await driverService.goOnline(req.driver.sub);
      res.sendStatus(204);
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
      await driverService.goOffline(req.driver.sub);
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
      const { from, to, groupBy } = req.query as unknown as z.infer<typeof earningsQuery>;
      const now = Date.now();
      const resolvedFrom = from ?? now - 30 * 24 * 60 * 60 * 1000;
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
