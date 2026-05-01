import { Router, Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import { requireAdminKey } from '../middleware/admin-auth.js';
import { validate } from '../middleware/validate.js';
import { buildMeta } from '../middleware/request-id.js';
import { driverService } from '../services/driver.service.js';

const router = Router();

// ─── Zod schemas ──────────────────────────────────────────────────────────────

const listDriversQuery = z.object({
  status: z.enum(['online', 'offline', 'on_trip']).optional(),
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
});

// ─── GET /v1/admin/drivers ───────────────────────────────────────────────────

router.get(
  '/drivers',
  requireAdminKey,
  validate(listDriversQuery, 'query'),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { status, page, limit } = req.query as unknown as z.infer<
        typeof listDriversQuery
      >;

      const result = await driverService.listDrivers({
        ...(status !== undefined ? { status } : {}),
        page,
        limit,
      });

      res.status(200).json({
        success: true,
        data: {
          items: result.items,
          pagination: {
            total: result.total,
            page: result.page,
            limit: result.limit,
            totalPages: Math.ceil(result.total / result.limit),
          },
        },
        meta: buildMeta(req),
      });
    } catch (err) {
      next(err);
    }
  },
);

export default router;
