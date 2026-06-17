import { getPool } from '../infrastructure/pg.js';
import { ApprovalStatus, DriverProfileRow, DriverStatus } from '../domain/types.js';

const PROFILE_COLS = `
  id, user_id, name, email,
  vehicle_type, vehicle_plate, vehicle_model, license_no,
  status, approval_status, suspension_reason,
  rating_avg, trip_count, is_active,
  created_at, updated_at
`;

export class DriverRepository {
  async findById(driverId: string): Promise<DriverProfileRow | null> {
    const result = await getPool().query<DriverProfileRow>(
      `SELECT ${PROFILE_COLS} FROM drivers.profiles WHERE id = $1`,
      [driverId],
    );
    return result.rows[0] ?? null;
  }

  async findByUserId(userId: string): Promise<DriverProfileRow | null> {
    const result = await getPool().query<DriverProfileRow>(
      `SELECT ${PROFILE_COLS} FROM drivers.profiles WHERE user_id = $1`,
      [userId],
    );
    return result.rows[0] ?? null;
  }

  async create(params: {
    id: string;
    userId: string;
    name: string | null;
    email: string | null;
    vehicleType: string;
    vehiclePlate: string | null;
    vehicleModel: string | null;
  }): Promise<DriverProfileRow> {
    const result = await getPool().query<DriverProfileRow>(
      `INSERT INTO drivers.profiles
        (id, user_id, name, email, vehicle_type, vehicle_plate, vehicle_model,
         approval_status, status)
       VALUES ($1, $2, $3, $4, $5, $6, $7, 'PENDING', 'offline')
       RETURNING ${PROFILE_COLS}`,
      [
        params.id,
        params.userId,
        params.name,
        params.email,
        params.vehicleType,
        params.vehiclePlate,
        params.vehicleModel,
      ],
    );
    // The INSERT always returns exactly one row; the non-null assertion is safe here.
    return result.rows[0]!;
  }

  async updateStatus(driverId: string, status: DriverStatus): Promise<void> {
    await getPool().query(
      `UPDATE drivers.profiles
          SET status = $1, updated_at = NOW()
        WHERE id = $2`,
      [status, driverId],
    );
  }

  async updateApprovalStatus(
    driverId: string,
    approvalStatus: ApprovalStatus,
    suspensionReason: string | null = null,
  ): Promise<void> {
    await getPool().query(
      `UPDATE drivers.profiles
          SET approval_status   = $1,
              suspension_reason = $2,
              updated_at        = NOW()
        WHERE id = $3`,
      [approvalStatus, suspensionReason, driverId],
    );
  }

  async stats(): Promise<{ pendingApprovals: number; activeDrivers: number }> {
    const result = await getPool().query<{ pending: string; active: string }>(
      `SELECT
         COUNT(*) FILTER (WHERE approval_status = 'PENDING' AND is_active = TRUE)  AS pending,
         COUNT(*) FILTER (WHERE status = 'online'           AND is_active = TRUE)  AS active
       FROM drivers.profiles`,
    );
    const row = result.rows[0];
    return {
      pendingApprovals: Number(row?.pending ?? 0),
      activeDrivers: Number(row?.active ?? 0),
    };
  }

  // Daily completed-trip counts + revenue for the admin overview chart.
  // Fills missing days with zeros so the line chart renders continuously
  // even on days with no trips.
  async tripChart(days: number): Promise<Array<{ date: string; trips: number; revenuePaisa: number }>> {
    const bounded = Math.max(1, Math.min(30, Math.floor(days)));
    const result = await getPool().query<{ d: string; trips: string; revenue: string }>(
      `WITH series AS (
         SELECT generate_series(
           CURRENT_DATE - ($1::int - 1) * INTERVAL '1 day',
           CURRENT_DATE,
           INTERVAL '1 day'
         )::date AS d
       )
       SELECT
         to_char(series.d, 'YYYY-MM-DD') AS d,
         COUNT(t.id)                     AS trips,
         COALESCE(SUM(t.fare_paisa), 0)  AS revenue
       FROM series
       LEFT JOIN trips.trips t
         ON t.status = 'COMPLETED'
        AND t.completed_at >= series.d
        AND t.completed_at <  series.d + INTERVAL '1 day'
       GROUP BY series.d
       ORDER BY series.d`,
      [bounded],
    );
    return result.rows.map((r) => ({
      date: r.d,
      trips: Number(r.trips ?? 0),
      revenuePaisa: Number(r.revenue ?? 0),
    }));
  }

  // Trip-side and rider-side aggregates pulled cross-schema so the admin
  // overview tile can hit a single endpoint. Day boundary is the host's
  // current UTC midnight — matches the rest of trip-svc's day math.
  async tripStats(): Promise<{
    totalTripsToday: number;
    activeTrips: number;
    revenueTodayPaisa: number;
    totalRiders: number;
  }> {
    const result = await getPool().query<{
      total_today: string;
      active_trips: string;
      revenue_today: string;
      total_riders: string;
    }>(
      `SELECT
         (SELECT COUNT(*) FROM trips.trips
            WHERE requested_at >= CURRENT_DATE
              AND requested_at <  CURRENT_DATE + INTERVAL '1 day') AS total_today,
         (SELECT COUNT(*) FROM trips.trips
            WHERE status IN
              ('REQUESTED','MATCHED','ACCEPTED','EN_ROUTE_PICKUP',
               'ARRIVED_PICKUP','IN_PROGRESS')) AS active_trips,
         (SELECT COALESCE(SUM(fare_paisa), 0) FROM trips.trips
            WHERE status = 'COMPLETED'
              AND completed_at >= CURRENT_DATE
              AND completed_at <  CURRENT_DATE + INTERVAL '1 day') AS revenue_today,
         (SELECT COUNT(*) FROM auth.users WHERE role = 'rider')    AS total_riders`,
    );
    const row = result.rows[0];
    return {
      totalTripsToday: Number(row?.total_today ?? 0),
      activeTrips: Number(row?.active_trips ?? 0),
      revenueTodayPaisa: Number(row?.revenue_today ?? 0),
      totalRiders: Number(row?.total_riders ?? 0),
    };
  }

  async list(params: {
    approvalStatus?: string;
    page: number;
    limit: number;
  }): Promise<{ items: DriverProfileRow[]; total: number }> {
    const conditions: string[] = ['is_active = TRUE'];
    const values: unknown[] = [];
    let idx = 1;

    if (params.approvalStatus) {
      conditions.push(`approval_status = $${idx++}`);
      values.push(params.approvalStatus);
    }

    const where = `WHERE ${conditions.join(' AND ')}`;

    const countResult = await getPool().query<{ count: string }>(
      `SELECT COUNT(*)::INT AS count FROM drivers.profiles ${where}`,
      values,
    );
    const total = Number(countResult.rows[0]?.count ?? 0);

    const offset = (params.page - 1) * params.limit;
    values.push(params.limit, offset);

    const itemsResult = await getPool().query<DriverProfileRow>(
      `SELECT ${PROFILE_COLS}
         FROM drivers.profiles
        ${where}
        ORDER BY created_at DESC
        LIMIT $${idx++} OFFSET $${idx}`,
      values,
    );

    return { items: itemsResult.rows, total };
  }

  /**
   * Same as findById, but with `trip_count` and `rating_avg` computed live
   * from trips.trips / trips.ratings instead of the (denormalised, never
   * updated) columns on drivers.profiles. Used by the admin detail page
   * so the stat cards reflect reality.
   *
   * NOTE: trips.trips.driver_id stores the driver's *user_id*, not the
   * profile.id (see trip-svc handler joins). Hence the LATERAL JOIN keys
   * on p.user_id, not p.id.
   */
  async findByIdWithStats(driverId: string): Promise<DriverProfileRow | null> {
    const result = await getPool().query<DriverProfileRow>(
      `SELECT
         p.id, p.user_id, p.name, p.email,
         u.phone AS phone,
         p.vehicle_type, p.vehicle_plate, p.vehicle_model, p.license_no,
         p.status, p.approval_status, p.suspension_reason,
         COALESCE(rs.rating_avg::TEXT, p.rating_avg::TEXT) AS rating_avg,
         COALESCE(ts.trip_count, 0)::INT AS trip_count,
         p.is_active,
         p.created_at, p.updated_at
       FROM drivers.profiles p
       LEFT JOIN auth.users u ON u.id = p.user_id
       LEFT JOIN LATERAL (
         SELECT COUNT(*)::INT AS trip_count
           FROM trips.trips
          WHERE driver_id = p.user_id AND status = 'COMPLETED'
       ) ts ON TRUE
       LEFT JOIN LATERAL (
         SELECT AVG(r.rating)::NUMERIC(3,2) AS rating_avg
           FROM trips.ratings r
           JOIN trips.trips t ON t.id = r.trip_id
          WHERE t.driver_id = p.user_id
            AND r.direction = 'rider_to_driver'
       ) rs ON TRUE
       WHERE p.id = $1`,
      [driverId],
    );
    return result.rows[0] ?? null;
  }

  /**
   * Same as list, but with live trip_count + rating_avg per driver. Slightly
   * more expensive than list() — for a 20-row admin page this still finishes
   * well under 50 ms because both LATERAL joins hit indexed columns.
   */
  async listWithStats(params: {
    page: number;
    limit: number;
    approvalStatus?: string | null;
  }): Promise<{ items: DriverProfileRow[]; total: number }> {
    const conditions: string[] = [];
    const values: unknown[] = [];
    let idx = 1;

    if (params.approvalStatus !== undefined && params.approvalStatus !== null) {
      conditions.push(`p.approval_status = $${idx++}`);
      values.push(params.approvalStatus);
    }

    const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';

    const countResult = await getPool().query<{ count: string }>(
      `SELECT COUNT(*)::INT AS count FROM drivers.profiles p ${where}`,
      values,
    );
    const total = Number(countResult.rows[0]?.count ?? 0);

    const offset = (params.page - 1) * params.limit;
    values.push(params.limit, offset);

    const itemsResult = await getPool().query<DriverProfileRow>(
      `SELECT
         p.id, p.user_id, p.name, p.email,
         u.phone AS phone,
         p.vehicle_type, p.vehicle_plate, p.vehicle_model, p.license_no,
         p.status, p.approval_status, p.suspension_reason,
         COALESCE(rs.rating_avg::TEXT, p.rating_avg::TEXT) AS rating_avg,
         COALESCE(ts.trip_count, 0)::INT AS trip_count,
         p.is_active,
         p.created_at, p.updated_at
       FROM drivers.profiles p
       LEFT JOIN auth.users u ON u.id = p.user_id
       LEFT JOIN LATERAL (
         SELECT COUNT(*)::INT AS trip_count
           FROM trips.trips
          WHERE driver_id = p.user_id AND status = 'COMPLETED'
       ) ts ON TRUE
       LEFT JOIN LATERAL (
         SELECT AVG(r.rating)::NUMERIC(3,2) AS rating_avg
           FROM trips.ratings r
           JOIN trips.trips t ON t.id = r.trip_id
          WHERE t.driver_id = p.user_id
       ) rs ON TRUE
       ${where}
       ORDER BY p.created_at DESC
       LIMIT $${idx++} OFFSET $${idx}`,
      values,
    );

    return { items: itemsResult.rows, total };
  }
}

export const driverRepository = new DriverRepository();
