/**
 * CampusFlow API - Health Controller
 * Coordinates health checks between routing and services.
 */

import type { Request, Response } from 'express';
import { checkHealth } from '../services/health.service';
import { sendSuccess } from '../utils/response';

export function getHealth(_req: Request, res: Response): void {
  const healthData = checkHealth();
  sendSuccess(res, healthData, 200);
}
