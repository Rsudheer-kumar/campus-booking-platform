/**
 * CampusFlow API - Standardized Response Helpers
 * Ensures consistent JSON response structure across all endpoints.
 */

import type { Response } from 'express';

export interface ApiResponseSuccess<T> {
  success: true;
  data: T;
}

export interface ApiErrorDetails {
  code: string;
  message: string;
  details?: unknown;
}

export interface ApiResponseError {
  success: false;
  error: ApiErrorDetails;
}

export function sendSuccess<T>(res: Response, data: T, statusCode = 200): Response {
  const body: ApiResponseSuccess<T> = {
    success: true,
    data,
  };
  return res.status(statusCode).json(body);
}

export function sendError(
  res: Response,
  code: string,
  message: string,
  statusCode = 500,
  details?: unknown
): Response {
  const body: ApiResponseError = {
    success: false,
    error: {
      code,
      message,
      ...(details !== undefined ? { details } : {}),
    },
  };
  return res.status(statusCode).json(body);
}
