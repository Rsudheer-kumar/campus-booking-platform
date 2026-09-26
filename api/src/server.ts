/**
 * CampusFlow API - Server Entrypoint
 * Starts the HTTP server, initializes external connections (MongoDB, Redis),
 * and handles graceful shutdown signals.
 */

import http from 'http';
import { app } from './app';
import { env } from './config/env';
import { connectDatabase, disconnectDatabase } from './config/database';
import { connectRedis, disconnectRedis } from './config/redis';
import { logger } from './utils/logger';

let server: http.Server | null = null;
let isShuttingDown = false;

async function startServer(): Promise<void> {
  try {
    logger.info(`Starting CampusFlow API in "${env.NODE_ENV}" mode...`);

    // 1. Create HTTP Server
    server = http.createServer(app);

    server.listen(env.PORT, () => {
      logger.info(`CampusFlow API HTTP server listening on port ${env.PORT}`);
      logger.info(`Health check available at http://localhost:${env.PORT}/api/health`);
    });

    // 2. Connect to MongoDB (non-blocking for development if service offline)
    try {
      await connectDatabase();
    } catch (dbError) {
      logger.warn('Initial MongoDB connection failed. Server running with degraded database state.', {
        error: dbError instanceof Error ? dbError.message : dbError,
      });
    }

    // 3. Connect to Redis (non-blocking for development if service offline)
    try {
      await connectRedis();
    } catch (redisError) {
      logger.warn('Initial Redis connection failed. Server running with degraded Redis state.', {
        error: redisError instanceof Error ? redisError.message : redisError,
      });
    }
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
