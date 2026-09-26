/**
 * CampusFlow API - Health Service
 * Provides system diagnostics and truthful dependency verification for MongoDB and Redis.
 */

import { getDatabaseState, type DatabaseState } from '../config/database';
import { getRedisState, type RedisState } from '../config/redis';

export interface HealthStatusData {
  status: 'ok' | 'degraded';
  timestamp: string;
  uptime: number;
  environment: string;
  services: {
    database: DatabaseState;
    redis: RedisState;
  };
}

export function checkHealth(): HealthStatusData {
  const dbState = getDatabaseState();
  const redisState = getRedisState();

  // Status is 'ok' only when both core dependencies are fully connected
  // Otherwise, accurately indicates degraded dependency state
  const isHealthy = dbState === 'connected' && redisState === 'connected';

  return {
    status: isHealthy ? 'ok' : 'degraded',
    timestamp: new Date().toISOString(),
    uptime: Math.floor(process.uptime()),
    environment: process.env.NODE_ENV || 'development',
    services: {
      database: dbState,
      redis: redisState,
    },
  };
}
