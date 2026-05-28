import { Router, Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import { requireAdminKey } from '../middleware/admin-auth.js';
import { validate } from '../middleware/validate.js';
import { buildMeta } from '../middleware/request-id.js';
import { adminDriverService } from '../services/admin-driver.service.js';
import { driverRepository } from '../repositories/driver.repository.js';
import type { KycDocStatus } from '../domain/types.js';

const router = Router();

// ─── Zod schemas ──────────────────────────────────────────────────────────────

const listDriversQuery = z.object({
  status: z.enum(['PENDING', 'APPROVED', 'SUSPENDED', 'NEEDS_RESUBMISSION']).optional(),
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
});

const suspendBody = z.object({
  reason: z.string().max(500).default(''),
});

const reviewDocBody = z.object({
  status: z.enum(['APPROVED', 'REJECTED', 'NEEDS_RESUBMISSION']),
  reviewNotes: z.string().max(500).optional(),
});

// ─── GET /v1/admin/stats/overview ────────────────────────────────────────────

router.get(
  '/stats/overview',
  requireAdminKey,
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const stats = await adminDriverService.getStats();
      res.status(200).json({ success: true, data: stats, meta: buildMeta(req) });
    } catch (err) {
      next(err);
    }
  },
);

// ─── GET /v1/admin/stats/trips-chart ─────────────────────────────────────────

router.get(
  '/stats/trips-chart',
  requireAdminKey,
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const days = Math.min(Number(req.query['days'] ?? 7), 30);
      const data = await driverRepository.tripChart(days);
      res.status(200).json({ success: true, data, meta: buildMeta(req) });
    } catch (err) {
      next(err);
    }
  },
);

// ─── GET /v1/admin/drivers ────────────────────────────────────────────────────

router.get(
  '/drivers',
  requireAdminKey,
  validate(listDriversQuery, 'query'),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { status, page, limit } = req.query as unknown as z.infer<typeof listDriversQuery>;

      const result = await adminDriverService.listDrivers({
        ...(status !== undefined ? { approvalStatus: status } : {}),
        page,
        limit,
      });

      // Map DB rows to the shape expected by the admin panel.
      const items = result.items.map(mapDriverToAdmin);

      res.status(200).json({
        success: true,
        data: {
          data: items,
          total: result.total,
          page: result.page,
          limit: result.limit,
          totalPages: Math.ceil(result.total / result.limit),
        },
        meta: buildMeta(req),
      });
    } catch (err) {
      next(err);
    }
  },
);

// ─── GET /v1/admin/drivers/:id ────────────────────────────────────────────────

router.get(
  '/drivers/:id',
  requireAdminKey,
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { id } = req.params as { id: string };
      const { profile, vehicle, kycDocuments } = await adminDriverService.getDriverFull(id);

      res.status(200).json({
        success: true,
        data: {
          ...mapDriverToAdmin(profile),
          vehicle: vehicle
            ? {
                id: vehicle.id,
                type: vehicle.vehicle_type,
                make: vehicle.make ?? '',
                model: vehicle.model ?? '',
                year: vehicle.year ?? null,
                plateNumber: vehicle.plate ?? '',
                color: vehicle.color ?? '',
                isApproved: profile.approval_status === 'APPROVED',
              }
            : null,
          kycDocuments: kycDocuments.map((d) => ({
            id: d.id,
            type: d.doc_type,
            url: d.file_url,
            status: d.status,
            reviewNotes: d.review_notes,
            uploadedAt: d.uploaded_at.toISOString(),
            reviewedAt: d.reviewed_at ? d.reviewed_at.toISOString() : null,
          })),
        },
        meta: buildMeta(req),
      });
    } catch (err) {
      next(err);
    }
  },
);

// ─── POST /v1/admin/drivers/:id/approve ──────────────────────────────────────

router.post(
  '/drivers/:id/approve',
  requireAdminKey,
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { id } = req.params as { id: string };
      await adminDriverService.approveDriver(id);
      res.status(200).json({ success: true, data: { approved: true }, meta: buildMeta(req) });
    } catch (err) {
      next(err);
    }
  },
);

// ─── POST /v1/admin/drivers/:id/suspend ──────────────────────────────────────

router.post(
  '/drivers/:id/suspend',
  requireAdminKey,
  validate(suspendBody, 'body'),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { id } = req.params as { id: string };
      const { reason } = req.body as z.infer<typeof suspendBody>;
      await adminDriverService.suspendDriver(id, reason);
      res.status(200).json({ success: true, data: { suspended: true }, meta: buildMeta(req) });
    } catch (err) {
      next(err);
    }
  },
);

// ─── POST /v1/admin/drivers/:id/unsuspend ────────────────────────────────────

router.post(
  '/drivers/:id/unsuspend',
  requireAdminKey,
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { id } = req.params as { id: string };
      await adminDriverService.unsuspendDriver(id);
      res.status(200).json({ success: true, data: { unsuspended: true }, meta: buildMeta(req) });
    } catch (err) {
      next(err);
    }
  },
);

// ─── PATCH /v1/admin/drivers/:id/documents/:docId ────────────────────────────

router.patch(
  '/drivers/:id/documents/:docId',
  requireAdminKey,
  validate(reviewDocBody, 'body'),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { id, docId } = req.params as { id: string; docId: string };
      const { status, reviewNotes } = req.body as z.infer<typeof reviewDocBody>;

      const doc = await adminDriverService.reviewDocument({
        driverId: id,
        docId,
        status: status as KycDocStatus,
        reviewNotes: reviewNotes ?? null,
      });

      res.status(200).json({ success: true, data: doc, meta: buildMeta(req) });
    } catch (err) {
      next(err);
    }
  },
);

// ─── Helpers ──────────────────────────────────────────────────────────────────

function mapDriverToAdmin(p: {
  id: string;
  user_id: string;
  phone?: string | null;
  name: string | null;
  email: string | null;
  vehicle_type: string;
  vehicle_plate: string | null;
  vehicle_model: string | null;
  approval_status: string;
  status: string;
  rating_avg: string;
  trip_count: number;
  created_at: Date;
  updated_at: Date;
}) {
  return {
    id: p.id,
    // user_id is exposed separately so the admin can use it as the
    // trips.driver_id filter key (trip-svc stores user_id there, not the
    // driver profile id — see the WithStats LATERAL JOINs in
    // driver.repository.ts).
    userId: p.user_id,
    fullName: p.name ?? 'Unknown',
    // Real phone from auth.users.phone via the *WithStats JOIN. Empty
    // string instead of leaking the user_id into the UI's tel: link
    // when the join misses (shouldn't happen — every admin path uses
    // the stats query).
    phone: p.phone ?? '',
    email: p.email ?? undefined,
    status: p.approval_status,            // PENDING/APPROVED/SUSPENDED for admin UI
    isOnline: p.status === 'online',
    rating: parseFloat(p.rating_avg) || 5.0,
    totalTrips: p.trip_count,
    vehicle: p.vehicle_model
      ? {
          id: '',
          type: p.vehicle_type,
          make: '',
          model: p.vehicle_model,
          year: null,
          plateNumber: p.vehicle_plate ?? '',
          color: '',
          isApproved: p.approval_status === 'APPROVED',
        }
      : undefined,
    createdAt: p.created_at.toISOString(),
    updatedAt: p.updated_at.toISOString(),
  };
}

export default router;
