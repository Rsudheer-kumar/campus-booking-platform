/**
 * CampusFlow API - Approval Queue Service
 * High-performance aggregation pipeline for the pending approval queue with role & department isolation,
 * Four-Eyes exclusion, and urgency sorting.
 */

import { Types } from 'mongoose';
import { Reservation, ReservationStatus } from '../models/reservation.model';
import { ApproverRole } from '../models/approvalPolicy.model';
import { UserRole, type UserRoleType } from '../models/user.model';
import type { PendingApprovalsQueryInput } from '../validators/booking.validator';

export interface PendingQueueItem {
  _id: string;
  title: string;
  description?: string;
  startAt: string;
  endAt: string;
  timezone: string;
  status: string;
  currentStepOrder: number;
  currentApproverRole: string;
  activeStepDeadline: string | null;
  totalSteps: number;
  activeStep: {
    stepOrder: number;
    approverRole: string;
    timeoutHours?: number;
    stepStartedAt?: string | null;
    stepDeadline?: string | null;
  };
  resource: {
    _id: string;
    name: string;
    code: string;
    capacity: number;
    location: Record<string, unknown>;
  };
  user: {
    _id: string;
    name: string;
    email: string;
    department?: string;
    identifier?: string;
  };
  createdAt: string;
}

export interface PendingQueueResult {
  items: PendingQueueItem[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}

export class ApprovalQueueService {
  /**
   * Retrieves pending approvals for the authenticated user, enforcing role and department constraints.
   */
  public static async getPendingQueue(
    user: { id: string; roles: UserRoleType[]; department?: string },
    options: PendingApprovalsQueryInput = {}
  ): Promise<PendingQueueResult> {
    const page = options.page || 1;
    const limit = options.limit || 20;
    const sortBy = options.sortBy || 'deadline_asc';
    const skip = (page - 1) * limit;

    const isAdmin = user.roles.includes(UserRole.ADMIN);
    const isFacilityManager = user.roles.includes(UserRole.FACILITY_MANAGER);
    const isDeptHead = user.roles.includes(UserRole.DEPARTMENT_HEAD);

    // Build role & department matching branches
    const roleBranches: Record<string, unknown>[] = [];

    if (isAdmin) {
      roleBranches.push({});
    }

    if (isFacilityManager) {
      roleBranches.push({ currentApproverRole: ApproverRole.FACILITY_MANAGER });
    }

    if (isDeptHead && user.department) {
      roleBranches.push({
        currentApproverRole: ApproverRole.DEPARTMENT_HEAD,
        'requester.department': user.department,
      });
    }

    // If user has none of these roles, queue is empty
    if (roleBranches.length === 0) {
      return {
        items: [],
        total: 0,
        page,
        limit,
        totalPages: 1,
      };
    }

    // Define sort stage
    let sortStage: Record<string, 1 | -1>;
    if (sortBy === 'created_desc') {
      sortStage = { createdAt: -1 };
    } else if (sortBy === 'created_asc') {
      sortStage = { createdAt: 1 };
    } else {
      // 'deadline_asc' (default): items with deadlines first ascending, null deadlines after by createdAt asc
      sortStage = {
        hasDeadline: -1,
        activeStepDeadline: 1,
        createdAt: 1,
      };
    }

    const pipeline: any[] = [
      // Stage 1: Fast index match on active PENDING reservations with current step
      {
        $match: {
          status: ReservationStatus.PENDING,
          currentStepOrder: { $ne: null },
        },
      },

      // Stage 2: Join requester user to evaluate department boundaries
      {
        $lookup: {
          from: 'users',
          localField: 'user',
          foreignField: '_id',
          as: 'requester',
        },
      },
      { $unwind: '$requester' },

      // Stage 3: Match active step role and department boundary
      {
        $match: {
          $or: roleBranches,
        },
      },

      // Stage 4: Enforce Separation of Duties (Four-Eyes Principle) at query level
      // Exclude reservations where current user has already approved a previous step or is the requester!
      {
        $match: {
          'approvalChain.actionedBy': { $ne: new Types.ObjectId(user.id) },
          user: { $ne: new Types.ObjectId(user.id) },
        },
      },

      // Stage 5: Join resource details
      {
        $lookup: {
          from: 'resources',
          localField: 'resource',
          foreignField: '_id',
          as: 'resourceDoc',
        },
      },
      { $unwind: '$resourceDoc' },

      // Stage 6: Project active step details and urgency sort helpers
      {
        $addFields: {
          activeStep: {
            $arrayElemAt: [
              {
                $filter: {
                  input: '$approvalChain',
                  as: 'step',
                  cond: { $eq: ['$$step.stepOrder', '$currentStepOrder'] },
                },
              },
              0,
            ],
          },
          hasDeadline: {
            $cond: [{ $ifNull: ['$activeStepDeadline', false] }, 1, 0],
          },
        },
      },

      // Stage 7: Deterministic Urgency Sorting
      {
        $sort: sortStage,
      },

      // Stage 8: Facet pagination
      {
        $facet: {
          metadata: [{ $count: 'total' }],
          data: [
            { $skip: skip },
            { $limit: limit },
            {
              $project: {
                _id: 1,
                title: 1,
                description: 1,
                startAt: 1,
                endAt: 1,
                timezone: 1,
                status: 1,
                currentStepOrder: 1,
                currentApproverRole: 1,
                activeStepDeadline: 1,
                totalSteps: { $size: '$approvalChain' },
                activeStep: {
                  stepOrder: '$activeStep.stepOrder',
                  approverRole: '$activeStep.approverRole',
                  timeoutHours: '$activeStep.timeoutHours',
                  stepStartedAt: '$activeStep.stepStartedAt',
                  stepDeadline: '$activeStep.stepDeadline',
                },
                resource: {
                  _id: '$resourceDoc._id',
                  name: '$resourceDoc.name',
                  code: '$resourceDoc.code',
                  capacity: '$resourceDoc.capacity',
                  location: '$resourceDoc.location',
                },
                user: {
                  _id: '$requester._id',
                  name: '$requester.name',
                  email: '$requester.email',
                  department: '$requester.department',
                  identifier: '$requester.identifier',
                },
                createdAt: 1,
              },
            },
          ],
        },
      },
    ];

    const [facetResult] = await Reservation.aggregate(pipeline);

    const total = facetResult?.metadata?.[0]?.total || 0;
    const items = facetResult?.data || [];

    return {
      items,
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit) || 1,
    };
  }
}
