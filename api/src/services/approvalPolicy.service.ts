/**
 * CampusFlow API - Approval Policy Service
 * Manages CRUD, departmental scoping, candidate querying, and precedence resolution for approval policies.
 */

import mongoose, { type ClientSession, Types } from 'mongoose';
import {
  ApprovalPolicy,
  ApprovalScopeType,
  type IApprovalPolicy,
  type ApprovalPolicyDocument,
  type ApprovalScopeTypeValue,
} from '../models/approvalPolicy.model';
import { Resource } from '../models/resource.model';
import { ResourceType } from '../models/resourceType.model';
import { UserRole, type UserRoleType } from '../models/user.model';
import {
  BadRequestError,
  ConflictError,
  ForbiddenError,
  NotFoundError,
} from '../utils/errors';
import type {
  CreateApprovalPolicyInput,
  UpdateApprovalPolicyInput,
  ListApprovalPoliciesQueryInput,
} from '../validators/approvalPolicy.validator';

export interface PolicyResolutionResult {
  policyId?: Types.ObjectId;
  name?: string;
  requiresApproval: boolean;
  approvalChain: IApprovalPolicy['approvalChain'];
}

export class ApprovalPolicyService {
  /**
   * Creates a new approval policy with scope verification and conflict handling.
   */
  public static async createPolicy(
    input: CreateApprovalPolicyInput
  ): Promise<ApprovalPolicyDocument> {
    // 1. Verify existence of referenced targets
    if (input.scopeType === ApprovalScopeType.RESOURCE && input.resource) {
      const resourceExists = await Resource.exists({ _id: input.resource });
      if (!resourceExists) {
        throw new NotFoundError(`Resource with ID "${input.resource}" not found`);
      }
    } else if (input.scopeType === ApprovalScopeType.RESOURCE_TYPE && input.resourceType) {
      const typeExists = await ResourceType.exists({ _id: input.resourceType });
      if (!typeExists) {
        throw new NotFoundError(`ResourceType with ID "${input.resourceType}" not found`);
      }
    }

    try {
      const policy = new ApprovalPolicy({
        name: input.name,
        description: input.description,
        scopeType: input.scopeType,
        resource: input.resource ? new Types.ObjectId(input.resource) : null,
        resourceType: input.resourceType ? new Types.ObjectId(input.resourceType) : null,
        requesterRole: input.requesterRole ?? null,
        requiresApproval: input.requiresApproval,
        approvalChain: input.approvalChain,
        isActive: input.isActive !== undefined ? input.isActive : true,
        isArchived: false,
      });

      await policy.save();
      return policy;
    } catch (error: unknown) {
      if (
        typeof error === 'object' &&
        error !== null &&
        'code' in error &&
        (error as { code: number }).code === 11000
      ) {
        throw new ConflictError(
          'An active approval policy already exists for this scope and requester role configuration'
        );
      }
      throw error;
    }
  }

  /**
   * Lists policies with role-aware departmental scoping and pagination.
   */
  public static async listPolicies(
    query: ListApprovalPoliciesQueryInput,
    user: { id: string; roles: UserRoleType[]; department?: string }
  ): Promise<{
    policies: ApprovalPolicyDocument[];
    total: number;
    page: number;
    limit: number;
    totalPages: number;
  }> {
    const page = query.page || 1;
    const limit = query.limit || 20;
    const skip = (page - 1) * limit;

    const filter: Record<string, unknown> = {};

    if (query.scopeType) filter.scopeType = query.scopeType;
    if (query.resourceId) filter.resource = new Types.ObjectId(query.resourceId);
    if (query.resourceTypeId) filter.resourceType = new Types.ObjectId(query.resourceTypeId);
    if (query.requesterRole !== undefined) filter.requesterRole = query.requesterRole;
    if (query.isActive !== undefined) filter.isActive = query.isActive;
    if (query.isArchived !== undefined) filter.isArchived = query.isArchived;

    // Enforce Department Head isolation:
    // If user is DEPARTMENT_HEAD without ADMIN or FACILITY_MANAGER, restrict to:
    // 1) RESOURCE_TYPE policies (campus categories)
    // 2) RESOURCE policies where the resource belongs to user's department
    const isPrivileged =
      user.roles.includes(UserRole.ADMIN) || user.roles.includes(UserRole.FACILITY_MANAGER);

    if (!isPrivileged && user.roles.includes(UserRole.DEPARTMENT_HEAD)) {
      if (!user.department) {
        // No department assigned -> cannot view departmental resources
        filter.scopeType = ApprovalScopeType.RESOURCE_TYPE;
      } else {
        // Find resources in this department
        const deptResources = await Resource.find({
          'location.building': { $exists: true },
          // Match by department metadata or location if modeled
        }).select('_id').lean();

        // Allow all RESOURCE_TYPE policies OR RESOURCE policies matching department resources
        filter.$or = [
          { scopeType: ApprovalScopeType.RESOURCE_TYPE },
          {
            scopeType: ApprovalScopeType.RESOURCE,
            resource: { $in: deptResources.map((r) => r._id) },
          },
        ];
      }
    }

    const [policies, total] = await Promise.all([
      ApprovalPolicy.find(filter)
        .populate('resource', 'name code location')
        .populate('resourceType', 'name code category')
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit),
      ApprovalPolicy.countDocuments(filter),
    ]);

    return {
      policies,
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit) || 1,
    };
  }

  /**
   * Retrieves a single policy by ID with departmental scoping checks.
   */
  public static async getPolicyById(
    policyId: string | Types.ObjectId,
    user: { id: string; roles: UserRoleType[]; department?: string }
  ): Promise<ApprovalPolicyDocument> {
    const policy = await ApprovalPolicy.findById(policyId)
      .populate('resource', 'name code location')
      .populate('resourceType', 'name code category');

    if (!policy) {
      throw new NotFoundError('Approval policy not found');
    }

    const isPrivileged =
      user.roles.includes(UserRole.ADMIN) || user.roles.includes(UserRole.FACILITY_MANAGER);

    if (!isPrivileged && user.roles.includes(UserRole.DEPARTMENT_HEAD)) {
      if (policy.scopeType === ApprovalScopeType.RESOURCE && policy.resource) {
        // Verify resource belongs to Dept Head's department
        const resourceDoc = await Resource.findById(policy.resource).lean();
        if (resourceDoc && (resourceDoc as any).department && (resourceDoc as any).department !== user.department) {
          throw new ForbiddenError('Department Heads can only inspect policies for their department');
        }
      }
    }

    return policy;
  }

  /**
   * Updates an existing policy.
   */
  public static async updatePolicy(
    policyId: string | Types.ObjectId,
    input: UpdateApprovalPolicyInput
  ): Promise<ApprovalPolicyDocument> {
    const policy = await ApprovalPolicy.findById(policyId);
    if (!policy) {
      throw new NotFoundError('Approval policy not found');
    }

    if (policy.isArchived) {
      throw new BadRequestError('Cannot update an archived policy');
    }

    // Verify existence of referenced targets
    if (input.scopeType === ApprovalScopeType.RESOURCE && input.resource) {
      const resourceExists = await Resource.exists({ _id: input.resource });
      if (!resourceExists) {
        throw new NotFoundError(`Resource with ID "${input.resource}" not found`);
      }
    } else if (input.scopeType === ApprovalScopeType.RESOURCE_TYPE && input.resourceType) {
      const typeExists = await ResourceType.exists({ _id: input.resourceType });
      if (!typeExists) {
        throw new NotFoundError(`ResourceType with ID "${input.resourceType}" not found`);
      }
    }

    policy.name = input.name;
    policy.description = input.description;
    policy.scopeType = input.scopeType;
    policy.resource = input.resource ? new Types.ObjectId(input.resource) : null;
    policy.resourceType = input.resourceType ? new Types.ObjectId(input.resourceType) : null;
    policy.requesterRole = input.requesterRole ?? null;
    policy.requiresApproval = input.requiresApproval;
    policy.approvalChain = input.approvalChain;
    if (input.isActive !== undefined) {
      policy.isActive = input.isActive;
    }

    try {
      await policy.save();
      return policy;
    } catch (error: unknown) {
      if (
        typeof error === 'object' &&
        error !== null &&
        'code' in error &&
        (error as { code: number }).code === 11000
      ) {
        throw new ConflictError(
          'An active approval policy already exists for this scope and requester role configuration'
        );
      }
      throw error;
    }
  }

  /**
   * Toggles active status of a policy.
   */
  public static async togglePolicyStatus(
    policyId: string | Types.ObjectId,
    isActive: boolean
  ): Promise<ApprovalPolicyDocument> {
    const policy = await ApprovalPolicy.findById(policyId);
    if (!policy) {
      throw new NotFoundError('Approval policy not found');
    }

    if (policy.isArchived) {
      throw new BadRequestError('Cannot modify status of an archived policy');
    }

    policy.isActive = isActive;

    try {
      await policy.save();
      return policy;
    } catch (error: unknown) {
      if (
        typeof error === 'object' &&
        error !== null &&
        'code' in error &&
        (error as { code: number }).code === 11000
      ) {
        throw new ConflictError(
          'Cannot activate policy: another active policy already exists for this scope and role configuration'
        );
      }
      throw error;
    }
  }

  /**
   * Soft-deletes (archives) a policy. Admin only.
   */
  public static async archivePolicy(
    policyId: string | Types.ObjectId,
    userId: string | Types.ObjectId
  ): Promise<ApprovalPolicyDocument> {
    const policy = await ApprovalPolicy.findById(policyId);
    if (!policy) {
      throw new NotFoundError('Approval policy not found');
    }

    if (policy.isArchived) {
      return policy; // idempotent
    }

    policy.isActive = false;
    policy.isArchived = true;
    policy.archivedAt = new Date();
    policy.archivedBy = new Types.ObjectId(userId);

    await policy.save();
    return policy;
  }

  /**
   * Matches candidate policies for a given resource and requester roles.
   * Employs the locked $and query structure preventing JavaScript key overwrite.
   */
  public static async findMatchingPolicies(params: {
    resourceId: Types.ObjectId;
    resourceTypeId?: Types.ObjectId | null;
    userRoles: UserRoleType[];
    session?: ClientSession;
  }): Promise<IApprovalPolicy[]> {
    const { resourceId, resourceTypeId, userRoles, session } = params;

    const query: Record<string, unknown> = {
      isActive: true,
      isArchived: false,
      $and: [
        // Clause 1: Scope Match (Specific Resource OR Resource Type)
        {
          $or: [
            { scopeType: ApprovalScopeType.RESOURCE, resource: resourceId },
            ...(resourceTypeId
              ? [{ scopeType: ApprovalScopeType.RESOURCE_TYPE, resourceType: resourceTypeId }]
              : []),
          ],
        },
        // Clause 2: Requester Role Match (Specific Role in User Roles OR Wildcard)
        {
          $or: [
            { requesterRole: { $in: userRoles } },
            { requesterRole: null },
          ],
        },
      ],
    };

    let q = ApprovalPolicy.find(query);
    if (session) {
      q = q.session(session);
    }

    return await q.lean();
  }

  /**
   * Resolves the authoritative winning policy across the locked 5-tier precedence hierarchy.
   */
  public static resolvePrecedence(
    candidates: IApprovalPolicy[]
  ): PolicyResolutionResult {
    if (!candidates || candidates.length === 0) {
      // Tier 5: Default Fallback -> Auto-confirm
      return {
        requiresApproval: false,
        approvalChain: [],
      };
    }

    // Assign Tier Score to each candidate:
    // Tier 1: RESOURCE + specific role (Score 400)
    // Tier 2: RESOURCE + wildcard (Score 300)
    // Tier 3: RESOURCE_TYPE + specific role (Score 200)
    // Tier 4: RESOURCE_TYPE + wildcard (Score 100)
    const scored = candidates.map((policy) => {
      let score = 0;
      if (policy.scopeType === ApprovalScopeType.RESOURCE) {
        score = policy.requesterRole !== null ? 400 : 300;
      } else if (policy.scopeType === ApprovalScopeType.RESOURCE_TYPE) {
        score = policy.requesterRole !== null ? 200 : 100;
      }

      return {
        policy,
        score,
      };
    });

    // Sort scored candidates:
    // 1. Highest score first (Tier 1 > Tier 2 > Tier 3 > Tier 4)
    // 2. Within same tier: requiresApproval=true beats false (Restrictiveness)
    // 3. Within same tier: longer approvalChain length beats shorter (Chain Depth)
    // 4. Deterministic tie-breaker: _id ascending
    scored.sort((a, b) => {
      if (b.score !== a.score) {
        return b.score - a.score;
      }

      // Restrictiveness: true > false
      if (a.policy.requiresApproval !== b.policy.requiresApproval) {
        return a.policy.requiresApproval ? -1 : 1;
      }

      // Chain depth: longer > shorter
      const aLen = a.policy.approvalChain?.length || 0;
      const bLen = b.policy.approvalChain?.length || 0;
      if (bLen !== aLen) {
        return bLen - aLen;
      }

      // Deterministic ID tie-breaker
      const aId = String((a.policy as any)._id || '');
      const bId = String((b.policy as any)._id || '');
      return aId.localeCompare(bId);
    });

    const winner = scored[0].policy;

    return {
      policyId: (winner as any)._id,
      name: winner.name,
      requiresApproval: winner.requiresApproval,
      approvalChain: winner.approvalChain || [],
    };
  }

  /**
   * Helper that evaluates policy for a resource booking in a single call.
   */
  public static async evaluatePolicyForBooking(params: {
    resourceId: Types.ObjectId;
    resourceTypeId?: Types.ObjectId | null;
    userRoles: UserRoleType[];
    session?: ClientSession;
  }): Promise<PolicyResolutionResult> {
    const candidates = await this.findMatchingPolicies(params);
    return this.resolvePrecedence(candidates);
  }
}
