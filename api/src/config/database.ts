/**
 * CampusFlow API - MongoDB Database Configuration Foundation
 * Manages Mongoose connection lifecycle, handles reconnects/errors, and supports graceful shutdown.
 */

import mongoose from 'mongoose';
import { env } from './env';
import { logger } from '../utils/logger';

let isConnecting = false;

export async function connectDatabase(): Promise<typeof mongoose | null> {
  // If already connected, return existing connection
  if (mongoose.connection.readyState === 1) {
    logger.debug('MongoDB already connected');
    return mongoose;
  }

  // Prevent duplicate concurrent connection attempts
  if (isConnecting) {
    logger.debug('MongoDB connection attempt already in progress');
    return null;
  }

  isConnecting = true;

  try {
    logger.info('Connecting to MongoDB...', { uri: env.MONGODB_URI.replace(/\/\/([^:]+):([^@]+)@/, '//$1:****@') });

    const connection = await mongoose.connect(env.MONGODB_URI, {
      serverSelectionTimeoutMS: 5000,
      autoIndex: !env.isProduction,
    });

    logger.info('MongoDB connected successfully');
    return connection;
  } catch (error) {
    logger.error('Failed to connect to MongoDB', error instanceof Error ? error.message : error);
    throw error;
  } finally {
    isConnecting = false;
  }
}

export async function disconnectDatabase(): Promise<void> {
  if (mongoose.connection.readyState !== 0) {
    try {
      await mongoose.disconnect();
      logger.info('MongoDB disconnected successfully');
    } catch (error) {
      logger.error('Error disconnecting MongoDB', error instanceof Error ? error.message : error);
      throw error;
    }
  }
}

export function getDatabaseState(): 'connected' | 'connecting' | 'disconnecting' | 'disconnected' {
  switch (mongoose.connection.readyState) {
    case 1:
      return 'connected';
    case 2:
      return 'connecting';
    case 3:
      return 'disconnecting';
    case 0:
    default:
      return 'disconnected';
  }
}

export function isDatabaseConnected(): boolean {
  return mongoose.connection.readyState === 1;
}

// Connection event hooks for monitoring
mongoose.connection.on('error', (err) => {
  logger.error('MongoDB connection runtime error', err instanceof Error ? err.message : err);
});

mongoose.connection.on('disconnected', () => {
  logger.warn('MongoDB connection lost / disconnected');
});
