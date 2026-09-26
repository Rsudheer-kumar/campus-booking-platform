/**
 * CampusFlow API - Application Configuration
 * Configures Express application, middleware pipeline, API routing,
 * and error handling. Exported without starting the HTTP server for testability.
 */

import express, { type Application, type Request, type Response } from 'express';
import cors from 'cors';
import { env } from './config/env';
import { requestLogger } from './middleware/requestLogger';
import { errorHandler } from './middleware/errorHandler';
import { notFoundHandler } from './middleware/notFoundHandler';
import apiRoutes from './routes';

export function createApp(): Application {
  const app: Application = express();

  // 1. Basic Security Headers Middleware
  app.use((_req: Request, res: Response, next) => {
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('X-Frame-Options', 'DENY');
    res.setHeader('X-XSS-Protection', '0');
    res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
    next();
  });

  // 2. CORS Configuration
  app.use(
    cors({
      origin: (origin, callback) => {
        // Allow requests with no origin (like mobile apps, curl, server-to-server)
        if (!origin) return callback(null, true);

        // Allow configured origin or localhost in development
        if (
          origin === env.CORS_ORIGIN ||
          (env.isDevelopment && /^http:\/\/localhost(:\d+)?$/.test(origin))
        ) {
          return callback(null, true);
        }

        return callback(new Error(`Origin ${origin} not allowed by CORS`));
      },
      credentials: true,
      methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
      allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With'],
    })
  );

  // 3. Body Parsing Middleware
  app.use(express.json({ limit: '10kb' }));
  app.use(express.urlencoded({ extended: true, limit: '10kb' }));

  // 4. Request Logging
  app.use(requestLogger);

  // 5. Root Info Endpoint
  app.get('/', (_req: Request, res: Response) => {
    res.status(200).json({
      success: true,
      data: {
        name: 'CampusFlow API',
        version: '1.0.0',
        environment: env.NODE_ENV,
        healthCheck: '/api/health',
      },
    });
  });

  // 6. Main API Routes (prefixed with /api)
  app.use('/api', apiRoutes);

  // 7. 404 Route Handler
  app.use(notFoundHandler);

  // 8. Centralized Error Handler (must be last)
  app.use(errorHandler);

  return app;
}

export const app: Application = createApp();
