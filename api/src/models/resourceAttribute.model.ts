/**
 * CampusFlow API - ResourceAttribute Schema & Types
 * Flexible attribute subdocument schema for resource-specific technical and physical specifications.
 *
 * AUTHORITATIVE PERSISTENCE STRATEGY:
 * Resource attributes are authoritatively persisted as embedded subdocuments inside
 * the Resource model (`Resource.attributes: [ResourceAttributeSchema]`).
 * A standalone collection is intentionally not maintained to prevent dual-source-of-truth
 * divergence, eliminate redundant $lookup joins, and guarantee atomic resource document updates.
 */

import { Schema } from 'mongoose';

export const AttributeDataType = {
  STRING: 'STRING',
  NUMBER: 'NUMBER',
  BOOLEAN: 'BOOLEAN',
} as const;

export type AttributeDataTypeValue = (typeof AttributeDataType)[keyof typeof AttributeDataType];

export interface IResourceAttribute {
  key: string;
  label?: string;
  dataType: AttributeDataTypeValue;
  value: string | number | boolean;
}

const keyRegex = /^[a-z0-9_]+$/;

export const ResourceAttributeSchema = new Schema<IResourceAttribute>(
  {
    key: {
      type: String,
      required: [true, 'Attribute key is required'],
      trim: true,
      lowercase: true,
      match: [keyRegex, 'Attribute key must contain only lowercase alphanumeric characters and underscores'],
      maxlength: [50, 'Attribute key cannot exceed 50 characters'],
    },
    label: {
      type: String,
      trim: true,
      maxlength: [100, 'Attribute label cannot exceed 100 characters'],
    },
    dataType: {
      type: String,
      enum: {
        values: Object.values(AttributeDataType),
        message: 'Invalid attribute data type: {VALUE}',
      },
      default: AttributeDataType.STRING,
      required: true,
    },
    value: {
      type: Schema.Types.Mixed,
      required: [true, 'Attribute value is required'],
      validate: {
        validator(val: unknown) {
          const doc = this as unknown as { dataType?: AttributeDataTypeValue };
          if (doc.dataType === AttributeDataType.NUMBER) {
            return typeof val === 'number' && !Number.isNaN(val);
          }
          if (doc.dataType === AttributeDataType.BOOLEAN) {
            return typeof val === 'boolean';
          }
          if (doc.dataType === AttributeDataType.STRING) {
            return typeof val === 'string';
          }
          return false;
        },
        message: 'Attribute value does not match the specified dataType',
      },
    },
  },
  {
    _id: false,
    timestamps: false,
    versionKey: false,
  }
);
