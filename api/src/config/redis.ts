/**
 * CampusFlow API - Redis Configuration Foundation
 * Manages Redis client lifecycle, provides connection state helpers,
 * handles reconnect backoff, redacts credentials, and supports graceful shutdown.
 */

import { createClient, type RedisClientType } from 'redis';
import { env } from './env';
import { logger } from '../utils/logger';

let redisClient: RedisClientType | null = null;
let isConnecting = false;
let lastRedisError: string | null = null;

export type RedisState = 'connected' | 'connecting' | 'disconnected' | 'error';

/**
 * Sanitizes Redis URL by redacting password/credentials if present.
 */
export function redactRedisUrl(url: string): string {
  return url.replace(/\/\/([^:]+):([^@]+)@/, '//$1:****@')
            .replace(/\/\/:([^@]+)@/, '//:****@');
}

export function getRedisClient(): RedisClientType | null {
  return redisClient;
}

export function getLastRedisError(): string | null {
  return lastRedisError;
}

export async function connectRedis(urlOverride?: string): Promise<RedisClientType | null> {
  const targetUrl = urlOverride || env.REDIS_URL;

  // If already connected and ready, return existing client
  if (redisClient && redisClient.isReady) {
    logger.debug('Redis already connected and ready');
    return redisClient;
  }

  // Prevent duplicate concurrent connection attempts
  if (isConnecting) {
    logger.debug('Redis connection attempt already in progress');
    return redisClient;
  }

  isConnecting = true;

  try {
    if (!redisClient || urlOverride) {
      // If client exists but we are switching target URL, close previous
      if (redisClient && redisClient.isOpen) {
        try {
          await redisClient.destroy();
        } catch {
          // ignore cleanup error
        }
      }

      redisClient = createClient({
        url: targetUrl,
        socket: {
          connectTimeout: 5000,
          reconnectStrategy: (retries) => {
            // Stop reconnecting after 3 attempts in development/test to prevent infinite loops
            if (env.isTest || retries >= 3) {
              lastRedisError = 'Redis max reconnect attempts reached';
              return new Error('Redis max reconnect attempts reached');
            }
            // Exponential backoff capped at 3000ms
            return Math.min(retries * 500, 3000);
          },
        },
      });

      redisClient.on('error', (err: Error) => {
        lastRedisError = err.message;
        logger.error('Redis client runtime error', err.message);
      });

      redisClient.on('connect', () => {
        logger.info('Redis socket connecting...');
      });

      redisClient.on('ready', () => {
        lastRedisError = null;
        logger.info('Redis client connected and ready');
      });

      redisClient.on('reconnecting', () => {
        logger.warn('Redis client reconnecting...');
      });

      redisClient.on('end', () => {
        logger.warn('Redis client connection closed');
      });
    }

    logger.info('Connecting to Redis...', { url: redactRedisUrl(targetUrl) });
    await redisClient.connect();
    lastRedisError = null;
    return redisClient;
  } catch (error) {
    lastRedisError = error instanceof Error ? error.message : String(error);
    logger.error('Failed to connect to Redis', lastRedisError);
    throw error;
  } finally {
    isConnecting = false;
  }
}

export async function disconnectRedis(): Promise<void> {
  if (redisClient && redisClient.isOpen) {
    try {
      await redisClient.quit();
      logger.info('Redis client disconnected cleanly');
    } catch (error) {
      logger.error('Error disconnecting Redis client', error instanceof Error ? error.message : error);
      try {
        redisClient.destroy();
      } catch {
        // ignore fallback destruction errors
      }
    } finally {
      redisClient = null;
      lastRedisError = null;
    }
  } else if (redisClient) {
    try {
      redisClient.destroy();
    } catch {
      // ignore
    }
    redisClient = null;
    lastRedisError = null;
  }
}

export function isRedisConnected(): boolean {
  return redisClient !== null && redisClient.isReady;
}

export function getRedisState(): RedisState {
  if (!redisClient) {
    return lastRedisError ? 'error' : 'disconnected';
  }
  if (redisClient.isReady) {
    return 'connected';
  }
  if (redisClient.isOpen) {
    return 'connecting';
  }
  if (lastRedisError) {
    return 'error';
  }
  return 'disconnected';
}
