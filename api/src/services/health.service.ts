/**
 * CampusFlow API - Health Service
 * Provides system diagnostics and truthful dependency verification.
 */

import { getDatabaseState } from '../config/database';
import { getRedisState } from '../config/redis';

export interface HealthStatusData {
  status: 'ok';
  timestamp: string;
  uptime: number;
  environment: string;
  services: {
    database: 'connected' | 'connecting' | 'disconnecting' | 'disconnected';
    redis: 'connected' | 'connecting' | 'disconnected';
  };
}

export function checkHealth(): HealthStatusData {
  const dbState = getDatabaseState();
  const redisState = getRedisState();

  return {
    status: 'ok',
    timestamp: new Date().toISOString(),
    uptime: Math.floor(process.uptime()),
    environment: process.env.NODE_ENV || 'development',
    services: {
      database: dbState,
      redis: redisState,
    },
  };
}
