/**
 * CampusFlow API - Timetable Request Validators (Phase 3.1)
 * Validates timetable synchronization payloads, query parameters, and conflict audit requests.
 */

import type { ValidationResult, ValidationIssue } from '../middleware/validate';
import { isValidIanaTimezone } from '../utils/timezone';

const MONGO_ID_REGEX = /^[0-9a-fA-F]{24}$/;
const RESOURCE_CODE_REGEX = /^[A-Z0-9_-]+$/i;

export interface SyncTimetableEntryInput {
  resourceCode: string;
  courseCode: string;
  courseTitle: string;
  instructorName?: string;
  startAt: string;
  endAt: string;
  timezone: string;
  sourceSystemId?: string;
  metadata?: Record<string, unknown>;
}

export interface SyncTimetableBodyInput {
  academicTerm: string;
  version: number;
  publicationBatchId: string;
  sourceSystemId?: string;
  publishedAt?: string;
  entries: SyncTimetableEntryInput[];
}

export function validateSyncTimetableBody(data: unknown): ValidationResult<SyncTimetableBodyInput> {
  const record = (data || {}) as Record<string, unknown>;
  const errors: ValidationIssue[] = [];

  // academicTerm
  if (!record.academicTerm || typeof record.academicTerm !== 'string') {
    errors.push({ field: 'academicTerm', message: 'academicTerm is required and must be a string' });
  } else if (record.academicTerm.trim().length < 2 || record.academicTerm.trim().length > 50) {
    errors.push({ field: 'academicTerm', message: 'academicTerm must be between 2 and 50 characters' });
  }

  // version
  if (record.version === undefined || typeof record.version !== 'number' || !Number.isInteger(record.version) || record.version < 1) {
    errors.push({ field: 'version', message: 'version is required and must be a positive integer (>= 1)' });
  }

  // publicationBatchId
  if (!record.publicationBatchId || typeof record.publicationBatchId !== 'string') {
    errors.push({ field: 'publicationBatchId', message: 'publicationBatchId is required and must be a string' });
  } else if (record.publicationBatchId.trim().length < 1 || record.publicationBatchId.trim().length > 100) {
    errors.push({ field: 'publicationBatchId', message: 'publicationBatchId cannot exceed 100 characters' });
  }

  // sourceSystemId (optional)
  if (record.sourceSystemId !== undefined && typeof record.sourceSystemId !== 'string') {
    errors.push({ field: 'sourceSystemId', message: 'sourceSystemId must be a string' });
  }

  // publishedAt (optional)
  if (record.publishedAt !== undefined) {
    if (typeof record.publishedAt !== 'string' || isNaN(new Date(record.publishedAt).getTime())) {
      errors.push({ field: 'publishedAt', message: 'publishedAt must be a valid ISO date string' });
    }
  }

  // entries array
  if (!Array.isArray(record.entries)) {
    errors.push({ field: 'entries', message: 'entries is required and must be an array of timetable sessions' });
  } else if (record.entries.length === 0) {
    errors.push({ field: 'entries', message: 'entries array cannot be empty; at least 1 session is required' });
  } else {
    const seenSlots = new Set<string>();

    for (let i = 0; i < record.entries.length; i++) {
      const entry = record.entries[i] as Record<string, unknown>;
      const prefix = `entries[${i}]`;

      // resourceCode
      if (!entry.resourceCode || typeof entry.resourceCode !== 'string') {
        errors.push({ field: `${prefix}.resourceCode`, message: 'resourceCode is required' });
      } else if (!RESOURCE_CODE_REGEX.test(entry.resourceCode.trim())) {
        errors.push({ field: `${prefix}.resourceCode`, message: 'resourceCode must contain only letters, numbers, underscores, and dashes' });
      }

      // courseCode
      if (!entry.courseCode || typeof entry.courseCode !== 'string') {
        errors.push({ field: `${prefix}.courseCode`, message: 'courseCode is required' });
      } else if (entry.courseCode.trim().length < 2 || entry.courseCode.trim().length > 50) {
        errors.push({ field: `${prefix}.courseCode`, message: 'courseCode must be between 2 and 50 characters' });
      }

      // courseTitle
      if (!entry.courseTitle || typeof entry.courseTitle !== 'string') {
        errors.push({ field: `${prefix}.courseTitle`, message: 'courseTitle is required' });
      } else if (entry.courseTitle.trim().length < 2 || entry.courseTitle.trim().length > 200) {
        errors.push({ field: `${prefix}.courseTitle`, message: 'courseTitle must be between 2 and 200 characters' });
      }

      // instructorName (optional)
      if (entry.instructorName !== undefined && (typeof entry.instructorName !== 'string' || entry.instructorName.trim().length > 100)) {
        errors.push({ field: `${prefix}.instructorName`, message: 'instructorName cannot exceed 100 characters' });
      }

      // startAt
      let sDate: Date | null = null;
      if (!entry.startAt || typeof entry.startAt !== 'string') {
        errors.push({ field: `${prefix}.startAt`, message: 'startAt is required and must be an ISO date string' });
      } else {
        sDate = new Date(entry.startAt);
        if (isNaN(sDate.getTime())) {
          errors.push({ field: `${prefix}.startAt`, message: 'startAt is not a valid date string' });
        }
      }

      // endAt
      let eDate: Date | null = null;
      if (!entry.endAt || typeof entry.endAt !== 'string') {
        errors.push({ field: `${prefix}.endAt`, message: 'endAt is required and must be an ISO date string' });
      } else {
        eDate = new Date(entry.endAt);
        if (isNaN(eDate.getTime())) {
          errors.push({ field: `${prefix}.endAt`, message: 'endAt is not a valid date string' });
        }
      }

      // interval ordering
      if (sDate && eDate && !isNaN(sDate.getTime()) && !isNaN(eDate.getTime())) {
        if (sDate.getTime() >= eDate.getTime()) {
          errors.push({ field: `${prefix}.startAt`, message: 'startAt must be earlier than endAt for a half-open interval' });
        } else if (entry.resourceCode && typeof entry.resourceCode === 'string') {
          // Check for exact duplicate slot within the same batch
          const slotKey = `${entry.resourceCode.trim().toUpperCase()}|${sDate.toISOString()}|${eDate.toISOString()}`;
          if (seenSlots.has(slotKey)) {
            errors.push({ field: `${prefix}`, message: `Duplicate identical timetable slot in batch for resource "${entry.resourceCode}" at ${sDate.toISOString()}` });
          } else {
            seenSlots.add(slotKey);
          }
        }
      }

      // timezone
      if (!entry.timezone || typeof entry.timezone !== 'string') {
        errors.push({ field: `${prefix}.timezone`, message: 'timezone is required' });
      } else if (!isValidIanaTimezone(entry.timezone)) {
        errors.push({ field: `${prefix}.timezone`, message: `Invalid IANA timezone identifier: "${entry.timezone}"` });
      }
    }
  }

  if (errors.length > 0) {
    return { success: false, errors };
  }

  const sanitizedEntries: SyncTimetableEntryInput[] = (record.entries as Record<string, unknown>[]).map((e) => ({
    resourceCode: (e.resourceCode as string).trim().toUpperCase(),
    courseCode: (e.courseCode as string).trim().toUpperCase(),
    courseTitle: (e.courseTitle as string).trim(),
    instructorName: typeof e.instructorName === 'string' ? e.instructorName.trim() : undefined,
    startAt: new Date(e.startAt as string).toISOString(),
    endAt: new Date(e.endAt as string).toISOString(),
    timezone: e.timezone as string,
    sourceSystemId: typeof e.sourceSystemId === 'string' ? e.sourceSystemId.trim() : undefined,
    metadata: typeof e.metadata === 'object' && e.metadata !== null ? (e.metadata as Record<string, unknown>) : undefined,
  }));

  return {
    success: true,
    data: {
      academicTerm: (record.academicTerm as string).trim().toUpperCase(),
      version: record.version as number,
      publicationBatchId: (record.publicationBatchId as string).trim(),
      sourceSystemId: typeof record.sourceSystemId === 'string' ? record.sourceSystemId.trim() : undefined,
      publishedAt: typeof record.publishedAt === 'string' ? new Date(record.publishedAt).toISOString() : undefined,
      entries: sanitizedEntries,
    },
  };
}

export interface ListTimetablesQueryInput {
  academicTerm?: string;
  resourceId?: string;
  resourceCode?: string;
  startAt?: string;
  endAt?: string;
}

export function validateListTimetablesQuery(data: unknown): ValidationResult<ListTimetablesQueryInput> {
  const record = (data || {}) as Record<string, unknown>;
  const errors: ValidationIssue[] = [];

  if (record.resourceId !== undefined) {
    if (typeof record.resourceId !== 'string' || !MONGO_ID_REGEX.test(record.resourceId)) {
      errors.push({ field: 'resourceId', message: 'resourceId must be a valid 24-character hex ObjectId' });
    }
  }

  if (record.startAt !== undefined) {
    if (typeof record.startAt !== 'string' || isNaN(new Date(record.startAt).getTime())) {
      errors.push({ field: 'startAt', message: 'startAt must be a valid ISO date string' });
    }
  }

  if (record.endAt !== undefined) {
    if (typeof record.endAt !== 'string' || isNaN(new Date(record.endAt).getTime())) {
      errors.push({ field: 'endAt', message: 'endAt must be a valid ISO date string' });
    }
  }

  if (errors.length > 0) {
    return { success: false, errors };
  }

  return {
    success: true,
    data: {
      academicTerm: typeof record.academicTerm === 'string' ? record.academicTerm.trim().toUpperCase() : undefined,
      resourceId: typeof record.resourceId === 'string' ? record.resourceId : undefined,
      resourceCode: typeof record.resourceCode === 'string' ? record.resourceCode.trim().toUpperCase() : undefined,
      startAt: typeof record.startAt === 'string' ? record.startAt : undefined,
      endAt: typeof record.endAt === 'string' ? record.endAt : undefined,
    },
  };
}

export interface ConflictAuditQueryInput {
  academicTerm?: string;
  resourceId?: string;
}

export function validateConflictAuditQuery(data: unknown): ValidationResult<ConflictAuditQueryInput> {
  const record = (data || {}) as Record<string, unknown>;
  const errors: ValidationIssue[] = [];

  if (record.resourceId !== undefined) {
    if (typeof record.resourceId !== 'string' || !MONGO_ID_REGEX.test(record.resourceId)) {
      errors.push({ field: 'resourceId', message: 'resourceId must be a valid 24-character hex ObjectId' });
    }
  }

  if (errors.length > 0) {
    return { success: false, errors };
  }

  return {
    success: true,
    data: {
      academicTerm: typeof record.academicTerm === 'string' ? record.academicTerm.trim().toUpperCase() : undefined,
      resourceId: typeof record.resourceId === 'string' ? record.resourceId : undefined,
    },
  };
}
