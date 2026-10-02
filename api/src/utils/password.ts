/**
 * CampusFlow API - Password Hashing & Policy Utility (Phase 2.6A)
 * Provides cryptographically secure password hashing via bcrypt (cost factor 12)
 * and enforces application-level password complexity policies.
 */

import bcrypt from 'bcrypt';
import { env } from '../config/env';

export const BCRYPT_SALT_ROUNDS = env.BCRYPT_SALT_ROUNDS || 12;

export const PASSWORD_POLICY = {
  MIN_LENGTH: 8,
  MAX_LENGTH: 72,
} as const;

export interface PasswordValidationResult {
  valid: boolean;
  errors: string[];
  message?: string;
}

const SPECIAL_CHAR_REGEX = /[!@#$%^&*()_+\-=[\]{};':"\\|,.<>/?`~]/;

/**
 * Validates a plaintext candidate password against CampusFlow password policy:
 * - Minimum 8 characters
 * - Maximum 72 characters (Bcrypt safe boundary)
 * - At least one uppercase letter
 * - At least one lowercase letter
 * - At least one numeric digit
 * - At least one special character
 */
export function validatePasswordPolicy(password: unknown): PasswordValidationResult {
  const errors: string[] = [];

  if (typeof password !== 'string') {
    return {
      valid: false,
      errors: ['Password must be a string'],
      message: 'Password must be a string',
    };
  }

  if (password.length < PASSWORD_POLICY.MIN_LENGTH) {
    errors.push(`Password must be at least ${PASSWORD_POLICY.MIN_LENGTH} characters long`);
  }

  if (password.length > PASSWORD_POLICY.MAX_LENGTH) {
    errors.push(`Password cannot exceed ${PASSWORD_POLICY.MAX_LENGTH} characters`);
  }

  if (!/[A-Z]/.test(password)) {
    errors.push('Password must contain at least one uppercase letter');
  }

  if (!/[a-z]/.test(password)) {
    errors.push('Password must contain at least one lowercase letter');
  }

  if (!/[0-9]/.test(password)) {
    errors.push('Password must contain at least one numeric digit');
  }

  if (!SPECIAL_CHAR_REGEX.test(password)) {
    errors.push('Password must contain at least one special character');
  }

  return {
    valid: errors.length === 0,
    errors,
    message: errors.length > 0 ? errors.join('; ') : undefined,
  };
}

/**
 * Hashes a plaintext password using bcrypt with work factor 12.
 * Never logs or exposes plaintext password or hash.
 */
export async function hashPassword(password: string): Promise<string> {
  const validation = validatePasswordPolicy(password);
  if (!validation.valid) {
    throw new Error(`Password policy violation: ${validation.message}`);
  }
  return bcrypt.hash(password, BCRYPT_SALT_ROUNDS);
}

/**
 * Constant-time comparison of a candidate password against an existing bcrypt hash.
 * Never logs or exposes plaintext password or hash.
 */
export async function verifyPassword(password: string, passwordHash: string): Promise<boolean> {
  if (!password || !passwordHash || typeof password !== 'string' || typeof passwordHash !== 'string') {
    return false;
  }
  return bcrypt.compare(password, passwordHash);
}
