import { withTransaction } from '../infrastructure/pg.js';
import { getRedis } from '../infrastructure/redis.js';
import { publishEvent } from '../infrastructure/kafka.js';
import { offerRepository } from '../repositories/offer.repository.js';
import { tripRepository } from '../repositories/trip.repository.js';
import { driverRepository } from '../repositories/driver.repository.js';
import { AppError } from '../domain/errors.js';
import { ActiveDriverTrip } from '../domain/types.js';
import { config } from '../config.js';

const IDEMPOTENCY_TTL_SECONDS = 86_400; // 24 hours

export class OfferService {
  /**
   * Atomically accept an offer.
   * Idempotency: if the same (offerId, driverId) was accepted within 24h,
   * return the cached response rather than erroring.
   */
  async acceptOffer(
    offerId: string,
    driverId: string,
    idempotencyKey?: string,
  ): Promise<ActiveDriverTrip> {
    const redis = getRedis();

    // ── Idempotency check ─────────────────────────────────────────────────
    const idemCacheKey = `idem:accept:${offerId}:${driverId}`;
    if (idempotencyKey) {
      const cached = await redis.get(idemCacheKey);
      if (cached !== null) {
        return JSON.parse(cached) as ActiveDriverTrip;
      }
    }

    // ── Atomic DB transaction ─────────────────────────────────────────────
    const result = await withTransaction(async (client) => {
      const offer = await offerRepository.lockForUpdate(client, offerId);

      if (!offer) {
        throw AppError.notFound('Offer');
      }

      if (offer.driver_id !== driverId) {
        throw AppError.forbidden('This offer was not sent to you');
      }

      // If already accepted by this driver → idempotent success (handled above
      // via Redis; DB fallback handled here for races during first request)
      if (offer.status === 'accepted') {
        throw AppError.offerTaken(); // race lost — caller may retry after checking cache
      }

      if (offer.status === 'declined' || offer.status === 'expired') {
        throw AppError.offerExpired();
      }

      if (offer.status !== 'pending') {
        throw AppError.offerTaken();
      }

      if (offer.expires_at <= new Date()) {
        throw AppError.offerExpired();
      }

      // 1. Mark offer accepted
      await offerRepository.updateStatus(client, offerId, 'accepted');

      // 2. Advance trip MATCHED → ACCEPTED
      const trip = await tripRepository.lockForUpdate(client, offer.trip_id);
      if (!trip) throw AppError.notFound('Trip');
      if (trip.status !== 'MATCHED') {
        throw AppError.offerTaken(); // another driver got there first
      }

      const now = new Date();
      await tripRepository.updateStatus(client, trip.id, 'ACCEPTED', {
        driver_id: driverId,
        accepted_at: now,
      });

      return { trip, now };
    });

    const { trip, now } = result;

    // 3. Remove driver from the GEO available pool (fire-and-forget on Redis error)
    await redis
      .zrem(config.REDIS_GEO_KEY, driverId)
      .catch((e: unknown) => console.error('[offer.service] zrem error', e));

    // 4. Fetch rider info for response (best-effort)
    const rider = await tripRepository.getRiderInfo(trip.rider_id).catch(() => null);

    const response: ActiveDriverTrip = {
      tripId: trip.id,
      riderId: trip.rider_id,
      riderName: rider?.full_name ?? 'Rider',
      riderPhone: rider?.phone ?? '',
      pickup: {
        label: trip.pickup_label,
        location: { lat: trip.pickup_lat, lng: trip.pickup_lng },
      },
      dropoff: {
        label: trip.dropoff_label,
        location: { lat: trip.dropoff_lat, lng: trip.dropoff_lng },
      },
      distanceKm: trip.distance_km,
      // Convert paisa → NPR for the response field named estimatedFareNPR
      estimatedFareNPR: Math.round(trip.fare_paisa / 100),
      paymentMethod: trip.payment_method,
      status: 'ACCEPTED',
      // NOTE: pickupPin must NEVER appear in logs; only returned in this response body
      pickupPin: trip.pickup_pin,
      acceptedAt: now.getTime(),
    };

    // 5. Cache idempotency response
    if (idempotencyKey) {
      await redis
        .set(idemCacheKey, JSON.stringify(response), 'EX', IDEMPOTENCY_TTL_SECONDS)
        .catch((e: unknown) => console.error('[offer.service] idem cache error', e));
    }

    return response;
  }

  async declineOffer(offerId: string, driverId: string): Promise<void> {
    const offer = await offerRepository.findById(offerId);

    if (!offer) throw AppError.notFound('Offer');
    if (offer.driver_id !== driverId) throw AppError.forbidden('Not your offer');

    // Idempotent: already declined is fine
    if (offer.status === 'declined') return;

    if (offer.status !== 'pending') {
      throw AppError.offerTaken();
    }

    await withTransaction(async (client) => {
      const locked = await offerRepository.lockForUpdate(client, offerId);
      if (!locked || locked.status !== 'pending') return; // race — already handled
      await offerRepository.updateStatus(client, offerId, 'declined');
    });

    // Publish re-dispatch event
    await publishEvent(config.KAFKA_TOPIC_TRIP_EVENTS, offer.trip_id, {
      type: 'offer.declined',
      offerId,
      tripId: offer.trip_id,
      driverId,
    }).catch((e: unknown) => console.error('[offer.service] kafka publish error', e));

    // Update driver status back to available
    await driverRepository
      .updateStatus(driverId, 'online')
      .catch((e: unknown) => console.error('[offer.service] status update error', e));
  }
}

export const offerService = new OfferService();
