/**
 * CampusFlow API - Timetable Entry Model (Phase 3.1)
 * Represents an authoritative scheduled academic timetable session (lecture, seminar, lab).
 * Acts as an institutional hard availability constraint over physical campus resources.
 */

import mongoose, { Schema, type Model, type HydratedDocument, type Types } from 'mongoose';
import { isValidIanaTimezone } from '../utils/timezone';

export interface ITimetableEntry {
  resource: Types.ObjectId;
  academicTerm: string;
  courseCode: string;
  courseTitle: string;
  instructorName?: string;
  startAt: Date;
  endAt: Date;
  timezone: string;
  isPublished: boolean;
  sourceSystemId?: string;
  version: number;
  publicationBatchId: string;
  metadata?: Record<string, unknown>;
  createdAt?: Date;
  updatedAt?: Date;
}

export type TimetableEntryDocument = HydratedDocument<ITimetableEntry>;

export const TimetableEntrySchema = new Schema<ITimetableEntry>(
  {
    resource: {
      type: Schema.Types.ObjectId,
      ref: 'Resource',
      required: [true, 'Resource reference is required'],
      index: true,
    },
    academicTerm: {
      type: String,
      required: [true, 'Academic term is required'],
      trim: true,
      uppercase: true,
      minlength: [2, 'Academic term must be at least 2 characters'],
      maxlength: [50, 'Academic term cannot exceed 50 characters'],
      index: true,
    },
    courseCode: {
      type: String,
      required: [true, 'Course code is required'],
      trim: true,
      uppercase: true,
      minlength: [2, 'Course code must be at least 2 characters'],
      maxlength: [50, 'Course code cannot exceed 50 characters'],
      index: true,
    },
    courseTitle: {
      type: String,
      required: [true, 'Course title is required'],
      trim: true,
      minlength: [2, 'Course title must be at least 2 characters'],
      maxlength: [200, 'Course title cannot exceed 200 characters'],
    },
    instructorName: {
      type: String,
      trim: true,
      maxlength: [100, 'Instructor name cannot exceed 100 characters'],
    },
    startAt: {
      type: Date,
      required: [true, 'startAt is required'],
      index: true,
    },
    endAt: {
      type: Date,
      required: [true, 'endAt is required'],
      index: true,
    },
    timezone: {
      type: String,
      required: [true, 'Timezone is required'],
      default: 'UTC',
      validate: {
        validator: (tz: string) => isValidIanaTimezone(tz),
        message: 'Invalid IANA timezone identifier: {VALUE}',
      },
    },
    isPublished: {
      type: Boolean,
      default: true,
      required: true,
      index: true,
    },
    sourceSystemId: {
      type: String,
      trim: true,
      maxlength: [100, 'Source system ID cannot exceed 100 characters'],
      index: true,
    },
    version: {
      type: Number,
      required: [true, 'Publication version is required'],
      min: [1, 'Version must be at least 1'],
      validate: {
        validator: (v: number) => Number.isInteger(v),
        message: 'Version must be an integer',
      },
      index: true,
    },
    publicationBatchId: {
      type: String,
      required: [true, 'Publication batch ID is required'],
      trim: true,
      index: true,
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

// Enforce half-open interval rule: startAt < endAt
TimetableEntrySchema.pre('validate', function () {
  if (this.startAt && this.endAt) {
    const s = this.startAt instanceof Date ? this.startAt.getTime() : new Date(this.startAt).getTime();
    const e = this.endAt instanceof Date ? this.endAt.getTime() : new Date(this.endAt).getTime();
    if (isNaN(s) || isNaN(e)) {
      throw new Error('startAt and endAt must be valid Date timestamps');
    }
    if (s >= e) {
      throw new Error('startAt must be earlier than endAt for a half-open interval [startAt, endAt)');
    }
  }
});

// Primary compound index for fast interval overlap queries:
// startAt < requestedEnd && endAt > requestedStart on published entries for a resource
TimetableEntrySchema.index({ resource: 1, isPublished: 1, startAt: 1, endAt: 1 });

// Scoping index for term deprecation and version queries
TimetableEntrySchema.index({ academicTerm: 1, isPublished: 1 });
TimetableEntrySchema.index({ academicTerm: 1, version: 1 });

// Sparse index for external source ID within term
TimetableEntrySchema.index(
  { academicTerm: 1, sourceSystemId: 1, isPublished: 1 },
  { sparse: true }
);

export const TimetableEntry: Model<ITimetableEntry> =
  (mongoose.models.TimetableEntry as Model<ITimetableEntry>) ||
  mongoose.model<ITimetableEntry>('TimetableEntry', TimetableEntrySchema);
