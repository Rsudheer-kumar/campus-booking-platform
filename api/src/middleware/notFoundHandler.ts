/**
 * CampusFlow API - 404 Not Found Middleware
 * Intercepts unhandled routes and returns a structured JSON error.
 */

import type { Request, Response } from 'express';
import { sendError } from '../utils/response';

export function notFoundHandler(req: Request, res: Response): void {
  sendError(
    res,
    'ROUTE_NOT_FOUND',
    `Route not found: ${req.method} ${req.originalUrl}`,
    404
  );
}
