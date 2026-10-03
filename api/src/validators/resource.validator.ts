/**
 * CampusFlow API - Resource Query Validator
 * Validates search, filtering, and pagination for resource discovery.
 */

import type { ValidationResult } from '../middleware/validate';
import { ResourceStatus, type ResourceStatusType } from '../models/resource.model';
import { validatePaginationQuery } from './index';

export interface ResourceQueryFilter {
  search?: string;
  building?: string;
  status?: ResourceStatusType;
  resourceType?: string;
  page: number;
  limit: number;
}

const hex24Regex = /^[0-9a-fA-F]{24}$/;

export function validateResourceQuery(data: unknown): ValidationResult<ResourceQueryFilter> {
  const record = (data || {}) as Record<string, unknown>;
  const errors = [];

  const paginationResult = validatePaginationQuery(data);
  if (!paginationResult.success || !paginationResult.data) {
    return paginationResult as ValidationResult<ResourceQueryFilter>;
  }

  const { page, limit } = paginationResult.data;
  let search: string | undefined;
  let building: string | undefined;
  let status: ResourceStatusType | undefined;
  let resourceType: string | undefined;

  if (record.search !== undefined) {
    if (typeof record.search !== 'string' || record.search.trim().length === 0) {
      errors.push({ field: 'search', message: 'search parameter must be a non-empty string if provided' });
    } else {
      search = record.search.trim();
    }
  }

  if (record.building !== undefined) {
    if (typeof record.building !== 'string' || record.building.trim().length === 0) {
      errors.push({ field: 'building', message: 'building parameter must be a non-empty string if provided' });
    } else {
      building = record.building.trim();
    }
  }

  if (record.status !== undefined) {
    const validStatuses = Object.values(ResourceStatus);
    if (typeof record.status !== 'string' || !validStatuses.includes(record.status as ResourceStatusType)) {
      errors.push({
        field: 'status',
        message: `status must be one of: ${validStatuses.join(', ')}`,
      });
    } else {
      status = record.status as ResourceStatusType;
    }
  }

  if (record.resourceType !== undefined) {
    if (typeof record.resourceType !== 'string' || !hex24Regex.test(record.resourceType)) {
      errors.push({
        field: 'resourceType',
        message: 'resourceType must be a valid 24-character hexadecimal ObjectId',
      });
    } else {
      resourceType = record.resourceType;
    }
  }

  if (errors.length > 0) {
    return { success: false, errors };
  }

  return {
    success: true,
    data: {
      search,
      building,
      status,
      resourceType,
      page,
      limit,
    },
  };
}
