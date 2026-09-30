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

export const ReservationStatus = {
  PENDING: 'PENDING',
  CONFIRMED: 'CONFIRMED',
  CHECKED_IN: 'CHECKED_IN',
  COMPLETED: 'COMPLETED',
  CANCELLED: 'CANCELLED',
  REJECTED: 'REJECTED',
  EXPIRED: 'EXPIRED',
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
  ],
  [ReservationStatus.CHECKED_IN]: [
    ReservationStatus.COMPLETED,
    ReservationStatus.CANCELLED,
  ],
  [ReservationStatus.COMPLETED]: [],
  [ReservationStatus.CANCELLED]: [],
  [ReservationStatus.REJECTED]: [],
  [ReservationStatus.EXPIRED]: [],
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
  metadata?: Record<string, unknown>;
  createdAt?: Date;
  updatedAt?: Date;
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
    metadata: {
      type: Schema.Types.Mixed,
      required: false,
    },
  },
  {
    timestamps: true,
    versionKey: false,
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

export const Reservation: Model<IReservation> =
  (mongoose.models.Reservation as Model<IReservation>) ||
  mongoose.model<IReservation>('Reservation', ReservationSchema);
