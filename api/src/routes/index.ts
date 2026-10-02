/**
 * CampusFlow API - Main API Router
 * Aggregates all route modules under the /api prefix.
 * Future domain routes will be registered here as separate routers.
 */

import { Router } from 'express';
import healthRoutes from './health.routes';
import bookingRoutes from './booking.routes';
import authRoutes from './auth.routes';
import timetableRoutes from './timetable.routes';
import resourceRoutes from './resource.routes';

const router = Router();

// Authentication endpoints: /api/auth
router.use('/auth', authRoutes);

// Health & diagnostics endpoint: /api/health
router.use('/health', healthRoutes);

// Facility & resource catalogue endpoints: /api/resources
router.use('/resources', resourceRoutes);

// Booking engine endpoints: /api/bookings
router.use('/bookings', bookingRoutes);

// Timetable integration endpoints: /api/timetables (Phase 3.1)
router.use('/timetables', timetableRoutes);

/**
 * Future API domain routes will be mounted here:
 * router.use('/resources', resourceRoutes);
 * router.use('/resource-types', resourceTypeRoutes);
 * router.use('/bookings', bookingRoutes);
 * router.use('/approvals', approvalRoutes);
 * router.use('/maintenance', maintenanceRoutes);
 * router.use('/analytics', analyticsRoutes);
 */

export default router;
