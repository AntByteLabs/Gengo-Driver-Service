import { getRedis } from '../infrastructure/redis.js';
import { driverRepository } from '../repositories/driver.repository.js';
import { tripRepository } from '../repositories/trip.repository.js';
import { AppError } from '../domain/errors.js';
import { EarningsSummary, PaginatedDrivers } from '../domain/types.js';
import { config } from '../config.js';

export class DriverService {
  async goOnline(userId: string): Promise<void> {
    const driver = await driverRepository.findByUserId(userId);
    if (!driver) throw AppError.notFound('Driver');
    if (driver.approval_status !== 'APPROVED') {
      throw AppError.driverNotApproved(driver.approval_status);
    }
    // Platform-debt gate: a driver who owes the platform more than their
    // loyalty-tier cap can't go online until they settle.
    await this.assertNotDebtBlocked(userId);
    await driverRepository.updateStatus(driver.id, 'online');
  }

  /** Asks payment-svc whether the driver's platform debt is within their tier
   *  cap. Fail-OPEN: a payment-svc hiccup must never trap a driver offline. */
  private async assertNotDebtBlocked(userId: string): Promise<void> {
    try {
      const { tripCount } = await tripRepository.getEarningsTotals({
        driverId: userId,
        from: 0,
        to: Date.now(),
      });
      const base = process.env['PAYMENT_SVC_URL'] ?? 'http://payment-svc:3008';
      const url = `${base}/v1/payments/internal/driver-eligibility?userId=${encodeURIComponent(
        userId,
      )}&completedRides=${tripCount}`;
      const res = await fetch(url, {
        headers: { 'X-Admin-Key': process.env['ADMIN_API_KEY'] ?? '' },
        signal: AbortSignal.timeout(3000),
      });
      if (!res.ok) return; // fail-open
      const body = (await res.json()) as {
        data?: { blocked?: boolean; debtPaisa?: number; limitPaisa?: number };
      };
      const d = body.data;
      if (d?.blocked) {
        throw AppError.driverDebtBlocked(d.debtPaisa ?? 0, d.limitPaisa ?? 0);
      }
    } catch (e) {
      if (e instanceof AppError) throw e;
      console.warn('[driver.service] debt eligibility check failed (fail-open):', e);
    }
  }

  async goOffline(userId: string): Promise<void> {
    const driver = await driverRepository.findByUserId(userId);
    if (!driver) throw AppError.notFound('Driver');

    const redis = getRedis();
    await Promise.all([
      redis
        .zrem(config.REDIS_GEO_KEY, driver.id)
        .catch((e: unknown) => console.error('[driver.service] zrem error', e)),
      driverRepository.updateStatus(driver.id, 'offline'),
    ]);
  }

  async getEarnings(
    driverId: string,
    from: number,
    to: number,
    groupBy: 'day' | 'week' | 'month',
  ): Promise<EarningsSummary> {
    const [totals, periods] = await Promise.all([
      tripRepository.getEarningsTotals({ driverId, from, to }),
      tripRepository.getEarnings({ driverId, from, to, groupBy }),
    ]);

    return {
      totalPaisa: totals.totalPaisa,
      tripCount: totals.tripCount,
      periods,
    };
  }

  async listDrivers(params: {
    status?: string | undefined;
    page: number;
    limit: number;
  }): Promise<PaginatedDrivers> {
    const { items, total } = await driverRepository.list(params);
    return {
      items,
      total,
      page: params.page,
      limit: params.limit,
    };
  }
}

export const driverService = new DriverService();
