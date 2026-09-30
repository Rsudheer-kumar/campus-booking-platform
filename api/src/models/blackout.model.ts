/**
 * CampusFlow API - Blackout Model
 * Represents a point-in-time blocked interval during which a resource cannot be booked,
 * overriding any recurring availability rules.
 *
 * TIME SEMANTICS:
 * Blackout intervals represent half-open UTC timestamp intervals [startAt, endAt)
 * where startAt is inclusive and endAt is exclusive (startAt < endAt).
 */

import mongoose, { Schema, type Model, type HydratedDocument, type Types } from 'mongoose';

export const BlackoutCategory = {
  HOLIDAY: 'HOLIDAY',
  SPECIAL_EVENT: 'SPECIAL_EVENT',
  ADMINISTRATIVE: 'ADMINISTRATIVE',
  OTHER: 'OTHER',
} as const;

export type BlackoutCategoryType = (typeof BlackoutCategory)[keyof typeof BlackoutCategory];

export interface IBlackout {
  resource: Types.ObjectId;
  startAt: Date;
  endAt: Date;
  reason: string;
  category: BlackoutCategoryType;
  description?: string;
  isActive: boolean;
  createdAt?: Date;
  updatedAt?: Date;
}

export type BlackoutDocument = HydratedDocument<IBlackout>;

export const BlackoutSchema = new Schema<IBlackout>(
  {
    resource: {
      type: Schema.Types.ObjectId,
      ref: 'Resource',
      required: [true, 'Resource reference is required for blackout'],
      index: true,
    },
    startAt: {
      type: Date,
      required: [true, 'startAt UTC timestamp is required for blackout'],
      index: true,
    },
    endAt: {
      type: Date,
      required: [true, 'endAt UTC timestamp is required for blackout'],
      index: true,
    },
    reason: {
      type: String,
      required: [true, 'Blackout reason is required'],
      trim: true,
      minlength: [2, 'Reason must be at least 2 characters'],
      maxlength: [500, 'Reason cannot exceed 500 characters'],
    },
    category: {
      type: String,
      enum: {
        values: Object.values(BlackoutCategory),
        message: 'Invalid blackout category: {VALUE}',
      },
      default: BlackoutCategory.ADMINISTRATIVE,
      required: true,
      index: true,
    },
    description: {
      type: String,
      trim: true,
      maxlength: [1000, 'Description cannot exceed 1000 characters'],
    },
    isActive: {
      type: Boolean,
      default: true,
      required: true,
      index: true,
    },
  },
  {
    timestamps: true,
    versionKey: false,
  }
);

// Enforce half-open interval invariant: startAt < endAt
BlackoutSchema.pre('validate', function () {
  if (this.startAt && this.endAt && this.startAt >= this.endAt) {
    throw new Error('Blackout startAt must be earlier than endAt');
  }
});

// Indexes for query patterns:
// 1. Candidate retrieval: Narrow active blackouts for a specific resource by bounding timestamps.
// NOTE: This compound index facilitates efficient candidate pre-filtering;
// authoritative half-open interval overlap evaluation (candidate.startAt < queryEnd && candidate.endAt > queryStart)
// is executed at query time and by the availability calculation service.
BlackoutSchema.index({ resource: 1, isActive: 1, startAt: 1, endAt: 1 });
// 2. Reporting / audit lookup by category
BlackoutSchema.index({ category: 1, isActive: 1 });

export const Blackout: Model<IBlackout> =
  (mongoose.models.Blackout as Model<IBlackout>) ||
  mongoose.model<IBlackout>('Blackout', BlackoutSchema);
