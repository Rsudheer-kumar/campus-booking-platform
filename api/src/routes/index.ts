/**
 * CampusFlow API - Main API Router
 * Aggregates all route modules under the /api prefix.
 * Future domain routes will be registered here as separate routers.
 */

import { Router } from 'express';
import healthRoutes from './health.routes';
import bookingRoutes from './booking.routes';

const router = Router();

// Health & diagnostics endpoint: /api/health
router.use('/health', healthRoutes);

// Booking engine endpoints: /api/bookings
router.use('/bookings', bookingRoutes);

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
