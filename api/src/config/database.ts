/**
 * CampusFlow API - MongoDB Database Configuration Foundation
 * Manages Mongoose connection lifecycle, handles reconnects/errors, and supports graceful shutdown.
 */

import mongoose, { type ConnectOptions } from 'mongoose';
import { env } from './env';
import { logger } from '../utils/logger';

// Global Mongoose Configuration
mongoose.set('strict', true);
mongoose.set('strictQuery', true);

let isConnecting = false;
let lastConnectionError: string | null = null;

/**
 * Sanitizes MongoDB connection string by redacting password/credentials if present.
 */
export function redactMongoUri(uri: string): string {
  return uri.replace(/\/\/([^:]+):([^@]+)@/, '//$1:****@');
}

/**
 * Connects to MongoDB with safe timeouts and duplicate connection guards.
 * Accepts an optional URI override for testing controlled connection failures.
 */
export async function connectDatabase(uriOverride?: string): Promise<typeof mongoose | null> {
  const targetUri = uriOverride || env.MONGODB_URI;

  // If already connected to the same target, return existing connection
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
  lastConnectionError = null;

  const options: ConnectOptions = {
    serverSelectionTimeoutMS: 5000,
    connectTimeoutMS: 10000,
    socketTimeoutMS: 45000,
    autoIndex: !env.isProduction,
  };

  try {
    logger.info('Connecting to MongoDB...', { uri: redactMongoUri(targetUri) });

    const connection = await mongoose.connect(targetUri, options);
    lastConnectionError = null;
    logger.info('MongoDB connected successfully');
    return connection;
  } catch (error) {
    lastConnectionError = error instanceof Error ? error.message : String(error);
    logger.error('Failed to connect to MongoDB', lastConnectionError);
    throw error;
  } finally {
    isConnecting = false;
  }
}

/**
 * Disconnects from MongoDB cleanly without throwing unhandled errors.
 */
export async function disconnectDatabase(): Promise<void> {
  try {
    if (mongoose.connection.readyState !== 0) {
      await mongoose.disconnect();
      logger.info('MongoDB disconnected successfully');
    }
  } catch (error) {
    lastConnectionError = error instanceof Error ? error.message : String(error);
    logger.error('Error disconnecting MongoDB', lastConnectionError);
    throw error;
  } finally {
    lastConnectionError = null;
  }
}

export type DatabaseState = 'connected' | 'connecting' | 'disconnecting' | 'disconnected' | 'error';

/**
 * Returns the current database connection state.
 */
export function getDatabaseState(): DatabaseState {
  switch (mongoose.connection.readyState) {
    case 1:
      return 'connected';
    case 2:
      return 'connecting';
    case 3:
      return 'disconnecting';
    case 0:
    default:
      if (lastConnectionError) {
        return 'error';
      }
      return 'disconnected';
  }
}

export function isDatabaseConnected(): boolean {
  return mongoose.connection.readyState === 1;
}

export function getLastDatabaseError(): string | null {
  return lastConnectionError;
}

// Connection event listeners for runtime monitoring
mongoose.connection.on('connected', () => {
  lastConnectionError = null;
  logger.info('MongoDB connection established');
});

mongoose.connection.on('error', (err: Error) => {
  lastConnectionError = err.message;
  logger.error('MongoDB connection runtime error', err.message);
});

mongoose.connection.on('disconnected', () => {
  logger.warn('MongoDB connection lost / disconnected');
});
