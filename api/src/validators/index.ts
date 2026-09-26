/**
 * CampusFlow API - Validation Foundation
 * Reusable schema validators and helpers for future modules.
 */

import type { ValidationResult } from '../middleware/validate';

/**
 * Validates a MongoDB 24-character hexadecimal ObjectId.
 */
export function validateMongoId(idName = 'id') {
  const hex24Regex = /^[0-9a-fA-F]{24}$/;
  return (data: unknown): ValidationResult<{ [key: string]: string }> => {
    const record = data as Record<string, unknown> | undefined;
    const value = record?.[idName];

    if (!value || typeof value !== 'string' || !hex24Regex.test(value)) {
      return {
        success: false,
        errors: [{ field: idName, message: `Invalid identifier format for "${idName}". Expected 24-char hex string.` }],
      };
    }

    return {
      success: true,
      data: { [idName]: value },
    };
  };
}

/**
 * Validates common pagination query parameters (page, limit).
 */
export function validatePaginationQuery(data: unknown): ValidationResult<{ page: number; limit: number }> {
  const record = (data || {}) as Record<string, unknown>;
  const errors = [];

  let page = 1;
  let limit = 20;

  if (record.page !== undefined) {
    const parsedPage = Number(record.page);
    if (!Number.isInteger(parsedPage) || parsedPage < 1) {
      errors.push({ field: 'page', message: 'Page must be an integer greater than or equal to 1' });
    } else {
      page = parsedPage;
    }
  }

  if (record.limit !== undefined) {
    const parsedLimit = Number(record.limit);
    if (!Number.isInteger(parsedLimit) || parsedLimit < 1 || parsedLimit > 100) {
      errors.push({ field: 'limit', message: 'Limit must be an integer between 1 and 100' });
    } else {
      limit = parsedLimit;
    }
  }

  if (errors.length > 0) {
    return { success: false, errors };
  }

  return {
    success: true,
    data: { page, limit },
  };
}
