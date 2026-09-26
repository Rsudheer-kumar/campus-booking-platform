/**
 * CampusFlow API - Environment Configuration
 * Centralized, typed, and validated environment configuration.
 */

import dotenv from 'dotenv';
import path from 'path';

// Load .env file
dotenv.config({ path: path.resolve(process.cwd(), '.env') });

export interface AppConfig {
  readonly NODE_ENV: 'development' | 'production' | 'test';
  readonly PORT: number;
  readonly MONGODB_URI: string;
  readonly REDIS_URL: string;
  readonly CORS_ORIGIN: string;
  readonly isProduction: boolean;
  readonly isDevelopment: boolean;
  readonly isTest: boolean;
}

function parseNumber(value: string | undefined, defaultValue: number): number {
  if (!value) return defaultValue;
  const parsed = parseInt(value, 10);
  if (isNaN(parsed) || parsed <= 0) {
    throw new Error(`Invalid numeric environment variable: "${value}". Expected positive integer.`);
  }
  return parsed;
}

function isValidEnv(value: string): value is 'development' | 'production' | 'test' {
  return value === 'development' || value === 'production' || value === 'test';
}

function parseEnv(): AppConfig {
  const nodeEnv = (process.env.NODE_ENV || 'development').toLowerCase();
  const currentEnv = isValidEnv(nodeEnv) ? nodeEnv : 'development';

  const port = parseNumber(process.env.PORT, 5000);
  const mongoUri = process.env.MONGODB_URI || 'mongodb://localhost:27017/campusflow';
  const redisUrl = process.env.REDIS_URL || 'redis://localhost:6379';
  const corsOrigin = process.env.CORS_ORIGIN || 'http://localhost:3000';

  return Object.freeze({
    NODE_ENV: currentEnv,
    PORT: port,
    MONGODB_URI: mongoUri,
    REDIS_URL: redisUrl,
    CORS_ORIGIN: corsOrigin,
    isProduction: currentEnv === 'production',
    isDevelopment: currentEnv === 'development',
    isTest: currentEnv === 'test',
  });
}

export const env: AppConfig = parseEnv();
