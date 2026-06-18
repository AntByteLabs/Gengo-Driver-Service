import { driverRepository } from '../repositories/driver.repository.js';
import { kycRepository } from '../repositories/kyc.repository.js';
import { AppError } from '../domain/errors.js';
import type {
  KycDocStatus,
  DriverProfileRow,
  KycDocumentRow,
  VehicleRow,
  PaginatedDrivers,
} from '../domain/types.js';

export interface DriverFull {
  profile: DriverProfileRow;
  vehicle: VehicleRow | null;
  kycDocuments: KycDocumentRow[];
}

export class AdminDriverService {
  async getStats(): Promise<{
    totalTripsToday: number;
    activeTrips: number;
    revenueTodayPaisa: number;
    activeDrivers: number;
    totalRiders: number;
    pendingApprovals: number;
  }> {
    const [driverAgg, tripAgg] = await Promise.all([
      driverRepository.stats(),
      driverRepository.tripStats(),
    ]);
    return {
      ...tripAgg,
      activeDrivers: driverAgg.activeDrivers,
      pendingApprovals: driverAgg.pendingApprovals,
    };
  }

  async listDrivers(params: {
    approvalStatus?: string;
    page: number;
    limit: number;
  }): Promise<PaginatedDrivers> {
    // Use the stats-augmented query so the Trips and Rating columns reflect
    // live counts from trips.trips / trips.ratings instead of the never-
    // updated drivers.profiles.trip_count / rating_avg columns.
    const { items, total } = await driverRepository.listWithStats({
      page: params.page,
      limit: params.limit,
      ...(params.approvalStatus !== undefined ? { approvalStatus: params.approvalStatus } : {}),
    });
    return { items, total, page: params.page, limit: params.limit };
  }

  async getDriverFull(driverId: string): Promise<DriverFull> {
    // `driverId` may be the driver profile id OR the user id — trip rows
    // reference the driver by user id, so "View driver profile" from a trip
    // passes that. Resolve the profile by either, then use its real id for the
    // vehicle / KYC lookups (which are keyed on the profile id).
    let profile = await driverRepository.findByIdWithStats(driverId);
    if (!profile) {
      const byUser = await driverRepository.findByUserId(driverId);
      if (byUser) profile = await driverRepository.findByIdWithStats(byUser.id);
    }
    if (!profile) throw AppError.notFound('Driver');
    const [vehicle, kycDocuments] = await Promise.all([
      kycRepository.findVehicleByDriver(profile.id),
      kycRepository.findByDriver(profile.id),
    ]);
    return { profile, vehicle, kycDocuments };
  }

  /** Resolve a driver profile id from either a profile id or a user id. */
  private async resolveProfileId(idOrUserId: string): Promise<string> {
    const byId = await driverRepository.findById(idOrUserId);
    if (byId) return byId.id;
    const byUser = await driverRepository.findByUserId(idOrUserId);
    if (byUser) return byUser.id;
    throw AppError.notFound('Driver');
  }

  async approveDriver(driverId: string): Promise<void> {
    const id = await this.resolveProfileId(driverId);
    await driverRepository.updateApprovalStatus(id, 'APPROVED', null);
  }

  async suspendDriver(driverId: string, reason: string): Promise<void> {
    const id = await this.resolveProfileId(driverId);
    await driverRepository.updateApprovalStatus(id, 'SUSPENDED', reason || null);
  }

  async unsuspendDriver(driverId: string): Promise<void> {
    const id = await this.resolveProfileId(driverId);
    await driverRepository.updateApprovalStatus(id, 'APPROVED', null);
  }

  async reviewDocument(params: {
    driverId: string;
    docId: string;
    status: KycDocStatus;
    reviewNotes: string | null;
  }): Promise<KycDocumentRow> {
    const doc = await kycRepository.findById(params.docId);
    if (!doc || doc.driver_id !== params.driverId) throw AppError.notFound('Document');

    const updated = await kycRepository.updateStatus({
      docId: params.docId,
      status: params.status,
      reviewNotes: params.reviewNotes,
    });
    if (!updated) throw AppError.notFound('Document');

    // If any doc needs resubmission, reflect on the driver's overall status.
    if (params.status === 'NEEDS_RESUBMISSION') {
      await driverRepository.updateApprovalStatus(params.driverId, 'NEEDS_RESUBMISSION', null);
    }

    return updated;
  }
}

export const adminDriverService = new AdminDriverService();
