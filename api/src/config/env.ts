/**
 * CampusFlow API - Environment Configuration
 * Centralized, typed, and validated environment configuration.
 * Supports dedicated test database isolation derived from MONGODB_URI.
 */

import dotenv from 'dotenv';
import path from 'path';

// Load .env file
dotenv.config({ path: path.resolve(process.cwd(), '.env') });

export interface AppConfig {
  readonly NODE_ENV: 'development' | 'production' | 'test';
  readonly PORT: number;
  readonly MONGODB_URI: string;
  readonly MONGODB_TEST_URI: string;
  readonly REDIS_URL: string;
  readonly CORS_ORIGIN: string;
  readonly BCRYPT_SALT_ROUNDS: number;
  readonly JWT_ACCESS_SECRET: string;
  readonly JWT_REFRESH_SECRET: string;
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

function validateSecret(value: string | undefined, name: string, minLength: number = 32): string {
  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  if (value.length < minLength) {
    throw new Error(`${name} must be at least ${minLength} characters long (got ${value.length})`);
  }
  return value;
}

function isValidEnv(value: string): value is 'development' | 'production' | 'test' {
  return value === 'development' || value === 'production' || value === 'test';
}

/**
 * Derives an isolated test database URI from the base URI by appending `_test` to the database name.
 * Example: mongodb://localhost:27017/campusflow -> mongodb://localhost:27017/campusflow_test
 */
export function deriveTestMongoUri(baseUri: string): string {
  const match = baseUri.match(/^([^?]+)\/([^/?]+)(\?.*)?$/);
  if (match) {
    const prefix = match[1];
    const dbName = match[2];
    const query = match[3] || '';
    const testDbName = dbName.endsWith('_test') ? dbName : `${dbName}_test`;
    return `${prefix}/${testDbName}${query}`;
  }
  return `${baseUri.replace(/\/$/, '')}_test`;
}

function parseEnv(): AppConfig {
  const nodeEnv = (process.env.NODE_ENV || 'development').toLowerCase();
  const currentEnv = isValidEnv(nodeEnv) ? nodeEnv : 'development';

  const port = parseNumber(process.env.PORT, 5000);
  const mongoUri = process.env.MONGODB_URI || 'mongodb://localhost:27017/campusflow';
  const mongoTestUri = process.env.MONGODB_TEST_URI || deriveTestMongoUri(mongoUri);
  const redisUrl = process.env.REDIS_URL || 'redis://localhost:6379';
  const corsOrigin = process.env.CORS_ORIGIN || 'http://localhost:3000';
  const bcryptSaltRounds = parseNumber(process.env.BCRYPT_SALT_ROUNDS, 12);

  // JWT secrets are required in production
  const jwtAccessSecret = currentEnv === 'production'
    ? validateSecret(process.env.JWT_ACCESS_SECRET, 'JWT_ACCESS_SECRET', 32)
    : process.env.JWT_ACCESS_SECRET || 'dev-access-secret-change-in-production-minimum-32-chars-long';

  const jwtRefreshSecret = currentEnv === 'production'
    ? validateSecret(process.env.JWT_REFRESH_SECRET, 'JWT_REFRESH_SECRET', 32)
    : process.env.JWT_REFRESH_SECRET || 'dev-refresh-secret-change-in-production-minimum-32-chars';

  return Object.freeze({
    NODE_ENV: currentEnv,
    PORT: port,
    MONGODB_URI: mongoUri,
    MONGODB_TEST_URI: mongoTestUri,
    REDIS_URL: redisUrl,
    CORS_ORIGIN: corsOrigin,
    BCRYPT_SALT_ROUNDS: bcryptSaltRounds,
    JWT_ACCESS_SECRET: jwtAccessSecret,
    JWT_REFRESH_SECRET: jwtRefreshSecret,
    isProduction: currentEnv === 'production',
    isDevelopment: currentEnv === 'development',
    isTest: currentEnv === 'test',
  });
}

export const env: AppConfig = parseEnv();
