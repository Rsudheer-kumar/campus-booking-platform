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
  approveBooking,
  rejectBooking,
  generateCheckInToken,
  checkInBooking,
  manualCheckInBooking,
  checkoutBooking,
  pardonNoShowBooking,
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
  validateApproveBookingBody,
  validateRejectBookingBody,
  validateCheckInBody,
  validateManualCheckInBody,
  validatePardonNoShowBody,
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

// Phase 3.3 Check-in token generation
router.post(
  '/:id/check-in-token',
  authenticate,
  validateRequest({ params: validateMongoId('id') }),
  generateCheckInToken
);

// Phase 3.3 QR-based check-in
router.post(
  '/:id/check-in',
  authenticate,
  validateRequest({
    params: validateMongoId('id'),
    body: validateCheckInBody,
  }),
  checkInBooking
);

// Phase 3.3 Admin manual check-in
router.post(
  '/:id/manual-check-in',
  authenticate,
  requireRoles(UserRole.ADMIN),
  validateRequest({
    params: validateMongoId('id'),
    body: validateManualCheckInBody,
  }),
  manualCheckInBooking
);

// Phase 3.3 Early checkout / completion
router.post(
  '/:id/checkout',
  authenticate,
  validateRequest({ params: validateMongoId('id') }),
  checkoutBooking
);

// Phase 3.3 Administrative pardon for NO_SHOW
router.post(
  '/:id/pardon-no-show',
  authenticate,
  requireRoles(UserRole.ADMIN),
  validateRequest({
    params: validateMongoId('id'),
    body: validatePardonNoShowBody,
  }),
  pardonNoShowBooking
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
  '/:id/approve',
  authenticate,
  requireRoles(UserRole.DEPARTMENT_HEAD, UserRole.FACILITY_MANAGER, UserRole.ADMIN),
  validateRequest({
    params: validateMongoId('id'),
    body: validateApproveBookingBody,
  }),
  approveBooking
);

router.post(
  '/:id/reject',
  authenticate,
  requireRoles(UserRole.DEPARTMENT_HEAD, UserRole.FACILITY_MANAGER, UserRole.ADMIN),
  validateRequest({
    params: validateMongoId('id'),
    body: validateRejectBookingBody,
  }),
  rejectBooking
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
