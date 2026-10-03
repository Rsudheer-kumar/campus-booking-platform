/**
 * CampusFlow API - Approvals Queue Routes
 * Route declarations for pending approvals queue.
 */

import { Router } from 'express';
import { getPendingApprovals } from '../controllers/approvalQueue.controller';
import { authenticate, requireRoles } from '../middleware/auth';
import { validateRequest } from '../middleware/validate';
import { validatePendingApprovalsQuery } from '../validators/booking.validator';
import { UserRole } from '../models/user.model';

const router = Router();

router.get(
  '/pending',
  authenticate,
  requireRoles(UserRole.DEPARTMENT_HEAD, UserRole.FACILITY_MANAGER, UserRole.ADMIN),
  validateRequest({ query: validatePendingApprovalsQuery }),
  getPendingApprovals
);

export default router;
