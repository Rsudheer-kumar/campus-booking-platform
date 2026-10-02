/**
 * CampusFlow API - Resource Model
 * Bookable campus facility or equipment item with type template, location,
 * status lifecycle, custodian assignment, and flexible embedded attributes.
 */

import mongoose, { Schema, type Model, type HydratedDocument, type Types } from 'mongoose';
import { ResourceAttributeSchema, type IResourceAttribute } from './resourceAttribute.model';

export const ResourceStatus = {
  ACTIVE: 'ACTIVE',
  INACTIVE: 'INACTIVE',
  MAINTENANCE: 'MAINTENANCE',
  RETIRED: 'RETIRED',
} as const;

export type ResourceStatusType = (typeof ResourceStatus)[keyof typeof ResourceStatus];

export interface IResourceLocation {
  building: string;
  floor?: string;
  roomNumber?: string;
  campus?: string;
}

export interface IResource {
  name: string;
  code: string;
  resourceType: Types.ObjectId;
  description?: string;
  capacity: number;
  location: IResourceLocation;
  status: ResourceStatusType;
  isActive: boolean;
  custodian?: Types.ObjectId;
  attributes: IResourceAttribute[];
  metadata?: Record<string, unknown>;
  __v?: number;
  createdAt?: Date;
  updatedAt?: Date;
}

export type ResourceDocument = HydratedDocument<IResource>;

const codeRegex = /^[A-Z0-9_-]+$/;

const ResourceLocationSchema = new Schema<IResourceLocation>(
  {
    building: {
      type: String,
      required: [true, 'Building is required in resource location'],
      trim: true,
      maxlength: [100, 'Building cannot exceed 100 characters'],
    },
    floor: {
      type: String,
      trim: true,
      maxlength: [50, 'Floor cannot exceed 50 characters'],
    },
    roomNumber: {
      type: String,
      trim: true,
      maxlength: [50, 'Room number cannot exceed 50 characters'],
    },
    campus: {
      type: String,
      trim: true,
      maxlength: [100, 'Campus cannot exceed 100 characters'],
    },
  },
  {
    _id: false,
  }
);

export const ResourceSchema = new Schema<IResource>(
  {
    name: {
      type: String,
      required: [true, 'Resource name is required'],
      trim: true,
      minlength: [2, 'Resource name must be at least 2 characters'],
      maxlength: [100, 'Resource name cannot exceed 100 characters'],
    },
    code: {
      type: String,
      required: [true, 'Resource code is required'],
      unique: true,
      uppercase: true,
      trim: true,
      match: [codeRegex, 'Code must contain only uppercase letters, numbers, underscores, and dashes'],
      index: true,
    },
    resourceType: {
      type: Schema.Types.ObjectId,
      ref: 'ResourceType',
      required: [true, 'ResourceType reference is required'],
      index: true,
    },
    description: {
      type: String,
      trim: true,
      maxlength: [1000, 'Description cannot exceed 1000 characters'],
    },
    capacity: {
      type: Number,
      required: [true, 'Resource capacity is required'],
      min: [1, 'Capacity must be at least 1'],
    },
    location: {
      type: ResourceLocationSchema,
      required: [true, 'Resource location is required'],
    },
    status: {
      type: String,
      enum: {
        values: Object.values(ResourceStatus),
        message: 'Invalid resource status: {VALUE}',
      },
      default: ResourceStatus.ACTIVE,
      required: true,
      index: true,
    },
    isActive: {
      type: Boolean,
      default: true,
      required: true,
      index: true,
    },
    custodian: {
      type: Schema.Types.ObjectId,
      ref: 'Custodian',
      required: false,
      index: true,
    },
    attributes: {
      type: [ResourceAttributeSchema],
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

// Enforce unique attribute keys within the same resource
ResourceSchema.pre('validate', function () {
  if (this.attributes && this.attributes.length > 0) {
    const seenKeys = new Set<string>();
    for (const attr of this.attributes) {
      if (seenKeys.has(attr.key)) {
        throw new Error(`Duplicate attribute key "${attr.key}" in resource attributes`);
      }
      seenKeys.add(attr.key);
    }
  }
});

// Indexes
ResourceSchema.index({ 'attributes.key': 1 });

export const Resource: Model<IResource> =
  (mongoose.models.Resource as Model<IResource>) ||
  mongoose.model<IResource>('Resource', ResourceSchema);
