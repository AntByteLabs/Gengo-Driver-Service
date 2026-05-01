import { PoolClient } from 'pg';
import { getPool } from '../infrastructure/pg.js';
import { OfferRow, OfferStatus } from '../domain/types.js';

export class OfferRepository {
  /**
   * Lock the offer row FOR UPDATE so no concurrent transaction can change it
   * simultaneously. Returns null if not found.
   */
  async lockForUpdate(client: PoolClient, offerId: string): Promise<OfferRow | null> {
    const result = await client.query<OfferRow>(
      `SELECT id, trip_id, driver_id, status, expires_at
         FROM trips.offers
        WHERE id = $1
          FOR UPDATE`,
      [offerId],
    );
    return result.rows[0] ?? null;
  }

  async updateStatus(
    client: PoolClient,
    offerId: string,
    status: OfferStatus,
  ): Promise<void> {
    await client.query(
      `UPDATE trips.offers
          SET status     = $1,
              updated_at = NOW()
        WHERE id = $2`,
      [status, offerId],
    );
  }

  /** Read-only lookup (outside a transaction). */
  async findById(offerId: string): Promise<OfferRow | null> {
    const result = await getPool().query<OfferRow>(
      `SELECT id, trip_id, driver_id, status, expires_at
         FROM trips.offers
        WHERE id = $1`,
      [offerId],
    );
    return result.rows[0] ?? null;
  }
}

export const offerRepository = new OfferRepository();
