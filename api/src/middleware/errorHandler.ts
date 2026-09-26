/**
 * CampusFlow API - Centralized Error Handling Middleware
 * Intercepts all operational and programming errors, formats consistent JSON responses,
 * and ensures stack traces are never exposed in production.
 */

import type { Request, Response, NextFunction } from 'express';
import { AppError } from '../utils/errors';
import { sendError } from '../utils/response';
import { logger } from '../utils/logger';
import { env } from '../config/env';

interface SyntaxHttpError extends SyntaxError {
  status?: number;
  statusCode?: number;
  body?: unknown;
}

interface MongooseErrorLike {
  name: string;
  message: string;
  errors?: Record<string, { message: string; path?: string }>;
  path?: string;
  value?: unknown;
}

export function errorHandler(
  err: Error | AppError | SyntaxHttpError | MongooseErrorLike,
  req: Request,
  res: Response,
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  next: NextFunction
): void {
  // 1. Handled Operational Application Errors
  if (err instanceof AppError) {
    if (err.statusCode >= 500) {
      logger.error(`[AppError ${err.statusCode}] ${err.message}`, {
        code: err.code,
        path: req.originalUrl,
        stack: err.stack,
      });
    }

    sendError(res, err.code, err.message, err.statusCode, err.details);
    return;
  }

  // 2. Malformed JSON Body Error (thrown by express.json())
  if (err instanceof SyntaxError && 'status' in err && (err as SyntaxHttpError).status === 400) {
    sendError(res, 'INVALID_JSON', 'Malformed JSON in request body', 400);
    return;
  }

  // 3. Mongoose Validation Error
  if (err.name === 'ValidationError' && 'errors' in err) {
    const details = Object.entries(err.errors || {}).map(([field, item]) => ({
      field,
      message: item.message,
    }));
    sendError(res, 'VALIDATION_ERROR', 'Database validation failed', 400, details);
    return;
  }

  // 4. Mongoose Invalid ObjectId Cast Error
  if (err.name === 'CastError') {
    const castErr = err as MongooseErrorLike;
    sendError(
      res,
      'INVALID_ID',
      `Invalid format for identifier field: "${castErr.path || 'id'}"`,
      400
    );
    return;
  }

  // 5. Unhandled / Unexpected Errors (500)
  logger.error(`[UnhandledError 500] ${err.message || 'Unknown error'}`, {
    path: req.originalUrl,
    method: req.method,
    stack: err instanceof Error ? err.stack : undefined,
  });

  const message = env.isProduction
    ? 'An unexpected error occurred. Please try again later.'
    : err.message || 'Internal server error';

  const details = !env.isProduction && err instanceof Error ? { stack: err.stack } : undefined;

  sendError(res, 'INTERNAL_SERVER_ERROR', message, 500, details);
}
