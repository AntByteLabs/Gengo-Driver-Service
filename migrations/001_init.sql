-- driver-svc: initial schema migration
-- Run once against the gengo database.

CREATE SCHEMA IF NOT EXISTS drivers;

CREATE TABLE IF NOT EXISTS drivers.profiles (
  id            TEXT        PRIMARY KEY,
  user_id       TEXT        NOT NULL,
  vehicle_type  TEXT        NOT NULL,
  vehicle_plate TEXT,
  vehicle_model TEXT,
  license_no    TEXT,
  status        TEXT        NOT NULL DEFAULT 'offline',
  rating_avg    NUMERIC(3,2) DEFAULT 5.0,
  trip_count    INTEGER     DEFAULT 0,
  is_active     BOOLEAN     NOT NULL DEFAULT TRUE,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- trips schema is owned by trip-svc; driver-svc only reads from it.
-- Referenced tables are assumed to exist:
--   trips.trips   (id, driver_id, rider_id, status, fare_paisa, pickup_pin,
--                  accepted_at, arrived_at, started_at, completed_at, ...)
--   trips.offers  (id, trip_id, driver_id, status, expires_at, ...)

-- Index for admin list queries
CREATE INDEX IF NOT EXISTS idx_drivers_profiles_status
  ON drivers.profiles (status);

CREATE INDEX IF NOT EXISTS idx_drivers_profiles_is_active
  ON drivers.profiles (is_active);
