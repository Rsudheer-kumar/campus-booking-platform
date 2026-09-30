/**
 * CampusFlow API - User Model
 * Foundational identity model supporting campus roles without authentication secrets.
 */

import mongoose, { Schema, type Model, type HydratedDocument } from 'mongoose';

export const UserRole = {
  STUDENT: 'STUDENT',
  FACULTY: 'FACULTY',
  STAFF: 'STAFF',
  CUSTODIAN: 'CUSTODIAN',
  DEPARTMENT_HEAD: 'DEPARTMENT_HEAD',
  FACILITY_MANAGER: 'FACILITY_MANAGER',
  ADMIN: 'ADMIN',
} as const;

export type UserRoleType = (typeof UserRole)[keyof typeof UserRole];

export interface IUser {
  name: string;
  email: string;
  roles: UserRoleType[];
  department?: string;
  identifier?: string;
  isActive: boolean;
  createdAt?: Date;
  updatedAt?: Date;
}

export type UserDocument = HydratedDocument<IUser>;

const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export const UserSchema = new Schema<IUser>(
  {
    name: {
      type: String,
      required: [true, 'User name is required'],
      trim: true,
      minlength: [2, 'Name must be at least 2 characters'],
      maxlength: [100, 'Name cannot exceed 100 characters'],
    },
    email: {
      type: String,
      required: [true, 'Email is required'],
      unique: true,
      lowercase: true,
      trim: true,
      match: [emailRegex, 'Please provide a valid email address'],
      index: true,
    },
    roles: {
      type: [
        {
          type: String,
          enum: {
            values: Object.values(UserRole),
            message: 'Invalid user role: {VALUE}',
          },
        },
      ],
      default: [UserRole.STUDENT],
      validate: {
        validator: (roles: string[]) => Array.isArray(roles) && roles.length > 0,
        message: 'At least one role must be assigned to the user',
      },
    },
    department: {
      type: String,
      trim: true,
      maxlength: [100, 'Department cannot exceed 100 characters'],
    },
    identifier: {
      type: String,
      trim: true,
      unique: true,
      sparse: true,
      index: true,
      maxlength: [50, 'Identifier cannot exceed 50 characters'],
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

// Pre-validate hook: normalize department whitespace
UserSchema.pre('validate', function () {
  if (this.department && typeof this.department === 'string') {
    this.department = this.department.trim().replace(/\s+/g, ' ');
  }
});

// Indexes
UserSchema.index({ roles: 1 });

export const User: Model<IUser> =
  (mongoose.models.User as Model<IUser>) || mongoose.model<IUser>('User', UserSchema);
