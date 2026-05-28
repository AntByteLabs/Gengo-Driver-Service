import { getPool } from '../infrastructure/pg.js';
import type { KycDocStatus, KycDocType, KycDocumentRow, VehicleRow } from '../domain/types.js';

export class KycRepository {
  // ── KYC Documents ──────────────────────────────────────────────────────────

  async upsertDocument(params: {
    id: string;
    driverId: string;
    docType: KycDocType;
    fileUrl: string;
  }): Promise<KycDocumentRow> {
    const result = await getPool().query<KycDocumentRow>(
      `INSERT INTO drivers.kyc_documents (id, driver_id, doc_type, file_url, status, uploaded_at)
       VALUES ($1, $2, $3, $4, 'PENDING', NOW())
       ON CONFLICT (driver_id, doc_type)
         DO UPDATE SET file_url    = EXCLUDED.file_url,
                       status      = 'PENDING',
                       review_notes = NULL,
                       reviewed_at  = NULL,
                       uploaded_at  = NOW()
       RETURNING *`,
      [params.id, params.driverId, params.docType, params.fileUrl],
    );
    return result.rows[0]!;
  }

  async findByDriver(driverId: string): Promise<KycDocumentRow[]> {
    const result = await getPool().query<KycDocumentRow>(
      `SELECT * FROM drivers.kyc_documents WHERE driver_id = $1 ORDER BY doc_type`,
      [driverId],
    );
    return result.rows;
  }

  async findById(docId: string): Promise<KycDocumentRow | null> {
    const result = await getPool().query<KycDocumentRow>(
      `SELECT * FROM drivers.kyc_documents WHERE id = $1`,
      [docId],
    );
    return result.rows[0] ?? null;
  }

  async updateStatus(params: {
    docId: string;
    status: KycDocStatus;
    reviewNotes: string | null;
  }): Promise<KycDocumentRow | null> {
    const result = await getPool().query<KycDocumentRow>(
      `UPDATE drivers.kyc_documents
          SET status       = $1,
              review_notes = $2,
              reviewed_at  = NOW()
        WHERE id = $3
        RETURNING *`,
      [params.status, params.reviewNotes, params.docId],
    );
    return result.rows[0] ?? null;
  }

  // ── Vehicles ───────────────────────────────────────────────────────────────

  async upsertVehicle(params: {
    id: string;
    driverId: string;
    vehicleType: string;
    make: string | null;
    model: string | null;
    year: number | null;
    plate: string | null;
    color: string | null;
  }): Promise<VehicleRow> {
    const result = await getPool().query<VehicleRow>(
      `INSERT INTO drivers.vehicles
         (id, driver_id, vehicle_type, make, model, year, plate, color)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
       ON CONFLICT (driver_id)
         DO UPDATE SET vehicle_type = EXCLUDED.vehicle_type,
                       make         = EXCLUDED.make,
                       model        = EXCLUDED.model,
                       year         = EXCLUDED.year,
                       plate        = EXCLUDED.plate,
                       color        = EXCLUDED.color
       RETURNING *`,
      [
        params.id,
        params.driverId,
        params.vehicleType,
        params.make,
        params.model,
        params.year,
        params.plate,
        params.color,
      ],
    );
    return result.rows[0]!;
  }

  async findVehicleByDriver(driverId: string): Promise<VehicleRow | null> {
    const result = await getPool().query<VehicleRow>(
      `SELECT * FROM drivers.vehicles WHERE driver_id = $1 LIMIT 1`,
      [driverId],
    );
    return result.rows[0] ?? null;
  }
}

export const kycRepository = new KycRepository();
