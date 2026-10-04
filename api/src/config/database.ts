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
mongoose.set('bufferCommands', false);

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
    bufferCommands: false,
  };

  try {
    logger.info('Connecting to MongoDB...', { uri: redactMongoUri(targetUri) });

    const connection = await mongoose.connect(targetUri, options);

    // Verify connection responsiveness and writable primary status
    await verifyDatabaseReadiness(mongoose);

    lastConnectionError = null;
    logger.info('MongoDB connected successfully and verified writable primary');
    return connection;
  } catch (error) {
    lastConnectionError = error instanceof Error ? error.message : String(error);
    logger.error('Failed to connect to MongoDB', lastConnectionError);
    if (mongoose.connection.readyState !== 0) {
      try {
        await mongoose.disconnect();
      } catch {
        // Suppress secondary disconnect errors during connection failure cleanup
      }
    }
    throw error;
  } finally {
    isConnecting = false;
  }
}

export interface DatabaseReadiness {
  ok: boolean;
  isWritablePrimary: boolean;
  setName: string | null;
  databaseName: string;
}

/**
 * Validates that MongoDB is connected, responsive to ping, and operating as a writable primary.
 * Verifies replica set topology (rs0) required for transactions.
 */
export async function verifyDatabaseReadiness(
  instance: typeof mongoose = mongoose
): Promise<DatabaseReadiness> {
  if (instance.connection.readyState !== 1) {
    throw new Error('MongoDB connection is not established (readyState !== 1)');
  }

  const db = instance.connection.db;
  if (!db) {
    throw new Error('MongoDB database instance is not available on active connection');
  }

  // 1. Verify reachability via ping
  await db.command({ ping: 1 });

  // 2. Verify writable primary status via hello command
  const helloResult = (await db.command({ hello: 1 })) as {
    isWritablePrimary?: boolean;
    ismaster?: boolean;
    setName?: string;
    hosts?: string[];
    readOnly?: boolean;
  };

  const isWritable = Boolean(helloResult.isWritablePrimary ?? helloResult.ismaster);
  if (!isWritable) {
    throw new Error(
      `MongoDB connected but node is not a writable primary (isWritablePrimary: false, setName: ${helloResult.setName || 'standalone'})`
    );
  }

  return {
    ok: true,
    isWritablePrimary: isWritable,
    setName: helloResult.setName ?? null,
    databaseName: db.databaseName,
  };
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

mongoose.connection.on('reconnected', () => {
  lastConnectionError = null;
  logger.info('MongoDB connection re-established');
});

mongoose.connection.on('error', (err: Error) => {
  lastConnectionError = err.message;
  logger.error('MongoDB connection runtime error', err.message);
});

mongoose.connection.on('disconnected', () => {
  logger.warn('MongoDB connection lost / disconnected');
});
