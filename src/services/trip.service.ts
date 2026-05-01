import { timingSafeEqual } from 'crypto';
import { withTransaction } from '../infrastructure/pg.js';
import { publishEvent } from '../infrastructure/kafka.js';
import { tripRepository } from '../repositories/trip.repository.js';
import { AppError } from '../domain/errors.js';
import { TripStateResult, TripStatus } from '../domain/types.js';
import { config } from '../config.js';

export class TripService {
  async markArrived(tripId: string, driverId: string): Promise<TripStateResult> {
    const result = await withTransaction(async (client) => {
      const trip = await tripRepository.lockForUpdate(client, tripId);
      if (!trip) throw AppError.notFound('Trip');
      if (trip.driver_id !== driverId) throw AppError.forbidden('Not your trip');

      if (trip.status !== 'EN_ROUTE_PICKUP') {
        throw AppError.tripStateInvalid(trip.status, 'EN_ROUTE_PICKUP');
      }

      const now = new Date();
      await tripRepository.updateStatus(client, tripId, 'ARRIVED_PICKUP', {
        arrived_at: now,
      });
      return { tripId, status: 'ARRIVED_PICKUP' as TripStatus, arrivedAt: now.getTime() };
    });

    return result;
  }

  async startTrip(
    tripId: string,
    driverId: string,
    providedPin: string,
  ): Promise<TripStateResult> {
    const result = await withTransaction(async (client) => {
      const trip = await tripRepository.lockForUpdate(client, tripId);
      if (!trip) throw AppError.notFound('Trip');
      if (trip.driver_id !== driverId) throw AppError.forbidden('Not your trip');

      if (trip.status !== 'ARRIVED_PICKUP') {
        throw AppError.tripStateInvalid(trip.status, 'ARRIVED_PICKUP');
      }

      // Constant-time PIN comparison — never log either value
      const expected = trip.pickup_pin;
      let pinMatch = false;
      if (
        typeof providedPin === 'string' &&
        providedPin.length === expected.length
      ) {
        pinMatch = timingSafeEqual(
          Buffer.from(providedPin),
          Buffer.from(expected),
        );
      }

      if (!pinMatch) {
        throw AppError.badRequest('Invalid pickup PIN', 'pickupPin');
      }

      const now = new Date();
      await tripRepository.updateStatus(client, tripId, 'IN_PROGRESS', {
        started_at: now,
      });
      return { tripId, status: 'IN_PROGRESS' as TripStatus, startedAt: now.getTime() };
    });

    return result;
  }

  async completeTrip(tripId: string, driverId: string): Promise<TripStateResult> {
    const result = await withTransaction(async (client) => {
      const trip = await tripRepository.lockForUpdate(client, tripId);
      if (!trip) throw AppError.notFound('Trip');
      if (trip.driver_id !== driverId) throw AppError.forbidden('Not your trip');

      if (trip.status !== 'IN_PROGRESS') {
        throw AppError.tripStateInvalid(trip.status, 'IN_PROGRESS');
      }

      const now = new Date();
      await tripRepository.updateStatus(client, tripId, 'COMPLETED', {
        completed_at: now,
      });

      return {
        tripId,
        status: 'COMPLETED' as TripStatus,
        farePaisa: trip.fare_paisa,
        completedAt: now.getTime(),
      };
    });

    // Publish trip.completed event (non-blocking)
    await publishEvent(config.KAFKA_TOPIC_TRIP_EVENTS, tripId, {
      type: 'trip.completed',
      tripId,
      driverId,
      farePaisa: result.farePaisa,
      completedAt: result.completedAt,
    }).catch((e: unknown) => console.error('[trip.service] kafka publish error', e));

    return result;
  }
}

export const tripService = new TripService();
