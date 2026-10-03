/**
 * CampusFlow API - Approval Policy Routes
 * Route declarations for Approval Policy administration.
 */

import { Router } from 'express';
import {
  createApprovalPolicy,
  listApprovalPolicies,
  getApprovalPolicyById,
  updateApprovalPolicy,
  toggleApprovalPolicyStatus,
  archiveApprovalPolicy,
} from '../controllers/approvalPolicy.controller';
import { authenticate, requireRoles } from '../middleware/auth';
import { validateRequest } from '../middleware/validate';
import { validateMongoId } from '../validators';
import {
  validateCreateApprovalPolicyBody,
  validateUpdateApprovalPolicyBody,
  validateTogglePolicyStatusBody,
  validateListApprovalPoliciesQuery,
} from '../validators/approvalPolicy.validator';
import { UserRole } from '../models/user.model';

const router = Router();

// Collection routes
router.post(
  '/',
  authenticate,
  requireRoles(UserRole.ADMIN, UserRole.FACILITY_MANAGER),
  validateRequest({ body: validateCreateApprovalPolicyBody }),
  createApprovalPolicy
);

router.get(
  '/',
  authenticate,
  requireRoles(UserRole.ADMIN, UserRole.FACILITY_MANAGER, UserRole.DEPARTMENT_HEAD),
  validateRequest({ query: validateListApprovalPoliciesQuery }),
  listApprovalPolicies
);

// Individual policy routes
router.get(
  '/:id',
  authenticate,
  requireRoles(UserRole.ADMIN, UserRole.FACILITY_MANAGER, UserRole.DEPARTMENT_HEAD),
  validateRequest({ params: validateMongoId('id') }),
  getApprovalPolicyById
);

router.put(
  '/:id',
  authenticate,
  requireRoles(UserRole.ADMIN, UserRole.FACILITY_MANAGER),
  validateRequest({
    params: validateMongoId('id'),
    body: validateUpdateApprovalPolicyBody,
  }),
  updateApprovalPolicy
);

router.patch(
  '/:id/status',
  authenticate,
  requireRoles(UserRole.ADMIN, UserRole.FACILITY_MANAGER),
  validateRequest({
    params: validateMongoId('id'),
    body: validateTogglePolicyStatusBody,
  }),
  toggleApprovalPolicyStatus
);

router.delete(
  '/:id',
  authenticate,
  requireRoles(UserRole.ADMIN),
  validateRequest({ params: validateMongoId('id') }),
  archiveApprovalPolicy
);

export default router;
