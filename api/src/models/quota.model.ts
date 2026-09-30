/**
 * CampusFlow API - Quota Model
 * Defines booking limits that a subject (User, Role, Department) can consume
 * against a scope (Resource or ResourceType) across a defined period.
 */

import mongoose, { Schema, type Model, type HydratedDocument, type Types } from 'mongoose';
import { UserRole, type UserRoleType } from './user.model';
import { isValidIanaTimezone } from './availabilityRule.model';
import { isValidCalendarDate } from '../utils/dateValidation';

export const QuotaScopeType = {
  RESOURCE: 'RESOURCE',
  RESOURCE_TYPE: 'RESOURCE_TYPE',
} as const;

export type QuotaScopeTypeValue = (typeof QuotaScopeType)[keyof typeof QuotaScopeType];

export const QuotaSubjectType = {
  USER: 'USER',
  ROLE: 'ROLE',
  DEPARTMENT: 'DEPARTMENT',
} as const;

export type QuotaSubjectTypeValue = (typeof QuotaSubjectType)[keyof typeof QuotaSubjectType];

export const QuotaMetric = {
  BOOKING_COUNT: 'BOOKING_COUNT',
  DURATION_MINUTES: 'DURATION_MINUTES',
} as const;

export type QuotaMetricType = (typeof QuotaMetric)[keyof typeof QuotaMetric];

export const QuotaPeriod = {
  DAILY: 'DAILY',
  WEEKLY: 'WEEKLY',
  MONTHLY: 'MONTHLY',
} as const;

export type QuotaPeriodType = (typeof QuotaPeriod)[keyof typeof QuotaPeriod];

export interface IQuota {
  name: string;
  scopeType: QuotaScopeTypeValue;
  resource?: Types.ObjectId;
  resourceType?: Types.ObjectId;
  subjectType: QuotaSubjectTypeValue;
  user?: Types.ObjectId;
  role?: UserRoleType;
  department?: string;
  metric: QuotaMetricType;
  period: QuotaPeriodType;
  limit: number;
  timezone: string;
  effectiveFrom?: string;
  effectiveTo?: string;
  isActive: boolean;
  createdAt?: Date;
  updatedAt?: Date;
}

export type QuotaDocument = HydratedDocument<IQuota>;

export const QuotaSchema = new Schema<IQuota>(
  {
    name: {
      type: String,
      required: [true, 'Quota name is required'],
      trim: true,
      minlength: [2, 'Name must be at least 2 characters'],
      maxlength: [100, 'Name cannot exceed 100 characters'],
    },
    scopeType: {
      type: String,
      enum: {
        values: Object.values(QuotaScopeType),
        message: 'Invalid quota scopeType: {VALUE}',
      },
      required: [true, 'Quota scopeType is required'],
      index: true,
    },
    resource: {
      type: Schema.Types.ObjectId,
      ref: 'Resource',
      index: true,
    },
    resourceType: {
      type: Schema.Types.ObjectId,
      ref: 'ResourceType',
      index: true,
    },
    subjectType: {
      type: String,
      enum: {
        values: Object.values(QuotaSubjectType),
        message: 'Invalid quota subjectType: {VALUE}',
      },
      required: [true, 'Quota subjectType is required'],
      index: true,
    },
    user: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      index: true,
    },
    role: {
      type: String,
      enum: {
        values: Object.values(UserRole),
        message: 'Invalid quota role: {VALUE}',
      },
      index: true,
    },
    department: {
      type: String,
      trim: true,
      maxlength: [100, 'Department cannot exceed 100 characters'],
      index: true,
    },
    metric: {
      type: String,
      enum: {
        values: Object.values(QuotaMetric),
        message: 'Invalid quota metric: {VALUE}',
      },
      required: [true, 'Quota metric is required'],
      index: true,
    },
    period: {
      type: String,
      enum: {
        values: Object.values(QuotaPeriod),
        message: 'Invalid quota period: {VALUE}',
      },
      required: [true, 'Quota period is required'],
      index: true,
    },
    limit: {
      type: Number,
      required: [true, 'Quota limit is required'],
      validate: {
        validator(val: number) {
          return typeof val === 'number' && Number.isInteger(val) && val > 0;
        },
        message: 'Quota limit must be a positive integer',
      },
    },
    timezone: {
      type: String,
      required: [true, 'Quota timezone is required to establish deterministic period boundaries'],
      trim: true,
      validate: {
        validator: isValidIanaTimezone,
        message: 'Invalid IANA timezone identifier: {VALUE}',
      },
      index: true,
    },
    effectiveFrom: {
      type: String,
      trim: true,
      validate: {
        validator: (val: string) => !val || isValidCalendarDate(val),
        message: 'effectiveFrom must be a valid real calendar date in YYYY-MM-DD format',
      },
    },
    effectiveTo: {
      type: String,
      trim: true,
      validate: {
        validator: (val: string) => !val || isValidCalendarDate(val),
        message: 'effectiveTo must be a valid real calendar date in YYYY-MM-DD format',
      },
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

// Cross-field structural validations:
// 1. Scope consistency
// 2. Subject consistency
// 3. Department whitespace normalization
// 4. Effective date order
QuotaSchema.pre('validate', function () {
  // Department whitespace canonicalization: collapse internal whitespace while preserving casing
  if (this.department && typeof this.department === 'string') {
    this.department = this.department.trim().replace(/\s+/g, ' ');
  }

  // Scope validation
  if (this.scopeType === QuotaScopeType.RESOURCE) {
    if (!this.resource) {
      throw new Error('Quota scopeType RESOURCE requires resource reference');
    }
    if (this.resourceType) {
      throw new Error('Quota scopeType RESOURCE must not provide resourceType reference');
    }
  } else if (this.scopeType === QuotaScopeType.RESOURCE_TYPE) {
    if (!this.resourceType) {
      throw new Error('Quota scopeType RESOURCE_TYPE requires resourceType reference');
    }
    if (this.resource) {
      throw new Error('Quota scopeType RESOURCE_TYPE must not provide resource reference');
    }
  }

  // Subject validation
  if (this.subjectType === QuotaSubjectType.USER) {
    if (!this.user) {
      throw new Error('Quota subjectType USER requires user reference');
    }
    if (this.role || this.department) {
      throw new Error('Quota subjectType USER must not provide role or department');
    }
  } else if (this.subjectType === QuotaSubjectType.ROLE) {
    if (!this.role) {
      throw new Error('Quota subjectType ROLE requires role');
    }
    if (this.user || this.department) {
      throw new Error('Quota subjectType ROLE must not provide user reference or department');
    }
  } else if (this.subjectType === QuotaSubjectType.DEPARTMENT) {
    if (!this.department) {
      throw new Error('Quota subjectType DEPARTMENT requires department');
    }
    if (this.user || this.role) {
      throw new Error('Quota subjectType DEPARTMENT must not provide user reference or role');
    }
  }

  // Effective date validation
  if (this.effectiveFrom && this.effectiveTo && this.effectiveFrom > this.effectiveTo) {
    throw new Error(
      `effectiveFrom (${this.effectiveFrom}) cannot be later than effectiveTo (${this.effectiveTo})`
    );
  }
});

// Compound unique index to prevent identical duplicate quota definitions.
// Collation strength 2 ensures case-insensitive uniqueness on department without losing display casing.
QuotaSchema.index(
  {
    scopeType: 1,
    resource: 1,
    resourceType: 1,
    subjectType: 1,
    user: 1,
    role: 1,
    department: 1,
    metric: 1,
    period: 1,
    timezone: 1,
    effectiveFrom: 1,
    effectiveTo: 1,
  },
  { unique: true, collation: { locale: 'en', strength: 2 } }
);

// Targeted query indexes for fast policy retrieval:
// 1. Quotas by resource
QuotaSchema.index({ scopeType: 1, resource: 1, isActive: 1 });
// 2. Quotas by resource type
QuotaSchema.index({ scopeType: 1, resourceType: 1, isActive: 1 });
// 3. Quotas by user
QuotaSchema.index({ subjectType: 1, user: 1, isActive: 1 });
// 4. Quotas by role
QuotaSchema.index({ subjectType: 1, role: 1, isActive: 1 });
// 5. Quotas by department (with case-insensitive collation)
QuotaSchema.index(
  { subjectType: 1, department: 1, isActive: 1 },
  { collation: { locale: 'en', strength: 2 } }
);

export const Quota: Model<IQuota> =
  (mongoose.models.Quota as Model<IQuota>) || mongoose.model<IQuota>('Quota', QuotaSchema);
