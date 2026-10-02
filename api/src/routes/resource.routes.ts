/**
 * CampusFlow API - Resource Routes
 * Declares endpoints for facility and equipment catalogue discovery.
 */

import { Router } from 'express';
import { ResourceController } from '../controllers/resource.controller';
import { validateRequest } from '../middleware/validate';
import { validateMongoId } from '../validators';
import { validateResourceQuery } from '../validators/resource.validator';

const router = Router();

// Resource discovery catalogue endpoints (accessible publicly / across authenticated roles)
router.get(
  '/',
  validateRequest({ query: validateResourceQuery }),
  ResourceController.listResources
);

router.get(
  '/:id',
  validateRequest({ params: validateMongoId('id') }),
  ResourceController.getResourceById
);

export default router;
