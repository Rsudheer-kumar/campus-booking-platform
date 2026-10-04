/**
 * CampusFlow API - Custom Application Errors
 * Provides typed, structured error classes for operational HTTP errors.
 */

export type ErrorCode =
  | 'BAD_REQUEST'
  | 'UNAUTHORIZED'
  | 'FORBIDDEN'
  | 'NOT_FOUND'
  | 'CONFLICT'
  | 'VALIDATION_ERROR'
  | 'UNPROCESSABLE_ENTITY'
  | 'INVALID_JSON'
  | 'ROUTE_NOT_FOUND'
  | 'INTERNAL_SERVER_ERROR'
  | 'RESERVATION_NOT_FOUND'
  | 'CHECKIN_WINDOW_NOT_OPEN'
  | 'CHECKIN_WINDOW_EXPIRED'
  | 'ALREADY_CHECKED_IN'
  | 'RESERVATION_NOT_CONFIRMED'
  | 'INVALID_RESERVATION_STATUS'
  | 'RESOURCE_MISMATCH'
  | 'INVALID_CHECKIN_TOKEN'
  | 'TOKEN_EXPIRED'
  | 'TOKEN_ALREADY_USED'
  | 'RATE_LIMIT_EXCEEDED'
  | 'PARDON_NOT_ALLOWED'
  | 'ALREADY_PARDONED'
  | 'NO_SHOW_RESTRICTION_ACTIVE'
  | 'RESERVATION_ENDED'
  | (string & {});

export class AppError extends Error {
  public readonly statusCode: number;
  public readonly code: ErrorCode;
  public readonly isOperational: boolean;
  public readonly details?: unknown;

  constructor(
    statusCode: number,
    code: ErrorCode,
    message: string,
    details?: unknown,
    isOperational = true
  ) {
    super(message);
    this.name = this.constructor.name;
    this.statusCode = statusCode;
    this.code = code;
    this.isOperational = isOperational;
    this.details = details;

    Error.captureStackTrace(this, this.constructor);
  }
}

export class BadRequestError extends AppError {
  constructor(message = 'Bad Request', details?: unknown) {
    super(400, 'BAD_REQUEST', message, details);
  }
}

export class UnauthorizedError extends AppError {
  constructor(message = 'Unauthorized', details?: unknown) {
    super(401, 'UNAUTHORIZED', message, details);
  }
}

export class ForbiddenError extends AppError {
  constructor(message = 'Forbidden', details?: unknown) {
    super(403, 'FORBIDDEN', message, details);
  }
}

export class NotFoundError extends AppError {
  constructor(message = 'Resource not found', details?: unknown) {
    super(404, 'NOT_FOUND', message, details);
  }
}

export class ConflictError extends AppError {
  constructor(message = 'Conflict with current resource state', details?: unknown) {
    super(409, 'CONFLICT', message, details);
  }
}

export class InternalServerError extends AppError {
  constructor(message = 'Internal server error', details?: unknown) {
    super(500, 'INTERNAL_SERVER_ERROR', message, details, false);
  }
}

export class ValidationError extends AppError {
  constructor(message = 'Validation failed', details?: unknown) {
    super(400, 'VALIDATION_ERROR', message, details);
  }
}

export class UnprocessableEntityError extends AppError {
  constructor(message = 'Unprocessable Entity', details?: unknown) {
    super(422, 'UNPROCESSABLE_ENTITY', message, details);
  }
}
