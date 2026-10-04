/**
 * CampusFlow API - Reservation Model & State Machine
 * Represents a scheduled resource booking with complete lifecycle tracking,
 * approval hierarchy, check-in timestamps, and timezone context.
 *
 * TIME SEMANTICS:
 * Reservations represent half-open UTC timestamp intervals [startAt, endAt)
 * where startAt is inclusive and endAt is exclusive (startAt < endAt).
 */

import mongoose, { Schema, type Model, type HydratedDocument, type Types } from 'mongoose';
import { isValidIanaTimezone } from './availabilityRule.model';
import { type ApproverRoleType, VALID_APPROVER_ROLES } from './approvalPolicy.model';
import { type UserRoleType } from './user.model';

export const ReservationStatus = {
  PENDING: 'PENDING',
  CONFIRMED: 'CONFIRMED',
  CHECKED_IN: 'CHECKED_IN',
  COMPLETED: 'COMPLETED',
  CANCELLED: 'CANCELLED',
  REJECTED: 'REJECTED',
  EXPIRED: 'EXPIRED',
  NO_SHOW: 'NO_SHOW',
} as const;

export type ReservationStatusType = (typeof ReservationStatus)[keyof typeof ReservationStatus];

/**
 * Active reservation states that block availability and occupy capacity.
 */
export const ACTIVE_RESERVATION_STATES: readonly ReservationStatusType[] = [
  ReservationStatus.PENDING,
  ReservationStatus.CONFIRMED,
  ReservationStatus.CHECKED_IN,
] as const;

/**
 * Terminal states that cannot transition to any other state.
 */
export const TERMINAL_RESERVATION_STATES: readonly ReservationStatusType[] = [
  ReservationStatus.COMPLETED,
  ReservationStatus.CANCELLED,
  ReservationStatus.REJECTED,
  ReservationStatus.EXPIRED,
  ReservationStatus.NO_SHOW,
] as const;

/**
 * Valid state transitions for the reservation lifecycle.
 */
export const VALID_STATUS_TRANSITIONS: Readonly<Record<ReservationStatusType, readonly ReservationStatusType[]>> = {
  [ReservationStatus.PENDING]: [
    ReservationStatus.CONFIRMED,
    ReservationStatus.REJECTED,
    ReservationStatus.CANCELLED,
    ReservationStatus.EXPIRED,
  ],
  [ReservationStatus.CONFIRMED]: [
    ReservationStatus.CHECKED_IN,
    ReservationStatus.COMPLETED,
    ReservationStatus.CANCELLED,
    ReservationStatus.EXPIRED,
    ReservationStatus.NO_SHOW,
  ],
  [ReservationStatus.CHECKED_IN]: [
    ReservationStatus.COMPLETED,
    ReservationStatus.CANCELLED,
  ],
  [ReservationStatus.COMPLETED]: [],
  [ReservationStatus.CANCELLED]: [],
  [ReservationStatus.REJECTED]: [],
  [ReservationStatus.EXPIRED]: [],
  [ReservationStatus.NO_SHOW]: [],
};

/**
 * Validates whether a state transition from currentStatus to nextStatus is allowed.
 */
export function isValidReservationTransition(
  currentStatus: ReservationStatusType,
  nextStatus: ReservationStatusType
): boolean {
  if (currentStatus === nextStatus) return true;
  const allowed = VALID_STATUS_TRANSITIONS[currentStatus];
  return allowed ? allowed.includes(nextStatus) : false;
}

export interface IApprovalChainStepSnapshot {
  stepOrder: number;
  approverRole: ApproverRoleType;
  timeoutHours?: number;
  stepStartedAt?: Date | null;
  stepDeadline?: Date | null;
  status: 'PENDING' | 'APPROVED' | 'REJECTED';
  actionedBy?: Types.ObjectId | null;
  actionedAt?: Date | null;
  comment?: string | null;
  isOverride: boolean;
  actorRoleUsed?: UserRoleType | null;
}

export interface IReservation {
  resource: Types.ObjectId;
  user: Types.ObjectId;
  startAt: Date;
  endAt: Date;
  timezone: string;
  status: ReservationStatusType;
  title: string;
  description?: string;
  // Lifecycle & Approval Tracking
  approvedBy?: Types.ObjectId;
  approvedAt?: Date;
  rejectedBy?: Types.ObjectId;
  rejectedAt?: Date;
  rejectionReason?: string;
  cancelledBy?: Types.ObjectId;
  cancelledAt?: Date;
  cancellationReason?: string;
  checkInAt?: Date;
  checkOutAt?: Date;
  // Phase 3.3 Check-In & Auto-Release Tracking
  checkInMethod?: 'QR_SCAN' | 'ADMIN_MANUAL';
  checkedInBy?: Types.ObjectId;
  checkInNotes?: string;
  checkInTokenHash?: string;
  checkInTokenExpiresAt?: Date;
  checkInTokenUsedAt?: Date;
  autoReleasedAt?: Date;
  autoReleaseReason?: string;
  noShowPardoned?: boolean;
  noShowPardonedBy?: Types.ObjectId;
  noShowPardonReason?: string;
  // Phase 3.2 Approval Workflow
  policyId?: Types.ObjectId | null;
  currentStepOrder?: number | null;
  currentApproverRole?: ApproverRoleType | null;
  activeStepDeadline?: Date | null;
  approvalChain: IApprovalChainStepSnapshot[];
  metadata?: Record<string, unknown>;
  createdAt?: Date;
  updatedAt?: Date;
  __v?: number;
}

export type ReservationDocument = HydratedDocument<IReservation>;

export const ReservationSchema = new Schema<IReservation>(
  {
    resource: {
      type: Schema.Types.ObjectId,
      ref: 'Resource',
      required: [true, 'Resource reference is required for reservation'],
      index: true,
    },
    user: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      required: [true, 'User reference is required for reservation'],
      index: true,
    },
    startAt: {
      type: Date,
      required: [true, 'startAt UTC timestamp is required for reservation'],
      index: true,
    },
    endAt: {
      type: Date,
      required: [true, 'endAt UTC timestamp is required for reservation'],
      index: true,
    },
    timezone: {
      type: String,
      required: [true, 'Timezone is required for reservation evaluation context'],
      trim: true,
      validate: {
        validator: isValidIanaTimezone,
        message: 'Invalid IANA timezone identifier: {VALUE}',
      },
    },
    status: {
      type: String,
      enum: {
        values: Object.values(ReservationStatus),
        message: 'Invalid reservation status: {VALUE}',
      },
      default: ReservationStatus.CONFIRMED,
      required: true,
      index: true,
    },
    title: {
      type: String,
      required: [true, 'Reservation title is required'],
      trim: true,
      minlength: [2, 'Title must be at least 2 characters'],
      maxlength: [200, 'Title cannot exceed 200 characters'],
    },
    description: {
      type: String,
      trim: true,
      maxlength: [1000, 'Description cannot exceed 1000 characters'],
    },
    approvedBy: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      required: false,
    },
    approvedAt: {
      type: Date,
      required: false,
    },
    rejectedBy: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      required: false,
    },
    rejectedAt: {
      type: Date,
      required: false,
    },
    rejectionReason: {
      type: String,
      trim: true,
      maxlength: [500, 'Rejection reason cannot exceed 500 characters'],
    },
    cancelledBy: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      required: false,
    },
    cancelledAt: {
      type: Date,
      required: false,
    },
    cancellationReason: {
      type: String,
      trim: true,
      maxlength: [500, 'Cancellation reason cannot exceed 500 characters'],
    },
    checkInAt: {
      type: Date,
      required: false,
    },
    checkOutAt: {
      type: Date,
      required: false,
    },
    // Phase 3.3 Check-In & Auto-Release Fields
    checkInMethod: {
      type: String,
      enum: {
        values: ['QR_SCAN', 'ADMIN_MANUAL'],
        message: 'Invalid checkInMethod: {VALUE}',
      },
      required: false,
    },
    checkedInBy: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      required: false,
    },
    checkInNotes: {
      type: String,
      trim: true,
      maxlength: [500, 'Check-in notes cannot exceed 500 characters'],
      required: false,
    },
    checkInTokenHash: {
      type: String,
      required: false,
      select: false,
    },
    checkInTokenExpiresAt: {
      type: Date,
      required: false,
    },
    checkInTokenUsedAt: {
      type: Date,
      required: false,
    },
    autoReleasedAt: {
      type: Date,
      required: false,
    },
    autoReleaseReason: {
      type: String,
      trim: true,
      required: false,
    },
    noShowPardoned: {
      type: Boolean,
      default: false,
      required: false,
    },
    noShowPardonedBy: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      required: false,
    },
    noShowPardonReason: {
      type: String,
      trim: true,
      maxlength: [500, 'No-show pardon reason cannot exceed 500 characters'],
      required: false,
    },
    // Phase 3.2 Approval Workflow Fields
    policyId: {
      type: Schema.Types.ObjectId,
      ref: 'ApprovalPolicy',
      default: null,
    },
    currentStepOrder: {
      type: Number,
      default: null,
    },
    currentApproverRole: {
      type: String,
      enum: {
        values: [...VALID_APPROVER_ROLES, null],
        message: 'Invalid currentApproverRole: {VALUE}',
      },
      default: null,
    },
    activeStepDeadline: {
      type: Date,
      default: null,
    },
    approvalChain: {
      type: [
        new Schema<IApprovalChainStepSnapshot>(
          {
            stepOrder: { type: Number, required: true },
            approverRole: {
              type: String,
              enum: VALID_APPROVER_ROLES,
              required: true,
            },
            timeoutHours: { type: Number, required: false },
            stepStartedAt: { type: Date, default: null },
            stepDeadline: { type: Date, default: null },
            status: {
              type: String,
              enum: ['PENDING', 'APPROVED', 'REJECTED'],
              default: 'PENDING',
              required: true,
            },
            actionedBy: {
              type: Schema.Types.ObjectId,
              ref: 'User',
              default: null,
            },
            actionedAt: { type: Date, default: null },
            comment: { type: String, trim: true, default: null },
            isOverride: { type: Boolean, default: false },
            actorRoleUsed: { type: String, default: null },
          },
          { _id: false }
        ),
      ],
      default: [],
    },
    metadata: {
      type: Schema.Types.Mixed,
      required: false,
    },
  },
  {
    timestamps: true,
    versionKey: '__v',
  }
);

// Invariant: half-open interval requires startAt < endAt
ReservationSchema.pre('validate', function () {
  if (this.startAt && this.endAt && this.startAt >= this.endAt) {
    throw new Error('Reservation startAt must be earlier than endAt');
  }
});

// Indexes for query patterns and concurrency safety:

// 1. Partial Unique Index: Physical prevention of identical simultaneous active reservations
// Ensures no two active reservations (PENDING, CONFIRMED, CHECKED_IN) can exist for the exact same resource and start/end time.
ReservationSchema.index(
  { resource: 1, startAt: 1, endAt: 1 },
  {
    unique: true,
    partialFilterExpression: {
      status: { $in: [ReservationStatus.PENDING, ReservationStatus.CONFIRMED, ReservationStatus.CHECKED_IN] },
    },
    name: 'unique_active_reservation_exact_slot',
  }
);

// 2. Conflict query index: Fast candidate range lookup for half-open interval overlap checks
ReservationSchema.index(
  { resource: 1, status: 1, startAt: 1, endAt: 1 },
  { name: 'idx_resource_status_start_end' }
);

// 3. User booking history index: Retrieve bookings for a specific user ordered by date
ReservationSchema.index(
  { user: 1, startAt: -1 },
  { name: 'idx_user_start_desc' }
);

// 4. Status and start time index for operational background jobs (e.g. auto-expire no-shows)
ReservationSchema.index(
  { status: 1, startAt: 1 },
  { name: 'idx_status_start_asc' }
);

// 5. Phase 3.2 Approval queue role index
ReservationSchema.index(
  { status: 1, currentApproverRole: 1, currentStepOrder: 1 },
  { name: 'idx_approvals_pending_role_queue' }
);

// 6. Phase 3.2 Active step deadline index
ReservationSchema.index(
  { status: 1, activeStepDeadline: 1 },
  {
    partialFilterExpression: {
      status: ReservationStatus.PENDING,
      activeStepDeadline: { $type: 'date' },
    },
    name: 'idx_reservations_active_step_deadline',
  }
);

// 7. Phase 3.3 Check-in token lookup index (sparse, for fast cryptographic token lookups)
ReservationSchema.index(
  { checkInTokenHash: 1 },
  {
    name: 'idx_reservations_token_hash',
    sparse: true,
  }
);

// 8. Phase 3.3 User status history index (for fast no-show strike counting at booking creation)
ReservationSchema.index(
  { user: 1, status: 1, startAt: -1 },
  {
    name: 'idx_user_status_start_desc',
  }
);

export const Reservation: Model<IReservation> =
  (mongoose.models.Reservation as Model<IReservation>) ||
  mongoose.model<IReservation>('Reservation', ReservationSchema);
