/**
 * CampusFlow API - Booking Engine Routes
 * Declares endpoints for reservation creation, availability checking, slot calculation,
 * status transitions, cancellation, and retrieval.
 *
 * PHASE 2.6D: Integrated with authentication and role-based authorization.
 */

import { Router } from 'express';
import {
  createBooking,
  getBookingById,
  listBookings,
  cancelBooking,
  transitionBookingStatus,
  checkAvailability,
  calculateSlots,
} from '../controllers/booking.controller';
import { authenticate, requireRoles } from '../middleware/auth';
import { validateRequest } from '../middleware/validate';
import { validateMongoId } from '../validators';
import {
  validateCreateBookingBody,
  validateCancelBookingBody,
  validateTransitionBookingStatusBody,
  validateCheckAvailabilityQuery,
  validateCalculateSlotsQuery,
} from '../validators/booking.validator';
import { UserRole } from '../models/user.model';

const router = Router();

// Availability and slot query endpoints (mounted before /:id)
// These remain PUBLIC per locked architecture (P04: availability remains public)
router.get(
  '/availability',
  validateRequest({ query: validateCheckAvailabilityQuery }),
  checkAvailability
);

router.get(
  '/slots',
  validateRequest({ query: validateCalculateSlotsQuery }),
  calculateSlots
);

// Collection operations
router.post(
  '/',
  authenticate,
  validateRequest({ body: validateCreateBookingBody }),
  createBooking
);

router.get(
  '/',
  authenticate,
  listBookings
);

// Individual booking operations
router.get(
  '/:id',
  authenticate,
  validateRequest({ params: validateMongoId('id') }),
  getBookingById
);

router.post(
  '/:id/cancel',
  authenticate,
  validateRequest({
    params: validateMongoId('id'),
    body: validateCancelBookingBody,
  }),
  cancelBooking
);

router.post(
  '/:id/transition',
  authenticate,
  requireRoles(UserRole.FACILITY_MANAGER, UserRole.CUSTODIAN, UserRole.ADMIN),
  validateRequest({
    params: validateMongoId('id'),
    body: validateTransitionBookingStatusBody,
  }),
  transitionBookingStatus
);

export default router;
