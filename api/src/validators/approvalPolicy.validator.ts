/**
 * CampusFlow API - Approval Policy Validators
 * Validates payloads and query parameters for ApprovalPolicy administration.
 */

import type { ValidationResult, ValidationIssue } from '../middleware/validate';
import { UserRole, type UserRoleType } from '../models/user.model';
import {
  ApprovalScopeType,
  VALID_APPROVER_ROLES,
  type ApprovalScopeTypeValue,
  type ApproverRoleType,
  type IApprovalChainStepConfig,
} from '../models/approvalPolicy.model';

const MONGO_ID_REGEX = /^[0-9a-fA-F]{24}$/;

export interface CreateApprovalPolicyInput {
  name: string;
  description?: string;
  scopeType: ApprovalScopeTypeValue;
  resource?: string | null;
  resourceType?: string | null;
  requesterRole: UserRoleType | null;
  requiresApproval: boolean;
  approvalChain: IApprovalChainStepConfig[];
  isActive?: boolean;
}

export interface UpdateApprovalPolicyInput {
  name: string;
  description?: string;
  scopeType: ApprovalScopeTypeValue;
  resource?: string | null;
  resourceType?: string | null;
  requesterRole: UserRoleType | null;
  requiresApproval: boolean;
  approvalChain: IApprovalChainStepConfig[];
  isActive?: boolean;
}

export interface PatchPolicyStatusInput {
  isActive: boolean;
}

export interface ListApprovalPoliciesQueryInput {
  scopeType?: ApprovalScopeTypeValue;
  resourceId?: string;
  resourceTypeId?: string;
  requesterRole?: UserRoleType;
  isActive?: boolean;
  isArchived?: boolean;
  page?: number;
  limit?: number;
}

function validatePolicyFields(
  record: Record<string, unknown>,
  isUpdate = false
): { errors: ValidationIssue[]; data?: CreateApprovalPolicyInput } {
  const errors: ValidationIssue[] = [];

  // name
  if (!record.name || typeof record.name !== 'string') {
    errors.push({ field: 'name', message: 'Policy name is required and must be a string' });
  } else {
    const trimmed = record.name.trim();
    if (trimmed.length < 2 || trimmed.length > 120) {
      errors.push({ field: 'name', message: 'Policy name must be between 2 and 120 characters' });
    }
  }

  // description (optional)
  let description: string | undefined = undefined;
  if (record.description !== undefined && record.description !== null) {
    if (typeof record.description !== 'string') {
      errors.push({ field: 'description', message: 'Description must be a string' });
    } else {
      description = record.description.trim();
      if (description.length > 500) {
        errors.push({ field: 'description', message: 'Description cannot exceed 500 characters' });
      }
    }
  }

  // scopeType
  const scopeType = record.scopeType as ApprovalScopeTypeValue;
  if (!scopeType || !Object.values(ApprovalScopeType).includes(scopeType)) {
    errors.push({
      field: 'scopeType',
      message: 'scopeType is required and must be RESOURCE or RESOURCE_TYPE',
    });
  }

  // resource vs resourceType
  let resource: string | null = null;
  let resourceType: string | null = null;

  if (scopeType === ApprovalScopeType.RESOURCE) {
    if (!record.resource || typeof record.resource !== 'string' || !MONGO_ID_REGEX.test(record.resource)) {
      errors.push({ field: 'resource', message: 'resource must be a valid 24-character hex ObjectId' });
    } else {
      resource = record.resource;
    }
    if (record.resourceType !== undefined && record.resourceType !== null) {
      errors.push({ field: 'resourceType', message: 'resourceType must be null when scopeType is RESOURCE' });
    }
  } else if (scopeType === ApprovalScopeType.RESOURCE_TYPE) {
    if (!record.resourceType || typeof record.resourceType !== 'string' || !MONGO_ID_REGEX.test(record.resourceType)) {
      errors.push({ field: 'resourceType', message: 'resourceType must be a valid 24-character hex ObjectId' });
    } else {
      resourceType = record.resourceType;
    }
    if (record.resource !== undefined && record.resource !== null) {
      errors.push({ field: 'resource', message: 'resource must be null when scopeType is RESOURCE_TYPE' });
    }
  }

  // requesterRole (null = wildcard)
  let requesterRole: UserRoleType | null = null;
  if (record.requesterRole !== undefined && record.requesterRole !== null) {
    if (typeof record.requesterRole !== 'string' || !Object.values(UserRole).includes(record.requesterRole as UserRoleType)) {
      errors.push({
        field: 'requesterRole',
        message: `requesterRole must be a valid UserRole or null for wildcard. Allowed: ${Object.values(UserRole).join(', ')}`,
      });
    } else {
      requesterRole = record.requesterRole as UserRoleType;
    }
  }

  // requiresApproval
  const requiresApproval = record.requiresApproval !== undefined ? Boolean(record.requiresApproval) : true;

  // approvalChain
  const approvalChain: IApprovalChainStepConfig[] = [];
  if (!Array.isArray(record.approvalChain)) {
    errors.push({ field: 'approvalChain', message: 'approvalChain must be an array' });
  } else {
    if (requiresApproval === false) {
      if (record.approvalChain.length > 0) {
        errors.push({
          field: 'approvalChain',
          message: 'approvalChain must be empty when requiresApproval is false',
        });
      }
    } else {
      // requiresApproval === true
      if (record.approvalChain.length < 1 || record.approvalChain.length > 5) {
        errors.push({
          field: 'approvalChain',
          message: 'approvalChain must contain between 1 and 5 steps when requiresApproval is true',
        });
      }

      const seenRoles = new Set<string>();
      for (let i = 0; i < record.approvalChain.length; i++) {
        const step = record.approvalChain[i] as Record<string, unknown>;
        const expectedStep = i + 1;

        if (!step || typeof step !== 'object') {
          errors.push({ field: `approvalChain[${i}]`, message: 'Step must be an object' });
          continue;
        }

        if (typeof step.stepOrder !== 'number' || step.stepOrder !== expectedStep) {
          errors.push({
            field: `approvalChain[${i}].stepOrder`,
            message: `stepOrder must be consecutive starting at 1. Expected ${expectedStep}, got ${step.stepOrder}`,
          });
        }

        const role = step.approverRole as ApproverRoleType;
        if (!role || !VALID_APPROVER_ROLES.includes(role)) {
          errors.push({
            field: `approvalChain[${i}].approverRole`,
            message: `approverRole must be one of: ${VALID_APPROVER_ROLES.join(', ')}`,
          });
        } else {
          if (seenRoles.has(role)) {
            errors.push({
              field: `approvalChain[${i}].approverRole`,
              message: `Duplicate approver role "${role}" in chain is forbidden`,
            });
          }
          seenRoles.add(role);
        }

        let timeoutHours: number | undefined = undefined;
        if (step.timeoutHours !== undefined && step.timeoutHours !== null) {
          if (
            typeof step.timeoutHours !== 'number' ||
            !Number.isInteger(step.timeoutHours) ||
            step.timeoutHours < 1 ||
            step.timeoutHours > 168
          ) {
            errors.push({
              field: `approvalChain[${i}].timeoutHours`,
              message: 'timeoutHours must be an integer between 1 and 168 hours',
            });
          } else {
            timeoutHours = step.timeoutHours;
          }
        }

        approvalChain.push({
          stepOrder: expectedStep,
          approverRole: role,
          ...(timeoutHours !== undefined ? { timeoutHours } : {}),
        });
      }
    }
  }

  // isActive
  const isActive = record.isActive !== undefined ? Boolean(record.isActive) : true;

  if (errors.length > 0) {
    return { errors };
  }

  return {
    errors: [],
    data: {
      name: (record.name as string).trim(),
      description,
      scopeType,
      resource,
      resourceType,
      requesterRole,
      requiresApproval,
      approvalChain,
      isActive,
    },
  };
}

export function validateCreateApprovalPolicyBody(data: unknown): ValidationResult<CreateApprovalPolicyInput> {
  const record = (data || {}) as Record<string, unknown>;
  const { errors, data: validated } = validatePolicyFields(record, false);
  if (errors.length > 0) {
    return { success: false, errors };
  }
  return { success: true, data: validated };
}

export function validateUpdateApprovalPolicyBody(data: unknown): ValidationResult<UpdateApprovalPolicyInput> {
  const record = (data || {}) as Record<string, unknown>;
  const { errors, data: validated } = validatePolicyFields(record, true);
  if (errors.length > 0) {
    return { success: false, errors };
  }
  return { success: true, data: validated };
}

export function validatePatchPolicyStatusBody(data: unknown): ValidationResult<PatchPolicyStatusInput> {
  const record = (data || {}) as Record<string, unknown>;
  const errors: ValidationIssue[] = [];

  if (record.isActive === undefined || typeof record.isActive !== 'boolean') {
    errors.push({ field: 'isActive', message: 'isActive is required and must be a boolean' });
  }

  if (errors.length > 0) {
    return { success: false, errors };
  }

  return { success: true, data: { isActive: record.isActive as boolean } };
}

export const validateTogglePolicyStatusBody = validatePatchPolicyStatusBody;

export function validateListApprovalPoliciesQuery(data: unknown): ValidationResult<ListApprovalPoliciesQueryInput> {
  const record = (data || {}) as Record<string, unknown>;
  const errors: ValidationIssue[] = [];
  const result: ListApprovalPoliciesQueryInput = {};

  if (record.scopeType !== undefined) {
    if (!Object.values(ApprovalScopeType).includes(record.scopeType as ApprovalScopeTypeValue)) {
      errors.push({ field: 'scopeType', message: 'Invalid scopeType. Allowed: RESOURCE, RESOURCE_TYPE' });
    } else {
      result.scopeType = record.scopeType as ApprovalScopeTypeValue;
    }
  }

  if (record.resourceId !== undefined) {
    if (typeof record.resourceId !== 'string' || !MONGO_ID_REGEX.test(record.resourceId)) {
      errors.push({ field: 'resourceId', message: 'resourceId must be a valid 24-character hex ObjectId' });
    } else {
      result.resourceId = record.resourceId;
    }
  }

  if (record.resourceTypeId !== undefined) {
    if (typeof record.resourceTypeId !== 'string' || !MONGO_ID_REGEX.test(record.resourceTypeId)) {
      errors.push({ field: 'resourceTypeId', message: 'resourceTypeId must be a valid 24-character hex ObjectId' });
    } else {
      result.resourceTypeId = record.resourceTypeId;
    }
  }

  if (record.requesterRole !== undefined) {
    if (typeof record.requesterRole !== 'string' || !Object.values(UserRole).includes(record.requesterRole as UserRoleType)) {
      errors.push({ field: 'requesterRole', message: 'Invalid requesterRole' });
    } else {
      result.requesterRole = record.requesterRole as UserRoleType;
    }
  }

  if (record.isActive !== undefined) {
    if (record.isActive === 'true' || record.isActive === true) {
      result.isActive = true;
    } else if (record.isActive === 'false' || record.isActive === false) {
      result.isActive = false;
    } else {
      errors.push({ field: 'isActive', message: 'isActive must be a boolean' });
    }
  }

  if (record.isArchived !== undefined) {
    if (record.isArchived === 'true' || record.isArchived === true) {
      result.isArchived = true;
    } else if (record.isArchived === 'false' || record.isArchived === false) {
      result.isArchived = false;
    } else {
      errors.push({ field: 'isArchived', message: 'isArchived must be a boolean' });
    }
  }

  if (record.page !== undefined) {
    const p = Number(record.page);
    if (!Number.isInteger(p) || p < 1) {
      errors.push({ field: 'page', message: 'page must be an integer >= 1' });
    } else {
      result.page = p;
    }
  }

  if (record.limit !== undefined) {
    const l = Number(record.limit);
    if (!Number.isInteger(l) || l < 1 || l > 100) {
      errors.push({ field: 'limit', message: 'limit must be an integer between 1 and 100' });
    } else {
      result.limit = l;
    }
  }

  if (errors.length > 0) {
    return { success: false, errors };
  }

  return { success: true, data: result };
}
