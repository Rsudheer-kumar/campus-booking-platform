/**
 * CampusFlow API - Redis Configuration Foundation
 * Manages Redis client lifecycle, provides connection state helpers,
 * and supports graceful shutdown.
 */

import { createClient, type RedisClientType } from 'redis';
import { env } from './env';
import { logger } from '../utils/logger';

let redisClient: RedisClientType | null = null;
let isConnecting = false;

export function getRedisClient(): RedisClientType | null {
  return redisClient;
}

export async function connectRedis(): Promise<RedisClientType | null> {
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
    if (!redisClient) {
      redisClient = createClient({
        url: env.REDIS_URL,
        socket: {
          connectTimeout: 5000,
          reconnectStrategy: (retries) => {
            // In development or test, stop retrying if offline to prevent blocking
            if (env.isTest || retries > 3) {
              return new Error('Redis max reconnect attempts reached');
            }
            return Math.min(retries * 500, 3000);
          },
        },
      });

      redisClient.on('error', (err) => {
        logger.error('Redis client runtime error', err instanceof Error ? err.message : err);
      });

      redisClient.on('connect', () => {
        logger.info('Redis socket connecting...');
      });

      redisClient.on('ready', () => {
        logger.info('Redis client connected and ready');
      });

      redisClient.on('end', () => {
        logger.warn('Redis client connection closed');
      });
    }

    logger.info('Connecting to Redis...', { url: env.REDIS_URL.replace(/\/\/([^:]+):([^@]+)@/, '//$1:****@') });
    await redisClient.connect();
    return redisClient;
  } catch (error) {
    logger.error('Failed to connect to Redis', error instanceof Error ? error.message : error);
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
    }
  }
}

export function isRedisConnected(): boolean {
  return redisClient !== null && redisClient.isReady;
}

export function getRedisState(): 'connected' | 'connecting' | 'disconnected' {
  if (!redisClient) return 'disconnected';
  if (redisClient.isReady) return 'connected';
  if (redisClient.isOpen) return 'connecting';
  return 'disconnected';
}
