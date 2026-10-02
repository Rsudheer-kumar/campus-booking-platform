/**
 * CampusFlow API - Timetable Routes (Phase 3.1)
 * Declares endpoints for timetable ingestion, authenticated viewing, and conflict auditing.
 */

import { Router } from 'express';
import {
  syncTimetable,
  listTimetables,
  getConflictAudit,
} from '../controllers/timetable.controller';
import { authenticate, requireRoles } from '../middleware/auth';
import { validateRequest } from '../middleware/validate';
import {
  validateSyncTimetableBody,
  validateListTimetablesQuery,
  validateConflictAuditQuery,
} from '../validators/timetable.validator';
import { UserRole } from '../models/user.model';

const router = Router();

// 1. Ingest / Synchronize published timetable batch
// Strict authorization: ADMIN only
router.post(
  '/sync',
  authenticate,
  requireRoles(UserRole.ADMIN),
  validateRequest({ body: validateSyncTimetableBody }),
  syncTimetable
);

// 2. Conflict audit endpoint (operational audit for administrators and facility managers)
// Note: declared before collection route '/' or param routes
router.get(
  '/conflicts',
  authenticate,
  requireRoles(UserRole.ADMIN, UserRole.FACILITY_MANAGER),
  validateRequest({ query: validateConflictAuditQuery }),
  getConflictAudit
);

// 3. View published timetable entries
// Accessible to all authenticated users (STUDENT, FACULTY, STAFF, etc.)
router.get(
  '/',
  authenticate,
  validateRequest({ query: validateListTimetablesQuery }),
  listTimetables
);

export default router;
