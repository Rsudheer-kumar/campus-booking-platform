/**
 * CampusFlow API - Server Entrypoint
 * Starts the HTTP server, initializes external connections (MongoDB, Redis),
 * and handles graceful shutdown signals.
 */

import http from 'http';
import { app } from './app';
import { env } from './config/env';
import {
  connectDatabase,
  disconnectDatabase,
  isDatabaseConnected,
  verifyDatabaseReadiness,
  redactMongoUri,
  getDatabaseState,
} from './config/database';
import { connectRedis, disconnectRedis, getRedisState } from './config/redis';
import { logger } from './utils/logger';

let server: http.Server | null = null;
let isShuttingDown = false;

async function startServer(): Promise<void> {
  try {
    logger.info(`Starting CampusFlow API in "${env.NODE_ENV}" mode...`);

    // 1. Connect and verify MongoDB (REQUIRED: must succeed before HTTP server listens)
    try {
      await connectDatabase();
      const readiness = await verifyDatabaseReadiness();
      logger.info('MongoDB verified ready', {
        database: readiness.databaseName,
        isWritablePrimary: readiness.isWritablePrimary,
        replicaSet: readiness.setName || 'standalone',
      });

      if (readiness.setName && readiness.setName !== 'rs0') {
        logger.warn(
          `Connected to replica set "${readiness.setName}", expected "rs0". Ensure transaction support is configured properly.`
        );
      }
    } catch (dbError) {
      const errorMsg = dbError instanceof Error ? dbError.message : String(dbError);
      logger.error(
        `\n================================================================================\n` +
        `[CampusFlow Fatal Startup Error] MongoDB is required but unavailable.\n` +
        `Details: ${errorMsg}\n` +
        `Target URI: ${redactMongoUri(env.MONGODB_URI)}\n` +
        `Expected: database "campusflow", port 27017, replica set "rs0" (writable primary)\n\n` +
        `Actionable Resolution:\n` +
        `  Start the MongoDB replica set instance in a PowerShell terminal:\n` +
        `  & "C:\\Program Files\\MongoDB\\Server\\8.2\\bin\\mongod.exe" --config "C:\\Users\\subba\\mongodb-rs0\\mongod-rs0.conf"\n` +
        `  Then run: npm run dev\n` +
        `================================================================================\n`
      );
      await disconnectDatabase().catch(() => {});
      process.exit(1);
    }

    // 2. Connect to Redis (OPTIONAL / DEGRADED ALLOWED)
    try {
      await connectRedis();
    } catch {
      logger.warn(
        'Redis unavailable — application running in documented degraded mode (distributed caching & locks unavailable).'
      );
    }

    // 3. Create HTTP Server with Approach 1 Request Listener Guard
    server = http.createServer((req, res) => {
      const pathname = req.url ? req.url.split('?')[0] : '';

      // Post-startup disconnect guard: return 503 immediately for /api requests if MongoDB drops
      if (!isDatabaseConnected() && pathname.startsWith('/api')) {
        if (pathname === '/api/health' || pathname === '/api/health/') {
          res.statusCode = 503;
          res.setHeader('Content-Type', 'application/json');
          res.end(
            JSON.stringify({
              success: false,
              data: {
                status: 'unhealthy',
                timestamp: new Date().toISOString(),
                uptime: Math.floor(process.uptime()),
                environment: env.NODE_ENV,
                services: {
                  database: getDatabaseState() === 'connected' ? 'error' : getDatabaseState(),
                  redis: getRedisState(),
                },
              },
              error: {
                code: 'DATABASE_UNAVAILABLE',
                message: 'Database is disconnected or unavailable',
              },
            })
          );
          return;
        }

        res.statusCode = 503;
        res.setHeader('Content-Type', 'application/json');
        res.end(
          JSON.stringify({
            success: false,
            error: {
              code: 'DATABASE_UNAVAILABLE',
              message: 'Database service is currently unavailable. Please try again shortly.',
            },
          })
        );
        return;
      }

      app(req, res);
    });

    server.on('error', (err: NodeJS.ErrnoException) => {
      if (err.code === 'EADDRINUSE') {
        logger.error(
          `Port ${env.PORT} is already in use by another process. Check with "Get-NetTCPConnection -LocalPort ${env.PORT}" or terminate the existing process.`
        );
        process.exit(1);
      }
    });

    server.listen(env.PORT, () => {
      logger.info(`CampusFlow API HTTP server listening on port ${env.PORT}`);
      logger.info(`Health check available at http://localhost:${env.PORT}/api/health`);
    });
  } catch (error) {
    logger.error('Fatal error during API startup', error instanceof Error ? error.message : error);
    process.exit(1);
  }
}

async function shutdown(signal: string): Promise<void> {
  if (isShuttingDown) return;
  isShuttingDown = true;

  logger.info(`Received ${signal}. Initiating graceful shutdown...`);

  // Force shutdown after timeout to prevent hanging process
  const forceExitTimeout = setTimeout(() => {
    logger.error('Graceful shutdown timed out. Forcing process termination.');
    process.exit(1);
  }, 10000);
  forceExitTimeout.unref();

  try {
    // 1. Close HTTP server (stop accepting new requests)
    if (server) {
      await new Promise<void>((resolve, reject) => {
        server?.close((err) => {
          if (err) return reject(err);
          logger.info('HTTP server closed successfully');
          resolve();
        });
      });
    }

    // 2. Disconnect from Redis
    await disconnectRedis();

    // 3. Disconnect from MongoDB
    await disconnectDatabase();

    logger.info('CampusFlow API shutdown complete. Exiting.');
    process.exit(0);
  } catch (error) {
    logger.error('Error during graceful shutdown', error instanceof Error ? error.message : error);
    process.exit(1);
  }
}

// Register process signal handlers
process.on('SIGTERM', () => void shutdown('SIGTERM'));
process.on('SIGINT', () => void shutdown('SIGINT'));

process.on('uncaughtException', (error) => {
  logger.error('Uncaught Exception detected', {
    message: error.message,
    stack: error.stack,
  });
  void shutdown('uncaughtException');
});

process.on('unhandledRejection', (reason) => {
  logger.error('Unhandled Promise Rejection detected', {
    reason: reason instanceof Error ? reason.message : reason,
  });
});

// Start server
void startServer();
