/**
 * CampusFlow API - Quota Evaluation Service
 * Evaluates booking limits against multi-dimensional Quota policies
 * across scopes (Resource, ResourceType), subjects (User, Role, Department),
 * metrics (Booking Count, Duration Minutes), and authoritative timezones.
 */

import { Types, type ClientSession } from 'mongoose';
import {
  Quota,
  type IQuota,
  QuotaScopeType,
  QuotaSubjectType,
  QuotaMetric,
  User,
  Resource,
  Reservation,
  ACTIVE_RESERVATION_STATES,
  ReservationStatus,
} from '../models';
import { getPeriodBounds, getZonedParts } from '../utils/timezone';
import { normalizeDepartmentName } from '../utils/dateValidation';

export interface QuotaViolation {
  quotaId: string;
  quotaName: string;
  scopeType: string;
  subjectType: string;
  metric: string;
  period: string;
  limit: number;
  consumed: number;
  requested: number;
  remaining: number;
}

export interface QuotaCheckResult {
  allowed: boolean;
  violation?: QuotaViolation;
}

export interface EvaluateQuotaParams {
  userId: string | Types.ObjectId;
  resourceId: string | Types.ObjectId;
  startAt: Date;
  endAt: Date;
  excludeReservationId?: string | Types.ObjectId;
  session?: ClientSession;
}

export class QuotaService {
  /**
   * Evaluates all applicable active quotas for a candidate reservation.
   * If any quota is exceeded, returns allowed: false with violation details.
   */
  public static async evaluateQuotas(params: EvaluateQuotaParams): Promise<QuotaCheckResult> {
    const { userId, resourceId, startAt, endAt, excludeReservationId, session } = params;

    // 1. Retrieve user details (roles, department)
    const user = await User.findById(userId).session(session || null).lean();
    if (!user || !user.isActive) {
      return { allowed: true }; // Inactive or missing user handled by user validation
    }

    // 2. Retrieve resource details (resourceType)
    const resource = await Resource.findById(resourceId).session(session || null).lean();
    if (!resource || !resource.isActive) {
      return { allowed: true };
    }

    const candidateDurationMinutes = Math.round((endAt.getTime() - startAt.getTime()) / 60000);

    // 3. Find all candidate active quotas that could apply to this resource or its resourceType
    const resourceIdObj = new Types.ObjectId(resourceId);
    const resourceTypeIdObj = new Types.ObjectId(resource.resourceType);

    const activeQuotas = await Quota.find({
      isActive: true,
      $or: [
        { scopeType: QuotaScopeType.RESOURCE, resource: resourceIdObj },
        { scopeType: QuotaScopeType.RESOURCE_TYPE, resourceType: resourceTypeIdObj },
      ],
    }).session(session || null).lean();

    if (activeQuotas.length === 0) {
      return { allowed: true };
    }

    // 4. Filter quotas that match the subject (USER, ROLE, DEPARTMENT)
    const normalizedUserDept = normalizeDepartmentName(user.department);

    for (const quota of activeQuotas) {
      let subjectMatches = false;

      if (quota.subjectType === QuotaSubjectType.USER) {
        subjectMatches = quota.user ? quota.user.toString() === userId.toString() : false;
      } else if (quota.subjectType === QuotaSubjectType.ROLE) {
        subjectMatches = quota.role ? user.roles.includes(quota.role) : false;
      } else if (quota.subjectType === QuotaSubjectType.DEPARTMENT) {
        if (quota.department && normalizedUserDept) {
          subjectMatches = quota.department.localeCompare(normalizedUserDept, undefined, { sensitivity: 'accent' }) === 0;
        }
      }

      if (!subjectMatches) {
        continue;
      }

      // Check effective dates against the candidate start date in the quota's timezone
      const localParts = getZonedParts(startAt, quota.timezone);
      const localDateStr = localParts.dateString;

      if (quota.effectiveFrom && quota.effectiveFrom > localDateStr) {
        continue;
      }
      if (quota.effectiveTo && quota.effectiveTo < localDateStr) {
        continue;
      }

      // 5. Calculate period boundaries in the quota's authoritative timezone
      const periodBounds = getPeriodBounds(quota.period, startAt, quota.timezone);

      // 6. Aggregate existing consumed usage in this period window
      const consumed = await this.calculateConsumedUsage(quota, user._id, resource, periodBounds, excludeReservationId, session);

      const requested = quota.metric === QuotaMetric.BOOKING_COUNT ? 1 : candidateDurationMinutes;
      const totalAfterBooking = consumed + requested;

      if (totalAfterBooking > quota.limit) {
        return {
          allowed: false,
          violation: {
            quotaId: quota._id.toString(),
            quotaName: quota.name,
            scopeType: quota.scopeType,
            subjectType: quota.subjectType,
            metric: quota.metric,
            period: quota.period,
            limit: quota.limit,
            consumed,
            requested,
            remaining: Math.max(0, quota.limit - consumed),
          },
        };
      }
    }

    return { allowed: true };
  }

  /**
   * Aggregates consumed quota metrics (booking count or duration) within a period window.
   */
  private static async calculateConsumedUsage(
    quota: IQuota,
    userId: Types.ObjectId,
    resource: { _id: Types.ObjectId; resourceType: Types.ObjectId },
    bounds: { startAt: Date; endAt: Date },
    excludeReservationId?: string | Types.ObjectId,
    session?: ClientSession
  ): Promise<number> {
    // Determine which reservations count towards this quota:
    // Statuses that represent consumed quota (active + completed)
    const countedStatuses = [
      ...ACTIVE_RESERVATION_STATES,
      ReservationStatus.COMPLETED,
    ];

    // Base query: time interval overlap with quota period window
    // startAt < bounds.endAt AND endAt > bounds.startAt
    const query: Record<string, unknown> = {
      status: { $in: countedStatuses },
      startAt: { $lt: bounds.endAt },
      endAt: { $gt: bounds.startAt },
    };

    if (excludeReservationId) {
      query._id = { $ne: new Types.ObjectId(excludeReservationId) };
    }

    // Scope filter
    if (quota.scopeType === QuotaScopeType.RESOURCE) {
      query.resource = resource._id;
    } else if (quota.scopeType === QuotaScopeType.RESOURCE_TYPE) {
      // Find all resources of this resourceType
      const resourcesOfType = await Resource.find({ resourceType: resource.resourceType }, { _id: 1 }).session(session || null).lean();
      const resourceIds = resourcesOfType.map((r) => r._id);
      query.resource = { $in: resourceIds };
    }

    // Subject filter
    if (quota.subjectType === QuotaSubjectType.USER) {
      query.user = userId;
    } else if (quota.subjectType === QuotaSubjectType.ROLE) {
      // Find all users who currently possess this role
      const usersWithRole = await User.find({ roles: quota.role }, { _id: 1 }).session(session || null).lean();
      const userIds = usersWithRole.map((u) => u._id);
      query.user = { $in: userIds };
    } else if (quota.subjectType === QuotaSubjectType.DEPARTMENT) {
      // Find all users belonging to this department (collated/case-insensitive match)
      const deptNormalized = normalizeDepartmentName(quota.department);
      const deptRegex = new RegExp(`^${deptNormalized?.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`, 'i');
      const usersInDept = await User.find({ department: deptRegex }, { _id: 1 }).session(session || null).lean();
      const userIds = usersInDept.map((u) => u._id);
      query.user = { $in: userIds };
    }

    // Retrieve matching reservations
    const reservations = await Reservation.find(query, { startAt: 1, endAt: 1 }).session(session || null).lean();

    if (quota.metric === QuotaMetric.BOOKING_COUNT) {
      return reservations.length;
    }

    if (quota.metric === QuotaMetric.DURATION_MINUTES) {
      return reservations.reduce((total, res) => {
        // Calculate clamped overlap with period bounds to be exact
        const effectiveStart = Math.max(res.startAt.getTime(), bounds.startAt.getTime());
        const effectiveEnd = Math.min(res.endAt.getTime(), bounds.endAt.getTime());
        const minutes = Math.max(0, Math.round((effectiveEnd - effectiveStart) / 60000));
        return total + minutes;
      }, 0);
    }

    return 0;
  }
}
