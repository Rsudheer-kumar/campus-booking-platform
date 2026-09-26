/**
 * CampusFlow API - Health Routes
 * Defines routes for service health and diagnostics.
 */

import { Router } from 'express';
import { getHealth } from '../controllers/health.controller';

const router = Router();

router.get('/', getHealth);

export default router;
