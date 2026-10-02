/**
 * CampusFlow API - Booking & Reservation Controller
 * Handles HTTP transport, input mapping, error propagation, and response serialization
 * for all booking engine capabilities.
 *
 * PHASE 2.6D: Integrated with authentication and authorization enforcement.
 * - Uses req.user for authenticated identity (never trusts request body for identity)
 * - Enforces ownership checks for GET/cancel operations
 * - Handles DEPARTMENT_HEAD on-behalf booking with same-department verification
 * - Restricts list access based on role
 */

import type { Request, Response, NextFunction } from 'express';
import { ReservationService } from '../services/reservation.service';
import { AvailabilityService } from '../services/availability.service';
import { sendSuccess } from '../utils/response';
import { ForbiddenError, NotFoundError } from '../utils/errors';
import { User, UserRole } from '../models';
import type { ReservationStatusType } from '../models';
import { Types } from 'mongoose';

/**
 * Safely extracts the user ID as a string regardless of whether the user
 * field is an ObjectId, a populated document, or a plain object.
 */
function extractUserId(user: unknown): string {
  if (!user) return '';
  if (user instanceof Types.ObjectId) {
    return user.toString();
  }
  if (typeof user === 'object' && user !== null) {
    if ('_id' in user && (user as any)._id) {
      return (user as any)._id.toString();
    }
    if ('id' in user && (user as any).id) {
      return String((user as any).id);
    }
  }
  return String(user);
}

export async function createBooking(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    // PHASE 2.6D: req.user is guaranteed to be set by authenticate middleware
    if (!req.user) {
      return next(new ForbiddenError('Unauthorized'));
    }

    // Determine the booking user (self-booking or on-behalf)
    let bookingUserId = req.user.id;

    // If body contains userId, validate DEPARTMENT_HEAD on-behalf booking
    if (req.body.userId && req.body.userId !== req.user.id) {
      // Only DEPARTMENT_HEAD can book on behalf of another user
      if (!req.user.roles.includes(UserRole.DEPARTMENT_HEAD)) {
        return next(new ForbiddenError('Only DEPARTMENT_HEAD can book on behalf of another user'));
      }

      // DEPARTMENT_HEAD can only target users in the same department
      const targetUser = await User.findById(req.body.userId).select('department _id').lean();
      if (!targetUser) {
        return next(new NotFoundError('Target user not found'));
      }

      // Verify same-department restriction (never trust client-supplied department)
      if (targetUser.department !== req.user.department) {
        return next(
          new ForbiddenError(
            'DEPARTMENT_HEAD can only book on behalf of users in the same department'
          )
        );
      }

      bookingUserId = req.body.userId;
    }

    const reservation = await ReservationService.createReservation({
      resourceId: req.body.resourceId,
      userId: bookingUserId,
      startAt: req.body.startAt,
      endAt: req.body.endAt,
      timezone: req.body.timezone,
      title: req.body.title,
      description: req.body.description,
      metadata: req.body.metadata,
    });

    sendSuccess(res, reservation, 201);
  } catch (error) {
    next(error);
  }
}

export async function getBookingById(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    if (!req.user) {
      return next(new ForbiddenError('Unauthorized'));
    }

    const id = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
    const reservation = await ReservationService.getReservationById(id);

    // PHASE 2.6D: Ownership check for non-privileged users
    const isPrivileged =
      req.user.roles.includes(UserRole.ADMIN) ||
      req.user.roles.includes(UserRole.FACILITY_MANAGER);

    if (!isPrivileged) {
      // Normal user can only view their own bookings
      const bookingUserId = extractUserId(reservation.user);

      if (bookingUserId !== req.user.id) {
        return next(new ForbiddenError('Cannot access another user\'s booking'));
      }
    }

    sendSuccess(res, reservation, 200);
  } catch (error) {
    next(error);
  }
}

export async function listBookings(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    if (!req.user) {
      return next(new ForbiddenError('Unauthorized'));
    }

    const { resourceId, userId, status, startAt, endAt, page, limit } = req.query;

    // PHASE 2.6D: Authorization-aware filtering
    // Determine which userId to filter on based on role and request
    let filterUserId: string | undefined;

    const isPrivileged =
      req.user.roles.includes(UserRole.ADMIN) ||
      req.user.roles.includes(UserRole.FACILITY_MANAGER);

    if (isPrivileged) {
      // Privileged users can list any userId (or all if not specified)
      filterUserId = userId as string | undefined;
    } else {
      // Normal users can only list their own bookings, ignore query.userId
      filterUserId = req.user.id;
    }

    const result = await ReservationService.listReservations({
      resourceId: resourceId as string,
      userId: filterUserId,
      status: status as ReservationStatusType | ReservationStatusType[],
      startAt: startAt as string,
      endAt: endAt as string,
      page: page ? Number(page) : undefined,
      limit: limit ? Number(limit) : undefined,
    });

    sendSuccess(res, result, 200);
  } catch (error) {
    next(error);
  }
}

export async function cancelBooking(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    if (!req.user) {
      return next(new ForbiddenError('Unauthorized'));
    }

    const id = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
    const reservation = await ReservationService.getReservationById(id);

    // PHASE 2.6D: Ownership & role authorization check
    const isPrivileged =
      req.user.roles.includes(UserRole.ADMIN) ||
      req.user.roles.includes(UserRole.FACILITY_MANAGER) ||
      req.user.roles.includes(UserRole.CUSTODIAN);

    if (!isPrivileged) {
      // Normal users can only cancel their own bookings
      const bookingUserId = extractUserId(reservation.user);

      if (bookingUserId !== req.user.id) {
        return next(new ForbiddenError('Can only cancel your own booking'));
      }
    }

    // Use req.user.id as the cancellation actor (never trust body.userId for identity)
    const updated = await ReservationService.cancelReservation(
      id,
      req.user.id,
      req.body.reason
    );

    sendSuccess(res, updated, 200);
  } catch (error) {
    next(error);
  }
}

export async function transitionBookingStatus(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    if (!req.user) {
      return next(new ForbiddenError('Unauthorized'));
    }

    const id = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;

    // PHASE 2.6D: Role-based authorization for specific transitions
    // The route already requires FACILITY_MANAGER/CUSTODIAN/ADMIN via requireRoles middleware
    // Use req.user.id as the actor (never trust body.userId for identity)
    const reservation = await ReservationService.transitionStatus({
      reservationId: id,
      targetStatus: req.body.status,
      actorId: req.user.id,
      reason: req.body.reason,
    });

    sendSuccess(res, reservation, 200);
  } catch (error) {
    next(error);
  }
}

export async function checkAvailability(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const { resourceId, startAt, endAt, excludeReservationId } = req.query;
    const result = await AvailabilityService.checkAvailability({
      resourceId: resourceId as string,
      startAt: new Date(startAt as string),
      endAt: new Date(endAt as string),
      excludeReservationId: excludeReservationId as string,
    });
    sendSuccess(res, result, 200);
  } catch (error) {
    next(error);
  }
}

export async function calculateSlots(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const { resourceId, date, slotDurationMinutes } = req.query;
    const slots = await AvailabilityService.calculateSlots({
      resourceId: resourceId as string,
      date: date as string,
      slotDurationMinutes: slotDurationMinutes ? Number(slotDurationMinutes) : undefined,
    });
    sendSuccess(res, { slots }, 200);
  } catch (error) {
    next(error);
  }
}
