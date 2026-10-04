/**
 * CampusFlow API - Booking Request Validators
 * Request payload and query parameter validators for reservation operations.
 */

import type { ValidationResult, ValidationIssue } from '../middleware/validate';
import { isValidIanaTimezone, isValidCalendarDate } from '../models';
import { ReservationStatus, type ReservationStatusType } from '../models/reservation.model';

const MONGO_ID_REGEX = /^[0-9a-fA-F]{24}$/;

export interface CreateBookingBodyInput {
  resourceId: string;
  userId?: string;
  startAt: string;
  endAt: string;
  timezone: string;
  title: string;
  description?: string;
  metadata?: Record<string, unknown>;
}

export function validateCreateBookingBody(data: unknown): ValidationResult<CreateBookingBodyInput> {
  const record = (data || {}) as Record<string, unknown>;
  const errors: ValidationIssue[] = [];

  // resourceId
  if (!record.resourceId || typeof record.resourceId !== 'string' || !MONGO_ID_REGEX.test(record.resourceId)) {
    errors.push({ field: 'resourceId', message: 'resourceId must be a valid 24-character hex ObjectId' });
  }

  // userId (optional - for on-behalf booking by DEPARTMENT_HEAD, otherwise uses req.user)
  if (record.userId !== undefined) {
    if (typeof record.userId !== 'string' || !MONGO_ID_REGEX.test(record.userId)) {
      errors.push({ field: 'userId', message: 'userId must be a valid 24-character hex ObjectId' });
    }
  }

  // startAt
  let startAtDate: Date | null = null;
  if (!record.startAt || typeof record.startAt !== 'string') {
    errors.push({ field: 'startAt', message: 'startAt is required and must be an ISO date string' });
  } else {
    startAtDate = new Date(record.startAt);
    if (isNaN(startAtDate.getTime())) {
      errors.push({ field: 'startAt', message: 'startAt is not a valid date string' });
    }
  }

  // endAt
  let endAtDate: Date | null = null;
  if (!record.endAt || typeof record.endAt !== 'string') {
    errors.push({ field: 'endAt', message: 'endAt is required and must be an ISO date string' });
  } else {
    endAtDate = new Date(record.endAt);
    if (isNaN(endAtDate.getTime())) {
      errors.push({ field: 'endAt', message: 'endAt is not a valid date string' });
    }
  }

  if (startAtDate && endAtDate && !isNaN(startAtDate.getTime()) && !isNaN(endAtDate.getTime())) {
    if (startAtDate.getTime() >= endAtDate.getTime()) {
      errors.push({ field: 'startAt', message: 'startAt must be earlier than endAt for a half-open interval' });
    }
  }

  // timezone
  if (!record.timezone || typeof record.timezone !== 'string') {
    errors.push({ field: 'timezone', message: 'timezone is required' });
  } else if (!isValidIanaTimezone(record.timezone)) {
    errors.push({ field: 'timezone', message: `Invalid IANA timezone identifier: "${record.timezone}"` });
  }

  // title
  if (!record.title || typeof record.title !== 'string') {
    errors.push({ field: 'title', message: 'title is required' });
  } else if (record.title.trim().length < 2 || record.title.trim().length > 200) {
    errors.push({ field: 'title', message: 'title must be between 2 and 200 characters' });
  }

  // description
  if (record.description !== undefined && typeof record.description !== 'string') {
    errors.push({ field: 'description', message: 'description must be a string' });
  } else if (typeof record.description === 'string' && record.description.length > 1000) {
    errors.push({ field: 'description', message: 'description cannot exceed 1000 characters' });
  }

  if (errors.length > 0) {
    return { success: false, errors };
  }

  return {
    success: true,
    data: {
      resourceId: record.resourceId as string,
      userId: typeof record.userId === 'string' ? record.userId : undefined,
      startAt: record.startAt as string,
      endAt: record.endAt as string,
      timezone: record.timezone as string,
      title: (record.title as string).trim(),
      description: typeof record.description === 'string' ? record.description.trim() : undefined,
      metadata: typeof record.metadata === 'object' && record.metadata !== null ? (record.metadata as Record<string, unknown>) : undefined,
    },
  };
}

export interface CancelBookingBodyInput {
  userId?: string;
  reason?: string;
}

export function validateCancelBookingBody(data: unknown): ValidationResult<CancelBookingBodyInput> {
  const record = (data || {}) as Record<string, unknown>;
  const errors: ValidationIssue[] = [];

  if (record.userId !== undefined) {
    if (typeof record.userId !== 'string' || !MONGO_ID_REGEX.test(record.userId)) {
      errors.push({ field: 'userId', message: 'userId must be a valid 24-character hex ObjectId' });
    }
  }

  if (record.reason !== undefined) {
    if (typeof record.reason !== 'string' || record.reason.length > 500) {
      errors.push({ field: 'reason', message: 'reason must be a string not exceeding 500 characters' });
    }
  }

  if (errors.length > 0) {
    return { success: false, errors };
  }

  return {
    success: true,
    data: {
      userId: record.userId as string | undefined,
      reason: typeof record.reason === 'string' ? record.reason.trim() : undefined,
    },
  };
}

export interface TransitionBookingStatusBodyInput {
  status: ReservationStatusType;
  userId?: string;
  reason?: string;
}

export function validateTransitionBookingStatusBody(data: unknown): ValidationResult<TransitionBookingStatusBodyInput> {
  const record = (data || {}) as Record<string, unknown>;
  const errors: ValidationIssue[] = [];

  const validStatuses = Object.values(ReservationStatus);
  if (!record.status || !validStatuses.includes(record.status as ReservationStatusType)) {
    errors.push({ field: 'status', message: `status must be one of: ${validStatuses.join(', ')}` });
  }

  if (record.userId !== undefined) {
    if (typeof record.userId !== 'string' || !MONGO_ID_REGEX.test(record.userId)) {
      errors.push({ field: 'userId', message: 'userId must be a valid 24-character hex ObjectId' });
    }
  }

  if (record.reason !== undefined) {
    if (typeof record.reason !== 'string' || record.reason.length > 500) {
      errors.push({ field: 'reason', message: 'reason must be a string not exceeding 500 characters' });
    }
  }

  if (errors.length > 0) {
    return { success: false, errors };
  }

  return {
    success: true,
    data: {
      status: record.status as ReservationStatusType,
      userId: record.userId as string | undefined,
      reason: typeof record.reason === 'string' ? record.reason.trim() : undefined,
    },
  };
}

export interface CheckAvailabilityQueryInput {
  resourceId: string;
  startAt: string;
  endAt: string;
  excludeReservationId?: string;
}

export function validateCheckAvailabilityQuery(data: unknown): ValidationResult<CheckAvailabilityQueryInput> {
  const record = (data || {}) as Record<string, unknown>;
  const errors: ValidationIssue[] = [];

  if (!record.resourceId || typeof record.resourceId !== 'string' || !MONGO_ID_REGEX.test(record.resourceId)) {
    errors.push({ field: 'resourceId', message: 'resourceId is required and must be a 24-character hex ObjectId' });
  }

  let startAtDate: Date | null = null;
  if (!record.startAt || typeof record.startAt !== 'string') {
    errors.push({ field: 'startAt', message: 'startAt is required and must be an ISO date string' });
  } else {
    startAtDate = new Date(record.startAt);
    if (isNaN(startAtDate.getTime())) {
      errors.push({ field: 'startAt', message: 'startAt is not a valid date string' });
    }
  }

  let endAtDate: Date | null = null;
  if (!record.endAt || typeof record.endAt !== 'string') {
    errors.push({ field: 'endAt', message: 'endAt is required and must be an ISO date string' });
  } else {
    endAtDate = new Date(record.endAt);
    if (isNaN(endAtDate.getTime())) {
      errors.push({ field: 'endAt', message: 'endAt is not a valid date string' });
    }
  }

  if (startAtDate && endAtDate && !isNaN(startAtDate.getTime()) && !isNaN(endAtDate.getTime())) {
    if (startAtDate.getTime() >= endAtDate.getTime()) {
      errors.push({ field: 'startAt', message: 'startAt must be earlier than endAt for a half-open interval' });
    }
  }

  if (record.excludeReservationId !== undefined) {
    if (typeof record.excludeReservationId !== 'string' || !MONGO_ID_REGEX.test(record.excludeReservationId)) {
      errors.push({ field: 'excludeReservationId', message: 'excludeReservationId must be a 24-character hex ObjectId' });
    }
  }

  if (errors.length > 0) {
    return { success: false, errors };
  }

  return {
    success: true,
    data: {
      resourceId: record.resourceId as string,
      startAt: record.startAt as string,
      endAt: record.endAt as string,
      excludeReservationId: record.excludeReservationId as string | undefined,
    },
  };
}

export interface CalculateSlotsQueryInput {
  resourceId: string;
  date: string;
  slotDurationMinutes?: number;
}

export function validateCalculateSlotsQuery(data: unknown): ValidationResult<CalculateSlotsQueryInput> {
  const record = (data || {}) as Record<string, unknown>;
  const errors: ValidationIssue[] = [];

  if (!record.resourceId || typeof record.resourceId !== 'string' || !MONGO_ID_REGEX.test(record.resourceId)) {
    errors.push({ field: 'resourceId', message: 'resourceId is required and must be a 24-character hex ObjectId' });
  }

  if (!record.date || typeof record.date !== 'string' || !isValidCalendarDate(record.date)) {
    errors.push({ field: 'date', message: 'date is required and must be in YYYY-MM-DD calendar format' });
  }

  let slotDuration: number | undefined;
  if (record.slotDurationMinutes !== undefined) {
    const parsed = Number(record.slotDurationMinutes);
    if (!Number.isInteger(parsed) || parsed < 5 || parsed > 1440) {
      errors.push({ field: 'slotDurationMinutes', message: 'slotDurationMinutes must be an integer between 5 and 1440' });
    } else {
      slotDuration = parsed;
    }
  }

  if (errors.length > 0) {
    return { success: false, errors };
  }

  return {
    success: true,
    data: {
      resourceId: record.resourceId as string,
      date: record.date as string,
      slotDurationMinutes: slotDuration,
    },
  };
}

// ─── Phase 3.2 Approval Workflow Validators ─────────────────────────────────

export interface ApproveBookingBodyInput {
  comment?: string;
}

export function validateApproveBookingBody(data: unknown): ValidationResult<ApproveBookingBodyInput> {
  const record = (data || {}) as Record<string, unknown>;
  const errors: ValidationIssue[] = [];

  let comment: string | undefined = undefined;
  if (record.comment !== undefined && record.comment !== null) {
    if (typeof record.comment !== 'string') {
      errors.push({ field: 'comment', message: 'comment must be a string' });
    } else {
      comment = record.comment.trim();
      if (comment.length > 500) {
        errors.push({ field: 'comment', message: 'comment cannot exceed 500 characters' });
      }
    }
  }

  if (errors.length > 0) {
    return { success: false, errors };
  }

  return {
    success: true,
    data: { comment },
  };
}

export interface RejectBookingBodyInput {
  reason: string;
}

export function validateRejectBookingBody(data: unknown): ValidationResult<RejectBookingBodyInput> {
  const record = (data || {}) as Record<string, unknown>;
  const errors: ValidationIssue[] = [];

  if (!record.reason || typeof record.reason !== 'string') {
    errors.push({ field: 'reason', message: 'Rejection reason is required and must be a string' });
  } else {
    const trimmed = record.reason.trim();
    if (trimmed.length < 5 || trimmed.length > 500) {
      errors.push({ field: 'reason', message: 'Rejection reason must be between 5 and 500 characters' });
    }
  }

  if (errors.length > 0) {
    return { success: false, errors };
  }

  return {
    success: true,
    data: { reason: (record.reason as string).trim() },
  };
}

export interface PendingApprovalsQueryInput {
  page?: number;
  limit?: number;
  sortBy?: 'deadline_asc' | 'created_asc' | 'created_desc';
}

export function validatePendingApprovalsQuery(data: unknown): ValidationResult<PendingApprovalsQueryInput> {
  const record = (data || {}) as Record<string, unknown>;
  const errors: ValidationIssue[] = [];
  const result: PendingApprovalsQueryInput = {};

  if (record.page !== undefined) {
    const p = Number(record.page);
    if (!Number.isInteger(p) || p < 1) {
      errors.push({ field: 'page', message: 'page must be an integer >= 1' });
    } else {
      result.page = p;
    }
  }

  if (record.limit !== undefined) {
    const l = Number(record.limit);
    if (!Number.isInteger(l) || l < 1 || l > 100) {
      errors.push({ field: 'limit', message: 'limit must be an integer between 1 and 100' });
    } else {
      result.limit = l;
    }
  }

  if (record.sortBy !== undefined) {
    const allowed = ['deadline_asc', 'created_asc', 'created_desc'];
    if (!allowed.includes(record.sortBy as string)) {
      errors.push({ field: 'sortBy', message: `sortBy must be one of: ${allowed.join(', ')}` });
    } else {
      result.sortBy = record.sortBy as 'deadline_asc' | 'created_asc' | 'created_desc';
    }
  }

  if (errors.length > 0) {
    return { success: false, errors };
  }

  return { success: true, data: result };
}

// ─── Phase 3.3 Check-In & Auto-Release Validators ───────────────────────────

export interface CheckInBodyInput {
  token: string;
  resourceId: string;
  method?: 'QR_SCAN';
}

export function validateCheckInBody(data: unknown): ValidationResult<CheckInBodyInput> {
  const record = (data || {}) as Record<string, unknown>;
  const errors: ValidationIssue[] = [];

  if (!record.token || typeof record.token !== 'string') {
    errors.push({ field: 'token', message: 'token is required and must be a string' });
  } else if (record.token.trim().length < 32) {
    errors.push({ field: 'token', message: 'token must be at least 32 characters' });
  }

  if (!record.resourceId || typeof record.resourceId !== 'string' || !MONGO_ID_REGEX.test(record.resourceId)) {
    errors.push({ field: 'resourceId', message: 'resourceId is required and must be a valid 24-character hex ObjectId' });
  }

  if (record.method !== undefined && record.method !== 'QR_SCAN') {
    errors.push({ field: 'method', message: 'method must be QR_SCAN' });
  }

  if (errors.length > 0) {
    return { success: false, errors };
  }

  return {
    success: true,
    data: {
      token: (record.token as string).trim(),
      resourceId: record.resourceId as string,
      method: 'QR_SCAN',
    },
  };
}

export interface ManualCheckInBodyInput {
  justification: string;
}

export function validateManualCheckInBody(data: unknown): ValidationResult<ManualCheckInBodyInput> {
  const record = (data || {}) as Record<string, unknown>;
  const errors: ValidationIssue[] = [];

  if (!record.justification || typeof record.justification !== 'string') {
    errors.push({ field: 'justification', message: 'justification is required and must be a string' });
  } else {
    const trimmed = record.justification.trim();
    if (trimmed.length < 10 || trimmed.length > 500) {
      errors.push({ field: 'justification', message: 'justification must be between 10 and 500 characters' });
    }
  }

  if (errors.length > 0) {
    return { success: false, errors };
  }

  return {
    success: true,
    data: { justification: (record.justification as string).trim() },
  };
}

export interface PardonNoShowBodyInput {
  reason: string;
}

export function validatePardonNoShowBody(data: unknown): ValidationResult<PardonNoShowBodyInput> {
  const record = (data || {}) as Record<string, unknown>;
  const errors: ValidationIssue[] = [];

  if (!record.reason || typeof record.reason !== 'string') {
    errors.push({ field: 'reason', message: 'reason is required and must be a string' });
  } else {
    const trimmed = record.reason.trim();
    if (trimmed.length < 10 || trimmed.length > 500) {
      errors.push({ field: 'reason', message: 'reason must be between 10 and 500 characters' });
    }
  }

  if (errors.length > 0) {
    return { success: false, errors };
  }

  return {
    success: true,
    data: { reason: (record.reason as string).trim() },
  };
}
