/**
 * CampusFlow API - Approval Queue Controller
 * HTTP handler for retrieving the pending approval queue with role, department, and Four-Eyes filtering.
 */

import type { Request, Response, NextFunction } from 'express';
import { ApprovalQueueService } from '../services/approvalQueue.service';
import { sendSuccess } from '../utils/response';
import { ForbiddenError } from '../utils/errors';

export async function getPendingApprovals(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    if (!req.user) {
      return next(new ForbiddenError('Unauthorized'));
    }

    const result = await ApprovalQueueService.getPendingQueue(
      {
        id: req.user.id,
        roles: req.user.roles,
        department: req.user.department,
      },
      req.query as any
    );

    sendSuccess(res, result, 200);
  } catch (error) {
    next(error);
  }
}
