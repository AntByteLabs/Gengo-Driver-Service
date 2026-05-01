import { getPool } from '../infrastructure/pg.js';
import { DriverProfileRow, DriverStatus } from '../domain/types.js';

export class DriverRepository {
  async findById(driverId: string): Promise<DriverProfileRow | null> {
    const result = await getPool().query<DriverProfileRow>(
      `SELECT id, user_id, vehicle_type, vehicle_plate, vehicle_model,
              license_no, status, rating_avg, trip_count, is_active,
              created_at, updated_at
         FROM drivers.profiles
        WHERE id = $1`,
      [driverId],
    );
    return result.rows[0] ?? null;
  }

  async findByUserId(userId: string): Promise<DriverProfileRow | null> {
    const result = await getPool().query<DriverProfileRow>(
      `SELECT id, user_id, vehicle_type, vehicle_plate, vehicle_model,
              license_no, status, rating_avg, trip_count, is_active,
              created_at, updated_at
         FROM drivers.profiles
        WHERE user_id = $1`,
      [userId],
    );
    return result.rows[0] ?? null;
  }

  async updateStatus(driverId: string, status: DriverStatus): Promise<void> {
    await getPool().query(
      `UPDATE drivers.profiles
          SET status     = $1,
              updated_at = NOW()
        WHERE id = $2`,
      [status, driverId],
    );
  }

  async list(params: {
    status?: string | undefined;
    page: number;
    limit: number;
  }): Promise<{ items: DriverProfileRow[]; total: number }> {
    const conditions: string[] = ['is_active = TRUE'];
    const values: unknown[] = [];
    let idx = 1;

    if (params.status) {
      conditions.push(`status = $${idx++}`);
      values.push(params.status);
    }

    const where = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

    const countResult = await getPool().query<{ count: string }>(
      `SELECT COUNT(*)::INT AS count FROM drivers.profiles ${where}`,
      values,
    );
    const total = Number(countResult.rows[0]?.count ?? 0);

    const offset = (params.page - 1) * params.limit;
    values.push(params.limit, offset);

    const itemsResult = await getPool().query<DriverProfileRow>(
      `SELECT id, user_id, vehicle_type, vehicle_plate, vehicle_model,
              license_no, status, rating_avg, trip_count, is_active,
              created_at, updated_at
         FROM drivers.profiles
        ${where}
        ORDER BY created_at DESC
        LIMIT $${idx++} OFFSET $${idx}`,
      values,
    );

    return { items: itemsResult.rows, total };
  }
}

export const driverRepository = new DriverRepository();
