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
          connectTimeout: 2000,
          reconnectStrategy: (retries) => {
            // Bounded retry to avoid infinite reconnect loops and log spam
            if (env.isTest || retries >= 1) {
              lastRedisError = 'Redis service unreachable';
              return new Error('Redis service unreachable');
            }
            return Math.min(retries * 500, 1000);
          },
        },
      });

      redisClient.on('error', (err: Error) => {
        lastRedisError = err.message;
        // Only log unexpected runtime error if client was active
        if (redisClient?.isReady) {
          logger.error('Redis client runtime error', err.message);
        }
      });

      redisClient.on('connect', () => {
        logger.debug('Redis socket connecting...');
      });

      redisClient.on('ready', () => {
        lastRedisError = null;
        logger.info('Redis client connected and ready');
      });

      redisClient.on('reconnecting', () => {
        logger.debug('Redis client reconnecting...');
      });

      redisClient.on('end', () => {
        logger.debug('Redis client connection closed');
      });
    }

    logger.debug('Connecting to Redis...', { url: redactRedisUrl(targetUrl) });
    await redisClient.connect();
    lastRedisError = null;
    return redisClient;
  } catch (error) {
    lastRedisError = error instanceof Error ? error.message : String(error);
    throw error;
  } finally {
    isConnecting = false;
  }
}

export async function disconnectRedis(): Promise<void> {
  try {
    if (redisClient && redisClient.isOpen) {
      await redisClient.quit();
      logger.debug('Redis client disconnected cleanly');
    } else if (redisClient) {
      await redisClient.destroy();
    }
  } catch {
    if (redisClient) {
      try {
        await redisClient.destroy();
      } catch {
        // ignore
      }
    }
  } finally {
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
