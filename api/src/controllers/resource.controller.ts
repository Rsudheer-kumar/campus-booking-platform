/**
 * CampusFlow API - Resource Controller
 * Provides read-only facility and equipment catalogue endpoints.
 */

import type { Request, Response } from 'express';
import { Resource } from '../models/resource.model';
import { sendSuccess, sendError } from '../utils/response';
import type { ResourceQueryFilter } from '../validators/resource.validator';
import { logger } from '../utils/logger';

export class ResourceController {
  /**
   * GET /api/resources
   * List resources with optional search, building, category, and status filters.
   */
  public static async listResources(req: Request, res: Response): Promise<void> {
    try {
      const filters = (req.query || {}) as unknown as ResourceQueryFilter;
      const { search, building, status, resourceType, page = 1, limit = 20 } = filters || {};

      const query: Record<string, unknown> = {};

      if (status) {
        query.status = status;
      }

      if (building) {
        query['location.building'] = { $regex: building, $options: 'i' };
      }

      if (resourceType) {
        query.resourceType = resourceType;
      }

      if (search) {
        query.$or = [
          { name: { $regex: search, $options: 'i' } },
          { code: { $regex: search, $options: 'i' } },
          { 'location.building': { $regex: search, $options: 'i' } },
        ];
      }

      const skip = (page - 1) * limit;

      const [resources, total] = await Promise.all([
        Resource.find(query)
          .populate('resourceType', 'name code category')
          .sort({ name: 1 })
          .skip(skip)
          .limit(limit)
          .lean(),
        Resource.countDocuments(query),
      ]);

      sendSuccess(res, {
        resources,
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit) || 1,
      });
    } catch (error) {
      logger.error('Failed to list resources', error instanceof Error ? error.message : error);
      sendError(res, 'INTERNAL_SERVER_ERROR', 'An unexpected error occurred while fetching resources', 500);
    }
  }

  /**
   * GET /api/resources/:id
   * Retrieve resource by ID with populated resourceType.
   */
  public static async getResourceById(req: Request, res: Response): Promise<void> {
    try {
      const { id } = req.params;

      const resource = await Resource.findById(id)
        .populate('resourceType', 'name code category')
        .lean();

      if (!resource) {
        sendError(res, 'NOT_FOUND', `Resource with identifier "${id}" not found`, 404);
        return;
      }

      sendSuccess(res, resource);
    } catch (error) {
      logger.error('Failed to get resource by ID', error instanceof Error ? error.message : error);
      sendError(res, 'INTERNAL_SERVER_ERROR', 'An unexpected error occurred while retrieving resource', 500);
    }
  }
}
