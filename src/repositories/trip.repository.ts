import { PoolClient } from 'pg';
import { getPool } from '../infrastructure/pg.js';
import { TripRow, TripStatus, RiderRow } from '../domain/types.js';

export class TripRepository {
  async findById(tripId: string): Promise<TripRow | null> {
    const result = await getPool().query<TripRow>(
      `SELECT t.id,
              t.rider_id,
              t.driver_id,
              t.status,
              t.pickup_label,
              t.pickup_lat,
              t.pickup_lng,
              t.dropoff_label,
              t.dropoff_lat,
              t.dropoff_lng,
              t.distance_km,
              t.fare_paisa,
              t.payment_method,
              t.pickup_pin,
              t.accepted_at,
              t.arrived_at,
              t.started_at,
              t.completed_at,
              t.created_at,
              t.updated_at
         FROM trips.trips t
        WHERE t.id = $1`,
      [tripId],
    );
    return result.rows[0] ?? null;
  }

  async lockForUpdate(client: PoolClient, tripId: string): Promise<TripRow | null> {
    const result = await client.query<TripRow>(
      `SELECT t.id,
              t.rider_id,
              t.driver_id,
              t.status,
              t.pickup_label,
              t.pickup_lat,
              t.pickup_lng,
              t.dropoff_label,
              t.dropoff_lat,
              t.dropoff_lng,
              t.distance_km,
              t.fare_paisa,
              t.payment_method,
              t.pickup_pin,
              t.accepted_at,
              t.arrived_at,
              t.started_at,
              t.completed_at,
              t.created_at,
              t.updated_at
         FROM trips.trips t
        WHERE t.id = $1
          FOR UPDATE`,
      [tripId],
    );
    return result.rows[0] ?? null;
  }

  async updateStatus(
    client: PoolClient,
    tripId: string,
    status: TripStatus,
    extra?: Partial<{
      driver_id: string;
      accepted_at: Date;
      arrived_at: Date;
      started_at: Date;
      completed_at: Date;
    }>,
  ): Promise<void> {
    const setClauses: string[] = ['status = $1', 'updated_at = NOW()'];
    const values: unknown[] = [status];
    let idx = 2;

    if (extra) {
      for (const [key, val] of Object.entries(extra)) {
        if (val !== undefined) {
          setClauses.push(`${key} = $${idx++}`);
          values.push(val);
        }
      }
    }

    values.push(tripId);
    await client.query(
      `UPDATE trips.trips SET ${setClauses.join(', ')} WHERE id = $${idx}`,
      values,
    );
  }

  async getRiderInfo(riderId: string): Promise<RiderRow | null> {
    // riders live in the users or riders schema — adjust schema name as needed
    const result = await getPool().query<RiderRow>(
      `SELECT id, full_name, phone
         FROM users.profiles
        WHERE id = $1`,
      [riderId],
    );
    return result.rows[0] ?? null;
  }

  async getEarnings(params: {
    driverId: string;
    from: number;
    to: number;
    groupBy: 'day' | 'week' | 'month';
  }): Promise<Array<{ date: string; earningsPaisa: number; tripCount: number }>> {
    const truncMap: Record<string, string> = {
      day: 'day',
      week: 'week',
      month: 'month',
    };
    const trunc = truncMap[params.groupBy] ?? 'day';

    const result = await getPool().query<{
      date: string;
      earnings_paisa: string;
      trip_count: string;
    }>(
      `SELECT DATE_TRUNC($1, completed_at)::DATE::TEXT AS date,
              SUM(fare_paisa)::BIGINT                   AS earnings_paisa,
              COUNT(*)::INT                             AS trip_count
         FROM trips.trips
        WHERE driver_id = $2
          AND status    = 'COMPLETED'
          AND completed_at BETWEEN to_timestamp($3 / 1000.0)
                                AND to_timestamp($4 / 1000.0)
        GROUP BY 1
        ORDER BY 1`,
      [trunc, params.driverId, params.from, params.to],
    );

    return result.rows.map((r) => ({
      date: r.date,
      earningsPaisa: Number(r.earnings_paisa),
      tripCount: Number(r.trip_count),
    }));
  }

  async getEarningsTotals(params: {
    driverId: string;
    from: number;
    to: number;
  }): Promise<{ totalPaisa: number; tripCount: number }> {
    const result = await getPool().query<{
      total_paisa: string;
      trip_count: string;
    }>(
      `SELECT COALESCE(SUM(fare_paisa), 0)::BIGINT AS total_paisa,
              COUNT(*)::INT                         AS trip_count
         FROM trips.trips
        WHERE driver_id = $1
          AND status    = 'COMPLETED'
          AND completed_at BETWEEN to_timestamp($2 / 1000.0)
                                AND to_timestamp($3 / 1000.0)`,
      [params.driverId, params.from, params.to],
    );
    const row = result.rows[0];
    return {
      totalPaisa: Number(row?.total_paisa ?? 0),
      tripCount: Number(row?.trip_count ?? 0),
    };
  }
}

export const tripRepository = new TripRepository();
