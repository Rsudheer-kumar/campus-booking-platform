/**
 * CampusFlow API - ResourceType Model
 * Defines category and template metadata for bookable campus facilities and equipment.
 */

import mongoose, { Schema, type Model, type HydratedDocument } from 'mongoose';

export const ResourceCategory = {
  CLASSROOM: 'CLASSROOM',
  LABORATORY: 'LABORATORY',
  SPORTS_FACILITY: 'SPORTS_FACILITY',
  EQUIPMENT: 'EQUIPMENT',
  MEETING_ROOM: 'MEETING_ROOM',
  AUDITORIUM: 'AUDITORIUM',
  OTHER: 'OTHER',
} as const;

export type ResourceCategoryType = (typeof ResourceCategory)[keyof typeof ResourceCategory];

export interface IResourceType {
  name: string;
  code: string;
  category: ResourceCategoryType;
  description?: string;
  isActive: boolean;
  createdAt?: Date;
  updatedAt?: Date;
}

export type ResourceTypeDocument = HydratedDocument<IResourceType>;

const codeRegex = /^[A-Z0-9_-]+$/;

export const ResourceTypeSchema = new Schema<IResourceType>(
  {
    name: {
      type: String,
      required: [true, 'Resource type name is required'],
      trim: true,
      minlength: [2, 'Resource type name must be at least 2 characters'],
      maxlength: [100, 'Resource type name cannot exceed 100 characters'],
    },
    code: {
      type: String,
      required: [true, 'Resource type code is required'],
      unique: true,
      uppercase: true,
      trim: true,
      match: [codeRegex, 'Code must contain only uppercase letters, numbers, underscores, and dashes'],
      index: true,
    },
    category: {
      type: String,
      enum: {
        values: Object.values(ResourceCategory),
        message: 'Invalid resource category: {VALUE}',
      },
      default: ResourceCategory.OTHER,
      required: true,
      index: true,
    },
    description: {
      type: String,
      trim: true,
      maxlength: [500, 'Description cannot exceed 500 characters'],
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

export const ResourceType: Model<IResourceType> =
  (mongoose.models.ResourceType as Model<IResourceType>) ||
  mongoose.model<IResourceType>('ResourceType', ResourceTypeSchema);
