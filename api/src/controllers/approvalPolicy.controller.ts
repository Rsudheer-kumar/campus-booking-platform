/**
 * CampusFlow API - Approval Policy Controller
 * HTTP controllers for Approval Policy configuration and management.
 */

import type { Request, Response, NextFunction } from 'express';
import { ApprovalPolicyService } from '../services/approvalPolicy.service';
import { sendSuccess } from '../utils/response';
import { ForbiddenError } from '../utils/errors';

export async function createApprovalPolicy(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    if (!req.user) {
      return next(new ForbiddenError('Unauthorized'));
    }

    const policy = await ApprovalPolicyService.createPolicy(req.body);
    sendSuccess(res, policy, 201);
  } catch (error) {
    next(error);
  }
}

export async function listApprovalPolicies(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    if (!req.user) {
      return next(new ForbiddenError('Unauthorized'));
    }

    const result = await ApprovalPolicyService.listPolicies(req.query as any, {
      id: req.user.id,
      roles: req.user.roles,
      department: req.user.department,
    });

    sendSuccess(res, result, 200);
  } catch (error) {
    next(error);
  }
}

export async function getApprovalPolicyById(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    if (!req.user) {
      return next(new ForbiddenError('Unauthorized'));
    }

    const id = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
    const policy = await ApprovalPolicyService.getPolicyById(id, {
      id: req.user.id,
      roles: req.user.roles,
      department: req.user.department,
    });

    sendSuccess(res, policy, 200);
  } catch (error) {
    next(error);
  }
}

export async function updateApprovalPolicy(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    if (!req.user) {
      return next(new ForbiddenError('Unauthorized'));
    }

    const id = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
    const updated = await ApprovalPolicyService.updatePolicy(id, req.body);
    sendSuccess(res, updated, 200);
  } catch (error) {
    next(error);
  }
}

export async function toggleApprovalPolicyStatus(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    if (!req.user) {
      return next(new ForbiddenError('Unauthorized'));
    }

    const id = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
    const updated = await ApprovalPolicyService.togglePolicyStatus(id, req.body.isActive);
    sendSuccess(res, updated, 200);
  } catch (error) {
    next(error);
  }
}

export async function archiveApprovalPolicy(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    if (!req.user) {
      return next(new ForbiddenError('Unauthorized'));
    }

    const id = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
    const archived = await ApprovalPolicyService.archivePolicy(id, req.user.id);
    sendSuccess(res, archived, 200);
  } catch (error) {
    next(error);
  }
}
