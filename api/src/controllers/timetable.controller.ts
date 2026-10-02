/**
 * CampusFlow API - Timetable Controller (Phase 3.1)
 * Handles HTTP transport, authentication verification, input mapping,
 * and response formatting for timetable operations.
 */

import type { Request, Response, NextFunction } from 'express';
import { TimetableService } from '../services/timetable.service';
import { sendSuccess } from '../utils/response';
import { ForbiddenError } from '../utils/errors';

export async function syncTimetable(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    if (!req.user) {
      return next(new ForbiddenError('Unauthorized'));
    }

    // Identity is strictly pinned to req.user.id (server-side authenticated identity)
    const result = await TimetableService.syncTimetable(req.body, req.user.id);
    sendSuccess(res, result, 200);
  } catch (error) {
    next(error);
  }
}

export async function listTimetables(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    if (!req.user) {
      return next(new ForbiddenError('Unauthorized'));
    }

    const entries = await TimetableService.listTimetableEntries(req.query);
    sendSuccess(res, { entries, total: entries.length }, 200);
  } catch (error) {
    next(error);
  }
}

export async function getConflictAudit(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    if (!req.user) {
      return next(new ForbiddenError('Unauthorized'));
    }

    const conflicts = await TimetableService.getConflictAudit(req.query);
    sendSuccess(res, { conflicts, total: conflicts.length }, 200);
  } catch (error) {
    next(error);
  }
}
