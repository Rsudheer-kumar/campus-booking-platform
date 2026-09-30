/**
 * CampusFlow API - Request Validation Foundation Middleware
 * Provides a clean, reusable validation pattern for future modules
 * supporting body, query, and path parameters.
 */

import type { Request, Response, NextFunction } from 'express';
import { ValidationError } from '../utils/errors';

export interface ValidationIssue {
  field: string;
  message: string;
}

export interface ValidationResult<T = unknown> {
  success: boolean;
  data?: T;
  errors?: ValidationIssue[];
}

export type ValidatorFunction<T = unknown> = (data: unknown) => ValidationResult<T>;

export interface RequestValidationSchema {
  body?: ValidatorFunction;
  query?: ValidatorFunction;
  params?: ValidatorFunction;
}

/**
 * Creates an Express middleware that validates req.body, req.query, or req.params.
 * If validation fails, raises a structured ValidationError (HTTP 400).
 */
export function validateRequest(schema: RequestValidationSchema) {
  return (req: Request, _res: Response, next: NextFunction): void => {
    const issues: ValidationIssue[] = [];

    if (schema.params) {
      const result = schema.params(req.params);
      if (!result.success && result.errors) {
        issues.push(...result.errors.map((e) => ({ ...e, field: `params.${e.field}` })));
      } else if (result.data && typeof result.data === 'object') {
        req.params = result.data as Record<string, string>;
      }
    }

    if (schema.query) {
      const result = schema.query(req.query);
      if (!result.success && result.errors) {
        issues.push(...result.errors.map((e) => ({ ...e, field: `query.${e.field}` })));
      } else if (result.data && typeof result.data === 'object') {
        Object.defineProperty(req, 'query', {
          value: result.data,
          writable: true,
          configurable: true,
          enumerable: true,
        });
      }
    }

    if (schema.body) {
      const result = schema.body(req.body);
      if (!result.success && result.errors) {
        issues.push(...result.errors.map((e) => ({ ...e, field: `body.${e.field}` })));
      } else if (result.data) {
        req.body = result.data;
      }
    }

    if (issues.length > 0) {
      return next(new ValidationError('Request validation failed', issues));
    }

    next();
  };
}
