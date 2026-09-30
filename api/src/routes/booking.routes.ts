/**
 * CampusFlow API - Booking Engine Routes
 * Declares endpoints for reservation creation, availability checking, slot calculation,
 * status transitions, cancellation, and retrieval.
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
import { validateRequest } from '../middleware/validate';
import { validateMongoId } from '../validators';
import {
  validateCreateBookingBody,
  validateCancelBookingBody,
  validateTransitionBookingStatusBody,
  validateCheckAvailabilityQuery,
  validateCalculateSlotsQuery,
} from '../validators/booking.validator';

const router = Router();

// Availability and slot query endpoints (mounted before /:id)
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
  validateRequest({ body: validateCreateBookingBody }),
  createBooking
);

router.get('/', listBookings);

// Individual booking operations
router.get(
  '/:id',
  validateRequest({ params: validateMongoId('id') }),
  getBookingById
);

router.post(
  '/:id/cancel',
  validateRequest({
    params: validateMongoId('id'),
    body: validateCancelBookingBody,
  }),
  cancelBooking
);

router.post(
  '/:id/transition',
  validateRequest({
    params: validateMongoId('id'),
    body: validateTransitionBookingStatusBody,
  }),
  transitionBookingStatus
);

export default router;
