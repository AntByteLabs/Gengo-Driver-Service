// ─── Trip & Offer state enums ─────────────────────────────────────────────────

export type OfferStatus = 'pending' | 'accepted' | 'declined' | 'expired';

export type TripStatus =
  | 'MATCHED'
  | 'ACCEPTED'
  | 'EN_ROUTE_PICKUP'
  | 'ARRIVED_PICKUP'
  | 'IN_PROGRESS'
  | 'COMPLETED'
  | 'CANCELLED';

export type DriverStatus = 'online' | 'offline' | 'on_trip';

// ─── KYC / Approval enums ────────────────────────────────────────────────────

export type ApprovalStatus = 'PENDING' | 'APPROVED' | 'SUSPENDED' | 'NEEDS_RESUBMISSION';
export type KycDocType = 'LICENSE' | 'BLUEBOOK';
export type KycDocStatus = 'PENDING' | 'APPROVED' | 'REJECTED' | 'NEEDS_RESUBMISSION';

// ─── DB row shapes ─────────────────────────────────────────────────────────────

export interface OfferRow {
  id: string;
  trip_id: string;
  driver_id: string;
  status: OfferStatus;
  expires_at: Date;
}

export interface TripRow {
  id: string;
  rider_id: string;
  driver_id: string | null;
  status: TripStatus;
  pickup_label: string;
  pickup_lat: number;
  pickup_lng: number;
  dropoff_label: string;
  dropoff_lat: number;
  dropoff_lng: number;
  distance_km: number;
  fare_paisa: number;
  payment_method: string;
  pickup_pin: string;
  accepted_at: Date | null;
  arrived_at: Date | null;
  started_at: Date | null;
  completed_at: Date | null;
  created_at: Date;
  updated_at: Date;
}

export interface RiderRow {
  id: string;
  full_name: string;
  phone: string;
}

export interface DriverProfileRow {
  id: string;
  user_id: string;
  /** Populated only by the *WithStats queries (LEFT JOIN auth.users on
   *  user_id). undefined on the legacy column-only paths. */
  phone?: string | null;
  name: string | null;
  email: string | null;
  vehicle_type: string;
  vehicle_plate: string | null;
  vehicle_model: string | null;
  license_no: string | null;
  status: DriverStatus;
  approval_status: ApprovalStatus;
  suspension_reason: string | null;
  rating_avg: string; // pg returns NUMERIC as string
  trip_count: number;
  is_active: boolean;
  created_at: Date;
  updated_at: Date;
}

export interface KycDocumentRow {
  id: string;
  driver_id: string;
  doc_type: KycDocType;
  file_url: string;
  status: KycDocStatus;
  review_notes: string | null;
  uploaded_at: Date;
  reviewed_at: Date | null;
}

export interface VehicleRow {
  id: string;
  driver_id: string;
  vehicle_type: string;
  make: string | null;
  model: string | null;
  year: number | null;
  plate: string | null;
  color: string | null;
  created_at: Date;
}

// ─── Service response types ────────────────────────────────────────────────────

export interface ActiveDriverTrip {
  tripId: string;
  riderId: string;
  riderName: string;
  riderPhone: string;
  pickup: {
    label: string;
    location: { lat: number; lng: number };
  };
  dropoff: {
    label: string;
    location: { lat: number; lng: number };
  };
  distanceKm: number;
  estimatedFareNPR: number;
  paymentMethod: string;
  status: TripStatus;
  pickupPin: string;
  acceptedAt: number; // Unix ms
}

export interface TripStateResult {
  tripId: string;
  status: TripStatus;
  arrivedAt?: number;
  startedAt?: number;
  farePaisa?: number;
  completedAt?: number;
}

export interface EarningsPeriod {
  date: string;
  earningsPaisa: number;
  tripCount: number;
}

export interface EarningsSummary {
  totalPaisa: number;
  tripCount: number;
  periods: EarningsPeriod[];
}

export interface PaginatedDrivers {
  items: DriverProfileRow[];
  total: number;
  page: number;
  limit: number;
}

export interface DriverStatusSummary {
  driverId: string;
  approvalStatus: ApprovalStatus;
  suspensionReason: string | null;
  documents: {
    docType: KycDocType;
    status: KycDocStatus;
    reviewNotes: string | null;
    uploadedAt: Date;
  }[];
}

// ─── JWT payload ──────────────────────────────────────────────────────────────

export interface JwtPayload {
  sub: string; // user_id
  driverId: string;
  role: 'driver' | 'rider' | 'admin';
  iat?: number;
  exp?: number;
}
