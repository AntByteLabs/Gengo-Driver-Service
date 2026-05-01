import { getRedis } from '../infrastructure/redis.js';
import { driverRepository } from '../repositories/driver.repository.js';
import { tripRepository } from '../repositories/trip.repository.js';
import { AppError } from '../domain/errors.js';
import { EarningsSummary, PaginatedDrivers } from '../domain/types.js';
import { config } from '../config.js';

export class DriverService {
  async goOffline(driverId: string): Promise<void> {
    const driver = await driverRepository.findById(driverId);
    if (!driver) throw AppError.notFound('Driver');

    // Remove from the GEO sorted set and set DB status
    const redis = getRedis();
    await Promise.all([
      redis
        .zrem(config.REDIS_GEO_KEY, driverId)
        .catch((e: unknown) => console.error('[driver.service] zrem error', e)),
      driverRepository.updateStatus(driverId, 'offline'),
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
