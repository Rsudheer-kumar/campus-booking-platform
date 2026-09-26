/**
 * CampusFlow API - Custodian Model
 * Connects operational facility and equipment responsibility to a campus user identity.
 */

import mongoose, { Schema, type Model, type HydratedDocument, type Types } from 'mongoose';

export interface ICustodian {
  user: Types.ObjectId;
  department: string;
  officeLocation?: string;
  contactPhone?: string;
  isActive: boolean;
  createdAt?: Date;
  updatedAt?: Date;
}

export type CustodianDocument = HydratedDocument<ICustodian>;

export const CustodianSchema = new Schema<ICustodian>(
  {
    user: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      required: [true, 'User reference is required for custodian'],
      unique: true,
      index: true,
    },
    department: {
      type: String,
      required: [true, 'Department is required for custodian'],
      trim: true,
      maxlength: [100, 'Department cannot exceed 100 characters'],
      index: true,
    },
    officeLocation: {
      type: String,
      trim: true,
      maxlength: [100, 'Office location cannot exceed 100 characters'],
    },
    contactPhone: {
      type: String,
      trim: true,
      maxlength: [25, 'Contact phone cannot exceed 25 characters'],
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

export const Custodian: Model<ICustodian> =
  (mongoose.models.Custodian as Model<ICustodian>) ||
  mongoose.model<ICustodian>('Custodian', CustodianSchema);
