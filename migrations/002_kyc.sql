-- driver-svc: KYC documents, vehicle table, and approval status.
-- Adds the approval gate that separates operational status (online/offline)
-- from admin approval state (PENDING/APPROVED/SUSPENDED/NEEDS_RESUBMISSION).

ALTER TABLE drivers.profiles
  ADD COLUMN IF NOT EXISTS approval_status TEXT NOT NULL DEFAULT 'PENDING',
  ADD COLUMN IF NOT EXISTS suspension_reason TEXT,
  ADD COLUMN IF NOT EXISTS name TEXT,
  ADD COLUMN IF NOT EXISTS email TEXT;

-- Separate vehicle table (richer than the inline columns on profiles).
-- UNIQUE on driver_id so upserts via ON CONFLICT work correctly.
CREATE TABLE IF NOT EXISTS drivers.vehicles (
  id           TEXT        PRIMARY KEY,
  driver_id    TEXT        NOT NULL UNIQUE REFERENCES drivers.profiles(id) ON DELETE CASCADE,
  vehicle_type TEXT        NOT NULL,
  make         TEXT,
  model        TEXT,
  year         INTEGER,
  plate        TEXT,
  color        TEXT,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- KYC documents — one row per doc type per driver.
-- doc_type: 'LICENSE' | 'BLUEBOOK'
-- status:   'PENDING' | 'APPROVED' | 'REJECTED' | 'NEEDS_RESUBMISSION'
CREATE TABLE IF NOT EXISTS drivers.kyc_documents (
  id           TEXT        PRIMARY KEY,
  driver_id    TEXT        NOT NULL REFERENCES drivers.profiles(id) ON DELETE CASCADE,
  doc_type     TEXT        NOT NULL,
  file_url     TEXT        NOT NULL,
  status       TEXT        NOT NULL DEFAULT 'PENDING',
  review_notes TEXT,
  uploaded_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  reviewed_at  TIMESTAMPTZ,
  UNIQUE (driver_id, doc_type)
);

CREATE INDEX IF NOT EXISTS idx_vehicles_driver_id
  ON drivers.vehicles (driver_id);

CREATE INDEX IF NOT EXISTS idx_kyc_documents_driver_id
  ON drivers.kyc_documents (driver_id);

CREATE INDEX IF NOT EXISTS idx_kyc_documents_status
  ON drivers.kyc_documents (status);

CREATE INDEX IF NOT EXISTS idx_drivers_profiles_approval_status
  ON drivers.profiles (approval_status);
