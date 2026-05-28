import path from 'node:path';
import { ulid } from 'ulid';
import { driverRepository } from '../repositories/driver.repository.js';
import { kycRepository } from '../repositories/kyc.repository.js';
import { AppError } from '../domain/errors.js';
import { config } from '../config.js';
import type { KycDocType, DriverStatusSummary } from '../domain/types.js';

export class RegistrationService {
  async register(params: {
    userId: string;
    name: string | null;
    email: string | null;
    vehicleType: string;
    make: string | null;
    model: string | null;
    year: number | null;
    plate: string | null;
    color: string | null;
  }): Promise<{ driverId: string }> {
    // Idempotent — if a profile already exists for this user, return it.
    const existing = await driverRepository.findByUserId(params.userId);
    if (existing) return { driverId: existing.id };

    const driverId = ulid();
    await driverRepository.create({
      id: driverId,
      userId: params.userId,
      name: params.name,
      email: params.email,
      vehicleType: params.vehicleType,
      vehiclePlate: params.plate,
      vehicleModel: params.model
        ? `${params.make ?? ''} ${params.model}`.trim()
        : null,
    });

    await kycRepository.upsertVehicle({
      id: ulid(),
      driverId,
      vehicleType: params.vehicleType,
      make: params.make,
      model: params.model,
      year: params.year,
      plate: params.plate,
      color: params.color,
    });

    return { driverId };
  }

  async uploadDocument(params: {
    driverId: string;
    docType: KycDocType;
    filePath: string;
    originalName: string;
  }): Promise<{ docId: string; fileUrl: string }> {
    const driver = await driverRepository.findById(params.driverId);
    if (!driver) throw AppError.notFound('Driver');

    // Build the public URL for this file (served via static middleware).
    const filename = path.basename(params.filePath);
    const fileUrl = `${config.BASE_URL}/v1/driver/uploads/${filename}`;

    const docId = ulid();
    await kycRepository.upsertDocument({
      id: docId,
      driverId: params.driverId,
      docType: params.docType,
      fileUrl,
    });

    return { docId, fileUrl };
  }

  async getStatusByUserId(userId: string): Promise<DriverStatusSummary> {
    const driver = await driverRepository.findByUserId(userId);
    if (!driver) throw AppError.notFound('Driver profile not found — register first');
    return this.getStatus(driver.id);
  }

  async getStatus(driverId: string): Promise<DriverStatusSummary> {
    const driver = await driverRepository.findById(driverId);
    if (!driver) throw AppError.notFound('Driver');

    const docs = await kycRepository.findByDriver(driverId);

    return {
      driverId,
      approvalStatus: driver.approval_status,
      suspensionReason: driver.suspension_reason,
      documents: docs.map((d) => ({
        docType: d.doc_type,
        status: d.status,
        reviewNotes: d.review_notes,
        uploadedAt: d.uploaded_at,
      })),
    };
  }

  async uploadDocumentByUserId(params: {
    userId: string;
    docType: KycDocType;
    filePath: string;
    originalName: string;
  }): Promise<{ docId: string; fileUrl: string }> {
    const driver = await driverRepository.findByUserId(params.userId);
    if (!driver) throw AppError.notFound('Driver profile not found — register first');
    return this.uploadDocument({ driverId: driver.id, ...params });
  }
}

export const registrationService = new RegistrationService();
