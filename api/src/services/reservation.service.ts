/**
 * CampusFlow API - Reservation Domain Service
 * Authoritative business logic for reservation lifecycle, ACID transactional booking creation,
 * concurrency-safe write path, conflict resolution, cancellation, and status transitions.
 */

import mongoose, { Types } from 'mongoose';
import crypto from 'crypto';
import { env } from '../config/env';
import { tokenRateLimiter } from '../utils/rateLimiter';
import {
  Reservation,
  type IReservation,
  type ReservationDocument,
  type IApprovalChainStepSnapshot,
  ReservationStatus,
  type ReservationStatusType,
  isValidReservationTransition,
  User,
  type UserRoleType,
  UserRole,
  Resource,
  ResourceStatus,
  isValidIanaTimezone,
  ApproverRole,
  type ApproverRoleType,
} from '../models';
import { AvailabilityService } from './availability.service';
import { QuotaService } from './quota.service';
import { ApprovalPolicyService } from './approvalPolicy.service';
import {
  AppError,
  BadRequestError,
  NotFoundError,
  ConflictError,
  ForbiddenError,
  ValidationError,
} from '../utils/errors';

export interface CreateReservationParams {
  resourceId: string | Types.ObjectId;
  userId: string | Types.ObjectId;
  startAt: Date | string;
  endAt: Date | string;
  timezone: string;
  title: string;
  description?: string;
  metadata?: Record<string, unknown>;
}

export interface TransitionStatusParams {
  reservationId: string | Types.ObjectId;
  targetStatus: ReservationStatusType;
  actorId?: string | Types.ObjectId;
  reason?: string;
}

export interface ListReservationsFilter {
  resourceId?: string | Types.ObjectId;
  userId?: string | Types.ObjectId;
  status?: ReservationStatusType | ReservationStatusType[];
  startAt?: Date | string;
  endAt?: Date | string;
  page?: number;
  limit?: number;
}

export interface PaginatedReservations {
  items: IReservation[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}

export interface CheckInTokenResult {
  token: string;
  expiresAt: string;
  resourceId: string;
  validFrom: string;
  validUntil: string;
}

export class ReservationService {
  /**
   * Concurrency-safe, transactional reservation creation.
   * Serializes write access per Resource inside a MongoDB transaction to prevent write-skew / phantom reads,
   * enforces AvailabilityRules, Blackouts, Quotas, and physical unique slot indexes.
   */
  public static async createReservation(params: CreateReservationParams): Promise<ReservationDocument> {
    const {
      resourceId,
      userId,
      timezone,
      title,
      description,
      metadata,
    } = params;

    // 1. Parameter normalization & basic validation
    const startAt = params.startAt instanceof Date ? params.startAt : new Date(params.startAt);
    const endAt = params.endAt instanceof Date ? params.endAt : new Date(params.endAt);

    if (isNaN(startAt.getTime()) || isNaN(endAt.getTime())) {
      throw new BadRequestError('startAt and endAt must be valid ISO Date representations');
    }

    if (startAt.getTime() >= endAt.getTime()) {
      throw new BadRequestError('startAt must be earlier than endAt for half-open interval [startAt, endAt)');
    }

    if (!isValidIanaTimezone(timezone)) {
      throw new BadRequestError(`Invalid IANA timezone identifier: "${timezone}"`);
    }

    if (!title || typeof title !== 'string' || title.trim().length < 2) {
      throw new BadRequestError('Title is required and must be at least 2 characters');
    }

    // 2. Execute within ACID Transaction with Resource Document Serialization
    const session = await mongoose.startSession();

    try {
      let createdDoc: ReservationDocument | null = null;

      await session.withTransaction(async () => {
        // Step A: Acquire write lock on Resource by incrementing version
        // This serializes all concurrent bookings attempting to book this same resource
        const resource = await Resource.findByIdAndUpdate(
          resourceId,
          { $inc: { __v: 1 } },
          { session, returnDocument: 'after' }
        ).lean();

        if (!resource) {
          throw new NotFoundError('Resource not found');
        }

        if (!resource.isActive || resource.status !== ResourceStatus.ACTIVE) {
          throw new BadRequestError(`Resource is currently ${resource.status || 'INACTIVE'} and unavailable for bookings`);
        }

        // Step B: Validate User existence and active status
        const user = await User.findById(userId).session(session).lean();
        if (!user) {
          throw new NotFoundError('User not found');
        }

        if (!user.isActive) {
          throw new BadRequestError('User account is currently inactive and cannot make reservations');
        }

        // Step B.2: Dynamic No-Show Strike Restriction (Phase 3.3)
        const noShowWindowStart = new Date(Date.now() - env.NO_SHOW_WINDOW_DAYS * 24 * 60 * 60 * 1000);
        const qualifyingNoShows = await Reservation.countDocuments({
          user: user._id,
          status: ReservationStatus.NO_SHOW,
          startAt: { $gte: noShowWindowStart },
          noShowPardoned: { $ne: true },
        }).session(session);

        if (qualifyingNoShows >= env.NO_SHOW_STRIKE_THRESHOLD) {
          const latestNoShow = await Reservation.findOne({
            user: user._id,
            status: ReservationStatus.NO_SHOW,
            startAt: { $gte: noShowWindowStart },
            noShowPardoned: { $ne: true },
          })
            .sort({ startAt: -1 })
            .select('startAt autoReleasedAt')
            .session(session)
            .lean();

          const refDate = (latestNoShow?.autoReleasedAt || latestNoShow?.startAt || new Date()).getTime();
          const suspensionExpiresAt = refDate + env.NO_SHOW_SUSPENSION_DAYS * 24 * 60 * 60 * 1000;

          if (Date.now() < suspensionExpiresAt) {
            throw new AppError(
              409,
              'NO_SHOW_RESTRICTION_ACTIVE',
              `User has accumulated ${qualifyingNoShows} unexcused no-shows in the last ${env.NO_SHOW_WINDOW_DAYS} days. Booking privileges are suspended until ${new Date(suspensionExpiresAt).toISOString()}.`
            );
          }
        }

        // Step C: Authoritative Availability check within transaction
        const availability = await AvailabilityService.checkAvailability({
          resourceId: resource._id,
          startAt,
          endAt,
          session,
        });

        if (!availability.available) {
          if (
            availability.reason === 'RESERVATION_CONFLICT' ||
            availability.reason === 'BLACKOUT_CONFLICT' ||
            availability.reason === 'TIMETABLE_CONFLICT'
          ) {
            throw new ConflictError(
              availability.message || 'The requested time slot conflicts with an existing reservation, blackout, or timetable',
              availability.details
            );
          }
          throw new BadRequestError(
            availability.message || 'The requested time slot is outside allowed operating parameters',
            availability.details
          );
        }

        // Step D: Authoritative Quota check within transaction
        const quotaEvaluation = await QuotaService.evaluateQuotas({
          userId: user._id,
          resourceId: resource._id,
          startAt,
          endAt,
          session,
        });

        if (!quotaEvaluation.allowed) {
          throw new ConflictError(
            `Quota limit exceeded: "${quotaEvaluation.violation?.quotaName || 'Booking Quota Exceeded'}"`,
            quotaEvaluation.violation
          );
        }

        // Step E: Authoritative Approval Policy Resolution within transaction
        const policyResult = await ApprovalPolicyService.evaluatePolicyForBooking({
          resourceId: resource._id,
          resourceTypeId: resource.resourceType,
          userRoles: user.roles,
          session,
        });

        let initialStatus: ReservationStatusType = ReservationStatus.CONFIRMED;
        let policyId: Types.ObjectId | null = null;
        let currentStepOrder: number | null = null;
        let currentApproverRole: ApproverRoleType | null = null;
        let activeStepDeadline: Date | null = null;
        let approvalChainSnapshot: IApprovalChainStepSnapshot[] = [];

        if (policyResult.requiresApproval && policyResult.approvalChain && policyResult.approvalChain.length > 0) {
          initialStatus = ReservationStatus.PENDING;
          policyId = policyResult.policyId || null;
          currentStepOrder = 1;
          currentApproverRole = policyResult.approvalChain[0].approverRole;

          const now = new Date();
          const firstStepTimeout = policyResult.approvalChain[0].timeoutHours;
          activeStepDeadline = firstStepTimeout
            ? new Date(now.getTime() + firstStepTimeout * 3600000)
            : null;

          approvalChainSnapshot = policyResult.approvalChain.map((step, idx) => ({
            stepOrder: step.stepOrder,
            approverRole: step.approverRole,
            timeoutHours: step.timeoutHours,
            stepStartedAt: idx === 0 ? now : null,
            stepDeadline: idx === 0 ? activeStepDeadline : null,
            status: 'PENDING',
            actionedBy: null,
            actionedAt: null,
            comment: null,
            isOverride: false,
            actorRoleUsed: null,
          }));
        }

        // Step F: Insert Reservation
        const newReservation = new Reservation({
          resource: resource._id,
          user: user._id,
          startAt,
          endAt,
          timezone,
          status: initialStatus,
          title: title.trim(),
          description: description?.trim(),
          policyId,
          currentStepOrder,
          currentApproverRole,
          activeStepDeadline,
          approvalChain: approvalChainSnapshot,
          metadata,
        });

        await newReservation.save({ session });
        createdDoc = newReservation;
      });

      if (!createdDoc) {
        throw new BadRequestError('Failed to create reservation within transaction');
      }

      return createdDoc;
    } catch (error: unknown) {
      // Gracefully handle duplicate key error (code 11000) from partial unique index
      if (typeof error === 'object' && error !== null && 'code' in error && (error as { code: number }).code === 11000) {
        throw new ConflictError('The requested time slot has already been booked by another reservation');
      }
      throw error;
    } finally {
      await session.endSession();
    }
  }

  /**
   * Cancels an active reservation, enforcing state machine transition constraints.
   */
  public static async cancelReservation(
    reservationId: string | Types.ObjectId,
    userId?: string | Types.ObjectId,
    reason?: string
  ): Promise<ReservationDocument> {
    const reservation = await Reservation.findById(reservationId);
    if (!reservation) {
      throw new NotFoundError('Reservation not found');
    }

    if (!isValidReservationTransition(reservation.status, ReservationStatus.CANCELLED)) {
      throw new ConflictError(
        `Cannot cancel reservation in terminal or invalid state: ${reservation.status}`
      );
    }

    reservation.status = ReservationStatus.CANCELLED;
    if (userId) {
      reservation.cancelledBy = new Types.ObjectId(userId);
    }
    reservation.cancelledAt = new Date();
    if (reason) {
      reservation.cancellationReason = reason.trim();
    }
    reservation.currentStepOrder = null;
    reservation.currentApproverRole = null;
    reservation.activeStepDeadline = null;

    await reservation.save();
    return reservation;
  }

  /**
   * Phase 3.2: Approves the active step of a pending reservation.
   * Executes atomic conditional update with predicate locking, Four-Eyes enforcement,
   * and optional/mandatory comment handling.
   */
  public static async approveReservationStep(params: {
    reservationId: string | Types.ObjectId;
    user: { id: string; roles: UserRoleType[]; department?: string };
    comment?: string;
    expectedStepOrder?: number;
  }): Promise<ReservationDocument> {
    const { reservationId, user, comment, expectedStepOrder } = params;
    const session = await mongoose.startSession();

    try {
      let committedDoc: ReservationDocument | null = null;

      await session.withTransaction(async () => {
        const reservation = await Reservation.findById(reservationId).session(session);
        if (!reservation) {
          throw new NotFoundError('Reservation not found');
        }

        if (reservation.status !== ReservationStatus.PENDING) {
          throw new ConflictError(
            `Cannot approve reservation with status "${reservation.status}". Reservation must be in PENDING state.`
          );
        }

        const activeOrder = reservation.currentStepOrder;
        if (!activeOrder) {
          throw new ConflictError('Reservation does not have an active approval step');
        }

        if (expectedStepOrder !== undefined && expectedStepOrder !== activeOrder) {
          throw new ConflictError(
            `Active approval step order (${activeOrder}) does not match expected step order (${expectedStepOrder})`
          );
        }

        const activeStepIndex = reservation.approvalChain.findIndex((s) => s.stepOrder === activeOrder);
        if (activeStepIndex === -1) {
          throw new ConflictError(`Active step order ${activeOrder} not found in approval chain`);
        }

        const activeStep = reservation.approvalChain[activeStepIndex];
        if (activeStep.status !== 'PENDING') {
          throw new ConflictError('Active approval step is not in PENDING state');
        }

        // 3. Absolute Separation of Duties (Four-Eyes Principle)
        if (reservation.user.toString() === user.id.toString()) {
          throw new ValidationError(
            'Separation of duties violation: The booking creator cannot approve their own booking.'
          );
        }

        const priorApproverIds = reservation.approvalChain
          .filter((s) => s.status === 'APPROVED' && s.actionedBy)
          .map((s) => s.actionedBy!.toString());

        if (priorApproverIds.includes(user.id.toString())) {
          throw new ValidationError(
            'Separation of duties violation: An actor who approved a prior step cannot approve subsequent steps on the same reservation.'
          );
        }

        // 4. Role Authorization & Override Determination
        const isAdmin = user.roles.includes(UserRole.ADMIN);
        const holdsStepRole = user.roles.includes(activeStep.approverRole);

        let isCrossDept = false;
        if (activeStep.approverRole === ApproverRole.DEPARTMENT_HEAD) {
          const requester = await User.findById(reservation.user).select('department').session(session).lean();
          if (requester?.department !== user.department) {
            isCrossDept = true;
          }
        }

        let isOverride = false;
        let actorRoleUsed: UserRoleType = activeStep.approverRole;

        if (holdsStepRole && !isCrossDept) {
          // Normal Domain Approval
          isOverride = false;
          actorRoleUsed = activeStep.approverRole;
        } else if (isAdmin) {
          // ADMIN Universal Override
          isOverride = true;
          actorRoleUsed = UserRole.ADMIN;

          // Enforce mandatory comment for ADMIN override (min 5, max 500)
          if (!comment || comment.trim().length < 5) {
            throw new ValidationError(
              'Administrative override requires a mandatory justification comment (minimum 5 characters).'
            );
          }
        } else {
          if (isCrossDept) {
            throw new ForbiddenError(
              'Department Heads can only approve reservations within their department'
            );
          }
          throw new ForbiddenError(
            `User lacks the required role (${activeStep.approverRole}) to approve this step`
          );
        }

        // 5. Step Progression Math
        const totalSteps = reservation.approvalChain.length;
        const isFinalStep = activeOrder === totalSteps;
        const now = new Date();

        let nextStepOrder: number | null = null;
        let nextApproverRole: ApproverRoleType | null = null;
        let nextStepDeadline: Date | null = null;

        if (!isFinalStep) {
          nextStepOrder = activeOrder + 1;
          const nextStepConfig = reservation.approvalChain.find((s) => s.stepOrder === nextStepOrder);
          if (nextStepConfig) {
            nextApproverRole = nextStepConfig.approverRole;
            nextStepDeadline = nextStepConfig.timeoutHours
              ? new Date(now.getTime() + nextStepConfig.timeoutHours * 3600000)
              : null;
          }
        }

        // 6. Predicate-Locked Atomic Update
        const updateQuery: Record<string, unknown> = {
          _id: reservation._id,
          status: ReservationStatus.PENDING,
          currentStepOrder: activeOrder,
          ...(reservation.__v !== undefined ? { __v: reservation.__v } : {}),
        };

        const updateSet: Record<string, unknown> = {
          [`approvalChain.${activeStepIndex}.status`]: 'APPROVED',
          [`approvalChain.${activeStepIndex}.actionedBy`]: new Types.ObjectId(user.id),
          [`approvalChain.${activeStepIndex}.actionedAt`]: now,
          [`approvalChain.${activeStepIndex}.comment`]: comment?.trim() || null,
          [`approvalChain.${activeStepIndex}.isOverride`]: isOverride,
          [`approvalChain.${activeStepIndex}.actorRoleUsed`]: actorRoleUsed,
        };

        if (!isFinalStep && nextStepOrder) {
          const nextIndex = activeStepIndex + 1;
          updateSet[`approvalChain.${nextIndex}.stepStartedAt`] = now;
          updateSet[`approvalChain.${nextIndex}.stepDeadline`] = nextStepDeadline;
          updateSet.currentStepOrder = nextStepOrder;
          updateSet.currentApproverRole = nextApproverRole;
          updateSet.activeStepDeadline = nextStepDeadline;
        } else {
          // Final step -> CONFIRMED
          updateSet.status = ReservationStatus.CONFIRMED;
          updateSet.approvedBy = new Types.ObjectId(user.id);
          updateSet.approvedAt = now;
          updateSet.currentStepOrder = null;
          updateSet.currentApproverRole = null;
          updateSet.activeStepDeadline = null;
        }

        const updated = await Reservation.findOneAndUpdate(
          updateQuery,
          {
            $set: updateSet,
            $inc: { __v: 1 },
          },
          { session, returnDocument: 'after' }
        );

        if (!updated) {
          throw new ConflictError(
            'Reservation was concurrently modified or approved by another actor. Please refresh and try again.'
          );
        }

        committedDoc = updated;
      });

      return committedDoc!;
    } finally {
      await session.endSession();
    }
  }

  /**
   * Phase 3.2: Rejects a pending reservation, releasing slot capacity immediately.
   */
  public static async rejectReservationStep(params: {
    reservationId: string | Types.ObjectId;
    user: { id: string; roles: UserRoleType[]; department?: string };
    reason: string;
    expectedStepOrder?: number;
  }): Promise<ReservationDocument> {
    const { reservationId, user, reason, expectedStepOrder } = params;

    if (!reason || typeof reason !== 'string' || reason.trim().length < 5 || reason.trim().length > 500) {
      throw new ValidationError('Rejection reason must be between 5 and 500 characters');
    }

    const session = await mongoose.startSession();

    try {
      let committedDoc: ReservationDocument | null = null;

      await session.withTransaction(async () => {
        const reservation = await Reservation.findById(reservationId).session(session);
        if (!reservation) {
          throw new NotFoundError('Reservation not found');
        }

        if (reservation.status !== ReservationStatus.PENDING) {
          throw new ConflictError(
            `Cannot reject reservation with status "${reservation.status}". Reservation must be in PENDING state.`
          );
        }

        const activeOrder = reservation.currentStepOrder;
        if (!activeOrder) {
          throw new ConflictError('Reservation does not have an active approval step');
        }

        if (expectedStepOrder !== undefined && expectedStepOrder !== activeOrder) {
          throw new ConflictError(
            `Active approval step order (${activeOrder}) does not match expected step order (${expectedStepOrder})`
          );
        }

        const activeStepIndex = reservation.approvalChain.findIndex((s) => s.stepOrder === activeOrder);
        if (activeStepIndex === -1) {
          throw new ConflictError(`Active step order ${activeOrder} not found in approval chain`);
        }

        const activeStep = reservation.approvalChain[activeStepIndex];
        if (activeStep.status !== 'PENDING') {
          throw new ConflictError('Active approval step is not in PENDING state');
        }

        // Four-Eyes check: An actor who approved a prior step cannot reject later step
        const priorApproverIds = reservation.approvalChain
          .filter((s) => s.status === 'APPROVED' && s.actionedBy)
          .map((s) => s.actionedBy!.toString());

        if (priorApproverIds.includes(user.id.toString())) {
          throw new ValidationError(
            'Separation of duties violation: An actor who approved a prior step cannot action subsequent steps on the same reservation.'
          );
        }

        // Role & Department Scoping
        const isAdmin = user.roles.includes(UserRole.ADMIN);
        const holdsStepRole = user.roles.includes(activeStep.approverRole);

        let isCrossDept = false;
        if (activeStep.approverRole === ApproverRole.DEPARTMENT_HEAD) {
          const requester = await User.findById(reservation.user).select('department').session(session).lean();
          if (requester?.department !== user.department) {
            isCrossDept = true;
          }
        }

        let isOverride = false;
        let actorRoleUsed: UserRoleType = activeStep.approverRole;

        if (holdsStepRole && !isCrossDept) {
          isOverride = false;
          actorRoleUsed = activeStep.approverRole;
        } else if (isAdmin) {
          isOverride = true;
          actorRoleUsed = UserRole.ADMIN;
        } else {
          if (isCrossDept) {
            throw new ForbiddenError(
              'Department Heads can only reject reservations within their department'
            );
          }
          throw new ForbiddenError(
            `User lacks the required role (${activeStep.approverRole}) to reject this step`
          );
        }

        const now = new Date();

        const updateQuery: Record<string, unknown> = {
          _id: reservation._id,
          status: ReservationStatus.PENDING,
          currentStepOrder: activeOrder,
          ...(reservation.__v !== undefined ? { __v: reservation.__v } : {}),
        };

        const updateSet: Record<string, unknown> = {
          [`approvalChain.${activeStepIndex}.status`]: 'REJECTED',
          [`approvalChain.${activeStepIndex}.actionedBy`]: new Types.ObjectId(user.id),
          [`approvalChain.${activeStepIndex}.actionedAt`]: now,
          [`approvalChain.${activeStepIndex}.comment`]: reason.trim(),
          [`approvalChain.${activeStepIndex}.isOverride`]: isOverride,
          [`approvalChain.${activeStepIndex}.actorRoleUsed`]: actorRoleUsed,
          status: ReservationStatus.REJECTED,
          rejectedBy: new Types.ObjectId(user.id),
          rejectedAt: now,
          rejectionReason: reason.trim(),
          currentStepOrder: null,
          currentApproverRole: null,
          activeStepDeadline: null,
        };

        const updated = await Reservation.findOneAndUpdate(
          updateQuery,
          {
            $set: updateSet,
            $inc: { __v: 1 },
          },
          { session, returnDocument: 'after' }
        );

        if (!updated) {
          throw new ConflictError(
            'Reservation was concurrently modified by another actor. Please refresh and try again.'
          );
        }

        committedDoc = updated;
      });

      return committedDoc!;
    } finally {
      await session.endSession();
    }
  }

  /**
   * Applies an authoritative lifecycle state transition to a reservation.
   */
  public static async transitionStatus(params: TransitionStatusParams): Promise<ReservationDocument> {
    const { reservationId, targetStatus, actorId, reason } = params;

    const reservation = await Reservation.findById(reservationId);
    if (!reservation) {
      throw new NotFoundError('Reservation not found');
    }

    if (!isValidReservationTransition(reservation.status, targetStatus)) {
      throw new ConflictError(
        `Invalid reservation status transition from ${reservation.status} to ${targetStatus}`
      );
    }

    // Apply state-specific audit tracking
    if (targetStatus === ReservationStatus.CONFIRMED) {
      if (actorId) reservation.approvedBy = new Types.ObjectId(actorId);
      reservation.approvedAt = new Date();
    } else if (targetStatus === ReservationStatus.REJECTED) {
      if (actorId) reservation.rejectedBy = new Types.ObjectId(actorId);
      reservation.rejectedAt = new Date();
      if (reason) reservation.rejectionReason = reason.trim();
    } else if (targetStatus === ReservationStatus.CHECKED_IN) {
      reservation.checkInAt = new Date();
    } else if (targetStatus === ReservationStatus.COMPLETED) {
      reservation.checkOutAt = new Date();
    } else if (targetStatus === ReservationStatus.CANCELLED) {
      if (actorId) reservation.cancelledBy = new Types.ObjectId(actorId);
      reservation.cancelledAt = new Date();
      if (reason) reservation.cancellationReason = reason.trim();
    } else if (targetStatus === ReservationStatus.NO_SHOW) {
      reservation.autoReleasedAt = new Date();
      if (reason) reservation.autoReleaseReason = reason.trim();
    }

    reservation.status = targetStatus;
    await reservation.save();
    return reservation;
  }

  /**
   * Retrieves a single reservation by ID.
   */
  public static async getReservationById(reservationId: string | Types.ObjectId): Promise<ReservationDocument> {
    const reservation = await Reservation.findById(reservationId)
      .populate('resource', 'name code location status capacity')
      .populate('user', 'firstName lastName email department roles');

    if (!reservation) {
      throw new NotFoundError('Reservation not found');
    }

    return reservation;
  }

  /**
   * Lists reservations with flexible filtering, range overlap queries, and pagination.
   */
  public static async listReservations(filter: ListReservationsFilter): Promise<PaginatedReservations> {
    const query: Record<string, unknown> = {};

    if (filter.resourceId) {
      query.resource = new Types.ObjectId(filter.resourceId);
    }

    if (filter.userId) {
      query.user = new Types.ObjectId(filter.userId);
    }

    if (filter.status) {
      query.status = Array.isArray(filter.status) ? { $in: filter.status } : filter.status;
    }

    if (filter.startAt || filter.endAt) {
      if (filter.startAt && filter.endAt) {
        // Overlap query: startAt < filter.endAt && endAt > filter.startAt
        const s = filter.startAt instanceof Date ? filter.startAt : new Date(filter.startAt);
        const e = filter.endAt instanceof Date ? filter.endAt : new Date(filter.endAt);
        query.startAt = { $lt: e };
        query.endAt = { $gt: s };
      } else if (filter.startAt) {
        const s = filter.startAt instanceof Date ? filter.startAt : new Date(filter.startAt);
        query.endAt = { $gt: s };
      } else if (filter.endAt) {
        const e = filter.endAt instanceof Date ? filter.endAt : new Date(filter.endAt);
        query.startAt = { $lt: e };
      }
    }

    const page = Math.max(1, filter.page || 1);
    const limit = Math.min(100, Math.max(1, filter.limit || 20));
    const skip = (page - 1) * limit;

    const [items, total] = await Promise.all([
      Reservation.find(query)
        .populate('resource', 'name code location status capacity')
        .populate('user', 'firstName lastName email department roles')
        .sort({ startAt: -1 })
        .skip(skip)
        .limit(limit)
        .lean(),
      Reservation.countDocuments(query),
    ]);

    return {
      items: items as unknown as IReservation[],
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit),
    };
  }

  /**
   * Phase 3.3: Generates an ephemeral check-in token for a confirmed reservation.
   * Enforces ownership/ADMIN anti-enumeration 404 policy, status validation,
   * live operational time window, 5 req/min rate limiting, and atomic token invalidation.
   */
  public static async generateCheckInToken(
    reservationId: string | Types.ObjectId,
    userId: string,
    isAdmin: boolean
  ): Promise<CheckInTokenResult> {
    const reservation = await Reservation.findById(reservationId);
    if (!reservation) {
      throw new AppError(404, 'RESERVATION_NOT_FOUND', 'Reservation not found');
    }

    // Anti-enumeration policy: Non-owners and non-admins receive identical 404
    const ownerId =
      reservation.user instanceof Types.ObjectId
        ? reservation.user.toString()
        : (reservation.user as any)?._id?.toString() || String(reservation.user);

    if (!isAdmin && ownerId !== userId.toString()) {
      throw new AppError(404, 'RESERVATION_NOT_FOUND', 'Reservation not found');
    }

    // Status validation
    if (reservation.status === ReservationStatus.CHECKED_IN) {
      throw new AppError(409, 'ALREADY_CHECKED_IN', 'Reservation has already been checked in');
    }

    if (reservation.status === ReservationStatus.PENDING) {
      throw new AppError(
        409,
        'RESERVATION_NOT_CONFIRMED',
        'Reservation is awaiting approval and cannot be checked in'
      );
    }

    if (reservation.status !== ReservationStatus.CONFIRMED) {
      throw new AppError(
        409,
        'INVALID_RESERVATION_STATUS',
        `Reservation is in ${reservation.status} status and cannot be checked in`
      );
    }

    // Server-time operational window validation: [start - early, start + grace]
    const now = new Date();
    const startAt = new Date(reservation.startAt);
    const endAt = new Date(reservation.endAt);
    const earlyWindowMs = env.CHECKIN_EARLY_MINUTES * 60000;
    const graceWindowMs = env.AUTO_RELEASE_GRACE_MINUTES * 60000;
    const validFrom = new Date(startAt.getTime() - earlyWindowMs);
    const validUntil = new Date(startAt.getTime() + graceWindowMs);

    if (now.getTime() < validFrom.getTime()) {
      throw new AppError(
        400,
        'CHECKIN_WINDOW_NOT_OPEN',
        `Check-in window opens ${env.CHECKIN_EARLY_MINUTES} minutes before booking start`
      );
    }

    if (now.getTime() > validUntil.getTime() || now.getTime() >= endAt.getTime()) {
      throw new AppError(
        400,
        'CHECKIN_WINDOW_EXPIRED',
        'Check-in window has expired; reservation has been auto-released'
      );
    }

    // Rate limiting: max 5 requests per reservation per 60 seconds
    const rateLimitKey = `token_gen:${reservation._id.toString()}`;
    if (tokenRateLimiter.isRateLimited(rateLimitKey, 5, 60000)) {
      throw new AppError(
        429,
        'RATE_LIMIT_EXCEEDED',
        'Too many check-in token requests. Please wait a minute before requesting a new token.'
      );
    }

    // Ephemeral token generation: 256 bits of entropy (32 bytes hex = 64 characters)
    const plaintextToken = crypto.randomBytes(32).toString('hex');
    const tokenHash = crypto.createHash('sha256').update(plaintextToken).digest('hex');
    const expiresAt = new Date(now.getTime() + 5 * 60 * 1000); // 5-minute TTL

    // Atomic update invalidating any previous token
    const updated = await Reservation.findOneAndUpdate(
      {
        _id: reservation._id,
        status: ReservationStatus.CONFIRMED,
      },
      {
        $set: {
          checkInTokenHash: tokenHash,
          checkInTokenExpiresAt: expiresAt,
        },
        $unset: {
          checkInTokenUsedAt: 1,
        },
      },
      { new: true }
    );

    if (!updated) {
      throw new AppError(
        409,
        'INVALID_RESERVATION_STATUS',
        'Reservation status changed concurrently. Please refresh.'
      );
    }

    const resourceId =
      reservation.resource && typeof reservation.resource === 'object' && '_id' in reservation.resource
        ? (reservation.resource as any)._id.toString()
        : String(reservation.resource);

    return {
      token: plaintextToken,
      expiresAt: expiresAt.toISOString(),
      resourceId,
      validFrom: validFrom.toISOString(),
      validUntil: validUntil.toISOString(),
    };
  }

  /**
   * Phase 3.3: Executes QR-based check-in with 10 sequential verification checks,
   * anti-enumeration 404 policy, idempotent re-scan reconciliation, and atomic status transition.
   */
  public static async checkIn(params: {
    reservationId: string | Types.ObjectId;
    userId: string;
    userRoles: UserRoleType[];
    token: string;
    scannedResourceId: string;
  }): Promise<{
    reservationId: string;
    status: ReservationStatusType;
    checkInAt: string;
    checkInMethod: string;
    isIdempotent?: boolean;
  }> {
    const { reservationId, userId, userRoles, token, scannedResourceId } = params;

    const reservation = await Reservation.findById(reservationId).select('+checkInTokenHash');
    if (!reservation) {
      throw new AppError(404, 'RESERVATION_NOT_FOUND', 'Reservation not found');
    }

    const ownerId =
      reservation.user instanceof Types.ObjectId
        ? reservation.user.toString()
        : (reservation.user as any)?._id?.toString() || String(reservation.user);

    const isOwner = ownerId === userId.toString();
    const isAdmin = userRoles.includes(UserRole.ADMIN);

    // Check c & b: Anti-Enumeration Policy (non-owners and non-admins receive identical 404)
    if (!isOwner && !isAdmin) {
      throw new AppError(404, 'RESERVATION_NOT_FOUND', 'Reservation not found');
    }

    // Helper for timing-safe hash comparison
    const incomingHash = crypto.createHash('sha256').update(token).digest('hex');
    const isMatchingToken = Boolean(
      reservation.checkInTokenHash &&
        reservation.checkInTokenHash.length === incomingHash.length &&
        crypto.timingSafeEqual(Buffer.from(incomingHash, 'hex'), Buffer.from(reservation.checkInTokenHash, 'hex'))
    );

    // Check i: Status & Idempotency Branching
    if (reservation.status === ReservationStatus.CHECKED_IN) {
      if (isMatchingToken && (isOwner || isAdmin)) {
        // Idempotent Return: Zero database writes occur
        return {
          reservationId: reservation._id.toString(),
          status: ReservationStatus.CHECKED_IN,
          checkInAt: reservation.checkInAt ? reservation.checkInAt.toISOString() : new Date().toISOString(),
          checkInMethod: reservation.checkInMethod || 'QR_SCAN',
          isIdempotent: true,
        };
      }
      throw new AppError(409, 'ALREADY_CHECKED_IN', 'Reservation has already been checked in');
    }

    if (reservation.status === ReservationStatus.PENDING) {
      throw new AppError(
        409,
        'RESERVATION_NOT_CONFIRMED',
        'Reservation is awaiting approval and cannot be checked in'
      );
    }

    if (reservation.status !== ReservationStatus.CONFIRMED) {
      throw new AppError(
        409,
        'INVALID_RESERVATION_STATUS',
        'Reservation is in a terminal status and cannot be checked in'
      );
    }

    // Check j: Server Time Boundaries
    const now = new Date();
    const startAt = new Date(reservation.startAt);
    const endAt = new Date(reservation.endAt);
    const earlyWindowMs = env.CHECKIN_EARLY_MINUTES * 60000;
    const graceWindowMs = env.AUTO_RELEASE_GRACE_MINUTES * 60000;
    const validFrom = new Date(startAt.getTime() - earlyWindowMs);
    const validUntil = new Date(startAt.getTime() + graceWindowMs);

    if (now.getTime() < validFrom.getTime()) {
      throw new AppError(
        400,
        'CHECKIN_WINDOW_NOT_OPEN',
        `Check-in window opens ${env.CHECKIN_EARLY_MINUTES} minutes before booking start`
      );
    }

    if (now.getTime() > validUntil.getTime() || now.getTime() >= endAt.getTime()) {
      throw new AppError(
        400,
        'CHECKIN_WINDOW_EXPIRED',
        'Check-in window has expired; reservation has been auto-released'
      );
    }

    // Check e & f: Physical Resource Binding
    const reservationResourceId =
      reservation.resource && typeof reservation.resource === 'object' && '_id' in reservation.resource
        ? (reservation.resource as any)._id.toString()
        : String(reservation.resource);

    if (reservationResourceId !== scannedResourceId) {
      throw new AppError(
        400,
        'RESOURCE_MISMATCH',
        'Scanned facility QR code does not match this reservation'
      );
    }

    // Check d, g & h: Token Cryptographic & Expiry Verification
    if (!isMatchingToken) {
      throw new AppError(400, 'INVALID_CHECKIN_TOKEN', 'Invalid check-in token supplied');
    }

    if (!reservation.checkInTokenExpiresAt || now.getTime() > reservation.checkInTokenExpiresAt.getTime()) {
      throw new AppError(
        400,
        'TOKEN_EXPIRED',
        'Check-in token has expired; please regenerate from your booking view'
      );
    }

    if (reservation.checkInTokenUsedAt != null) {
      throw new AppError(409, 'TOKEN_ALREADY_USED', 'Check-in token has already been consumed');
    }

    // Atomic Commit
    const updated = await Reservation.findOneAndUpdate(
      {
        _id: reservation._id,
        status: ReservationStatus.CONFIRMED,
        checkInTokenHash: reservation.checkInTokenHash,
        checkInTokenUsedAt: null,
      },
      {
        $set: {
          status: ReservationStatus.CHECKED_IN,
          checkInAt: now,
          checkedInBy: new Types.ObjectId(userId),
          checkInMethod: 'QR_SCAN',
          checkInTokenUsedAt: now,
        },
      },
      { new: true }
    );

    if (!updated) {
      // Re-read once and classify
      const refreshed = await Reservation.findById(reservation._id);
      if (refreshed?.status === ReservationStatus.CHECKED_IN && isMatchingToken) {
        return {
          reservationId: refreshed._id.toString(),
          status: ReservationStatus.CHECKED_IN,
          checkInAt: refreshed.checkInAt ? refreshed.checkInAt.toISOString() : now.toISOString(),
          checkInMethod: refreshed.checkInMethod || 'QR_SCAN',
          isIdempotent: true,
        };
      }
      throw new AppError(
        409,
        'INVALID_RESERVATION_STATUS',
        'Reservation status was concurrently modified'
      );
    }

    return {
      reservationId: updated._id.toString(),
      status: ReservationStatus.CHECKED_IN,
      checkInAt: updated.checkInAt ? updated.checkInAt.toISOString() : now.toISOString(),
      checkInMethod: 'QR_SCAN',
    };
  }

  /**
   * Phase 3.3: Admin manual staff override check-in with mandatory justification (10-500 chars).
   * Permitted up to endAt even after the automated grace window.
   */
  public static async manualCheckIn(params: {
    reservationId: string | Types.ObjectId;
    adminUserId: string;
    justification: string;
  }): Promise<{
    reservationId: string;
    status: ReservationStatusType;
    checkInAt: string;
    checkInMethod: string;
  }> {
    const { reservationId, adminUserId, justification } = params;

    const reservation = await Reservation.findById(reservationId);
    if (!reservation) {
      throw new AppError(404, 'RESERVATION_NOT_FOUND', 'Reservation not found');
    }

    if (reservation.status === ReservationStatus.CHECKED_IN) {
      throw new AppError(409, 'ALREADY_CHECKED_IN', 'Reservation has already been checked in');
    }

    if (reservation.status === ReservationStatus.PENDING) {
      throw new AppError(
        409,
        'RESERVATION_NOT_CONFIRMED',
        'Reservation is awaiting approval and cannot be checked in'
      );
    }

    if (reservation.status !== ReservationStatus.CONFIRMED) {
      throw new AppError(
        409,
        'INVALID_RESERVATION_STATUS',
        `Reservation is in ${reservation.status} status and cannot be checked in`
      );
    }

    const now = new Date();
    const startAt = new Date(reservation.startAt);
    const endAt = new Date(reservation.endAt);
    const earlyWindowMs = env.CHECKIN_EARLY_MINUTES * 60000;
    const validFrom = new Date(startAt.getTime() - earlyWindowMs);

    if (now.getTime() < validFrom.getTime()) {
      throw new AppError(
        400,
        'CHECKIN_WINDOW_NOT_OPEN',
        `Check-in window opens ${env.CHECKIN_EARLY_MINUTES} minutes before booking start`
      );
    }

    if (now.getTime() >= endAt.getTime()) {
      throw new AppError(
        400,
        'RESERVATION_ENDED',
        'Reservation time window has already ended'
      );
    }

    const trimmedJustification = justification.trim();
    if (trimmedJustification.length < 10 || trimmedJustification.length > 500) {
      throw new AppError(
        400,
        'VALIDATION_ERROR',
        'Justification must be between 10 and 500 characters'
      );
    }

    const updated = await Reservation.findOneAndUpdate(
      {
        _id: reservation._id,
        status: ReservationStatus.CONFIRMED,
      },
      {
        $set: {
          status: ReservationStatus.CHECKED_IN,
          checkInAt: now,
          checkedInBy: new Types.ObjectId(adminUserId),
          checkInMethod: 'ADMIN_MANUAL',
          checkInNotes: trimmedJustification,
        },
      },
      { new: true }
    );

    if (!updated) {
      throw new AppError(
        409,
        'INVALID_RESERVATION_STATUS',
        'Reservation status was concurrently modified'
      );
    }

    return {
      reservationId: updated._id.toString(),
      status: ReservationStatus.CHECKED_IN,
      checkInAt: updated.checkInAt ? updated.checkInAt.toISOString() : now.toISOString(),
      checkInMethod: 'ADMIN_MANUAL',
    };
  }

  /**
   * Phase 3.3: Early checkout / completion. Transitions from CHECKED_IN to COMPLETED,
   * setting checkOutAt and instantly freeing slot capacity.
   */
  public static async checkout(params: {
    reservationId: string | Types.ObjectId;
    userId: string;
    userRoles: UserRoleType[];
  }): Promise<{
    reservationId: string;
    status: ReservationStatusType;
    checkOutAt: string;
  }> {
    const { reservationId, userId, userRoles } = params;

    const reservation = await Reservation.findById(reservationId);
    if (!reservation) {
      throw new AppError(404, 'RESERVATION_NOT_FOUND', 'Reservation not found');
    }

    const ownerId =
      reservation.user instanceof Types.ObjectId
        ? reservation.user.toString()
        : (reservation.user as any)?._id?.toString() || String(reservation.user);

    const isOwner = ownerId === userId.toString();
    const isAdmin = userRoles.includes(UserRole.ADMIN);

    if (!isOwner && !isAdmin) {
      throw new AppError(404, 'RESERVATION_NOT_FOUND', 'Reservation not found');
    }

    if (reservation.status !== ReservationStatus.CHECKED_IN) {
      throw new AppError(
        409,
        'INVALID_RESERVATION_STATUS',
        'Only checked-in reservations can be checked out'
      );
    }

    const now = new Date();
    const updated = await Reservation.findOneAndUpdate(
      {
        _id: reservation._id,
        status: ReservationStatus.CHECKED_IN,
      },
      {
        $set: {
          status: ReservationStatus.COMPLETED,
          checkOutAt: now,
        },
      },
      { new: true }
    );

    if (!updated) {
      throw new AppError(
        409,
        'INVALID_RESERVATION_STATUS',
        'Reservation status was concurrently modified'
      );
    }

    return {
      reservationId: updated._id.toString(),
      status: ReservationStatus.COMPLETED,
      checkOutAt: updated.checkOutAt ? updated.checkOutAt.toISOString() : now.toISOString(),
    };
  }

  /**
   * Phase 3.3: Administrative pardon for a NO_SHOW reservation.
   * Clears the strike from dynamic quota/suspension evaluations.
   */
  public static async pardonNoShow(params: {
    reservationId: string | Types.ObjectId;
    adminUserId: string;
    reason: string;
  }): Promise<{
    reservationId: string;
    status: ReservationStatusType;
    noShowPardoned: boolean;
    noShowPardonedBy: string;
    noShowPardonReason: string;
  }> {
    const { reservationId, adminUserId, reason } = params;

    const reservation = await Reservation.findById(reservationId);
    if (!reservation) {
      throw new AppError(404, 'RESERVATION_NOT_FOUND', 'Reservation not found');
    }

    if (reservation.status !== ReservationStatus.NO_SHOW) {
      throw new AppError(
        409,
        'PARDON_NOT_ALLOWED',
        'Only reservations in NO_SHOW status can be pardoned'
      );
    }

    if (reservation.noShowPardoned === true) {
      throw new AppError(
        409,
        'ALREADY_PARDONED',
        'Reservation has already been pardoned'
      );
    }

    const trimmedReason = reason.trim();
    if (trimmedReason.length < 10 || trimmedReason.length > 500) {
      throw new AppError(
        400,
        'VALIDATION_ERROR',
        'Pardon reason must be between 10 and 500 characters'
      );
    }

    const updated = await Reservation.findOneAndUpdate(
      {
        _id: reservation._id,
        status: ReservationStatus.NO_SHOW,
        noShowPardoned: { $ne: true },
      },
      {
        $set: {
          noShowPardoned: true,
          noShowPardonedBy: new Types.ObjectId(adminUserId),
          noShowPardonReason: trimmedReason,
        },
      },
      { new: true }
    );

    if (!updated) {
      throw new AppError(
        409,
        'INVALID_RESERVATION_STATUS',
        'Reservation was concurrently modified'
      );
    }

    return {
      reservationId: updated._id.toString(),
      status: ReservationStatus.NO_SHOW,
      noShowPardoned: true,
      noShowPardonedBy: adminUserId,
      noShowPardonReason: updated.noShowPardonReason || trimmedReason,
    };
  }
}
