/**
 * CampusFlow API - Approval Policy Model
 * Configurable multi-step approval workflow policies by resource, resource type, and requester role.
 *
 * PHASE 3.2 ARCHITECTURE LOCK:
 * - Scope: RESOURCE or RESOURCE_TYPE
 * - Target: resource ObjectId or resourceType ObjectId (mutually exclusive)
 * - Requester role: specific UserRole or explicit null for wildcard (all roles)
 * - Chain: 1-5 steps with consecutive 1..N stepOrder, valid approver roles, optional timeoutHours
 * - Inactive/archived policies excluded from unique index via partial filter
 */

import mongoose, { Schema, type Model, type HydratedDocument, type Types } from 'mongoose';
import { UserRole, type UserRoleType } from './user.model';

export const ApprovalScopeType = {
  RESOURCE: 'RESOURCE',
  RESOURCE_TYPE: 'RESOURCE_TYPE',
} as const;

export type ApprovalScopeTypeValue = (typeof ApprovalScopeType)[keyof typeof ApprovalScopeType];

export const ApproverRole = {
  DEPARTMENT_HEAD: UserRole.DEPARTMENT_HEAD,
  FACILITY_MANAGER: UserRole.FACILITY_MANAGER,
  ADMIN: UserRole.ADMIN,
} as const;

export type ApproverRoleType = (typeof ApproverRole)[keyof typeof ApproverRole];

export const VALID_APPROVER_ROLES: readonly ApproverRoleType[] = [
  ApproverRole.DEPARTMENT_HEAD,
  ApproverRole.FACILITY_MANAGER,
  ApproverRole.ADMIN,
] as const;

export interface IApprovalChainStepConfig {
  stepOrder: number;
  approverRole: ApproverRoleType;
  timeoutHours?: number;
}

export interface IApprovalPolicy {
  name: string;
  description?: string;
  scopeType: ApprovalScopeTypeValue;
  resource?: Types.ObjectId | null;
  resourceType?: Types.ObjectId | null;
  requesterRole: UserRoleType | null;
  requiresApproval: boolean;
  approvalChain: IApprovalChainStepConfig[];
  isActive: boolean;
  isArchived: boolean;
  archivedAt?: Date | null;
  archivedBy?: Types.ObjectId | null;
  createdAt?: Date;
  updatedAt?: Date;
}

export type ApprovalPolicyDocument = HydratedDocument<IApprovalPolicy>;

const ApprovalChainStepSchema = new Schema<IApprovalChainStepConfig>(
  {
    stepOrder: {
      type: Number,
      required: true,
      min: 1,
    },
    approverRole: {
      type: String,
      enum: {
        values: VALID_APPROVER_ROLES,
        message: 'Invalid approver role: {VALUE}. Allowed: DEPARTMENT_HEAD, FACILITY_MANAGER, ADMIN',
      },
      required: true,
    },
    timeoutHours: {
      type: Number,
      required: false,
      min: [1, 'timeoutHours must be at least 1 hour'],
      max: [168, 'timeoutHours cannot exceed 168 hours (7 days)'],
      validate: {
        validator: (v: number | undefined) => v === undefined || Number.isInteger(v),
        message: 'timeoutHours must be an integer',
      },
    },
  },
  { _id: false }
);

export const ApprovalPolicySchema = new Schema<IApprovalPolicy>(
  {
    name: {
      type: String,
      required: [true, 'Policy name is required'],
      trim: true,
      minlength: [2, 'Policy name must be at least 2 characters'],
      maxlength: [120, 'Policy name cannot exceed 120 characters'],
    },
    description: {
      type: String,
      trim: true,
      maxlength: [500, 'Description cannot exceed 500 characters'],
    },
    scopeType: {
      type: String,
      enum: {
        values: Object.values(ApprovalScopeType),
        message: 'Invalid scopeType: {VALUE}. Allowed: RESOURCE, RESOURCE_TYPE',
      },
      required: [true, 'scopeType is required'],
    },
    resource: {
      type: Schema.Types.ObjectId,
      ref: 'Resource',
      default: null,
    },
    resourceType: {
      type: Schema.Types.ObjectId,
      ref: 'ResourceType',
      default: null,
    },
    requesterRole: {
      type: String,
      enum: {
        values: [...Object.values(UserRole), null],
        message: 'Invalid requesterRole: {VALUE}',
      },
      default: null, // explicit null = wildcard
    },
    requiresApproval: {
      type: Boolean,
      default: true,
      required: true,
    },
    approvalChain: {
      type: [ApprovalChainStepSchema],
      default: [],
    },
    isActive: {
      type: Boolean,
      default: true,
      required: true,
      index: true,
    },
    isArchived: {
      type: Boolean,
      default: false,
      required: true,
      index: true,
    },
    archivedAt: {
      type: Date,
      default: null,
    },
    archivedBy: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      default: null,
    },
  },
  {
    timestamps: true,
    versionKey: false,
  }
);

// Pre-validation invariant checks
ApprovalPolicySchema.pre('validate', function () {
  // 1. Scope Mutual Exclusivity
  if (this.scopeType === ApprovalScopeType.RESOURCE) {
    if (!this.resource) {
      throw new Error('resource is required when scopeType is RESOURCE');
    }
    this.resourceType = null;
  } else if (this.scopeType === ApprovalScopeType.RESOURCE_TYPE) {
    if (!this.resourceType) {
      throw new Error('resourceType is required when scopeType is RESOURCE_TYPE');
    }
    this.resource = null;
  }

  // 2. Normalize wildcard requesterRole
  if (this.requesterRole === undefined) {
    this.requesterRole = null;
  }

  // 3. Approval Chain Invariants
  if (this.requiresApproval === false) {
    if (this.approvalChain && this.approvalChain.length > 0) {
      throw new Error('approvalChain must be empty when requiresApproval is false');
    }
  } else {
    // requiresApproval === true
    if (!this.approvalChain || this.approvalChain.length === 0) {
      throw new Error('approvalChain must contain at least 1 step when requiresApproval is true');
    }
    if (this.approvalChain.length > 5) {
      throw new Error('approvalChain cannot exceed 5 steps');
    }

    // Step order must be consecutive 1..N and roles must not duplicate
    const seenRoles = new Set<string>();
    for (let i = 0; i < this.approvalChain.length; i++) {
      const expectedStep = i + 1;
      const step = this.approvalChain[i];

      if (step.stepOrder !== expectedStep) {
        throw new Error(`Step order must be consecutive starting at 1. Expected step ${expectedStep}, found ${step.stepOrder}`);
      }

      if (!VALID_APPROVER_ROLES.includes(step.approverRole)) {
        throw new Error(`Invalid approver role "${step.approverRole}" at step ${step.stepOrder}`);
      }

      if (seenRoles.has(step.approverRole)) {
        throw new Error(`Duplicate approver role "${step.approverRole}" in approval chain`);
      }
      seenRoles.add(step.approverRole);
    }
  }
});

// Indexes

// 1. Partial Unique Index: Exactly one active, unarchived policy per scope and role configuration
ApprovalPolicySchema.index(
  {
    scopeType: 1,
    resource: 1,
    resourceType: 1,
    requesterRole: 1,
  },
  {
    unique: true,
    partialFilterExpression: {
      isActive: true,
      isArchived: false,
    },
    name: 'unique_active_approval_policy',
  }
);

// 2. High-speed lookup index for candidate resolution
ApprovalPolicySchema.index(
  {
    isActive: 1,
    isArchived: 1,
    scopeType: 1,
    resource: 1,
    resourceType: 1,
  },
  { name: 'idx_policy_resolution_scope' }
);

export const ApprovalPolicy: Model<IApprovalPolicy> = mongoose.model<IApprovalPolicy>(
  'ApprovalPolicy',
  ApprovalPolicySchema
);
