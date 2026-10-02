/**
 * CampusFlow API - JWT Token Utilities
 * Handles signing and verification of access and refresh tokens.
 * Access tokens: 15-minute lifetime, HS256
 * Refresh tokens: 7-day lifetime, HS256 with jti for client tracking
 */

import jwt from 'jsonwebtoken';
import { randomUUID } from 'crypto';
import { env } from '../config/env';
import { UserRoleType } from '../models/user.model';

const ACCESS_TOKEN_LIFETIME = 900; // 15 minutes in seconds
const REFRESH_TOKEN_LIFETIME = 604800; // 7 days in seconds

/**
 * Access token payload structure
 */
export interface AccessTokenPayload {
  sub: string; // user ID
  email: string;
  roles: UserRoleType[];
  department?: string;
  isActive: true;
  tokenVersion: number;
  iat: number;
  exp: number;
}

/**
 * Refresh token payload structure
 */
export interface RefreshTokenPayload {
  sub: string; // user ID
  tokenVersion: number;
  jti: string; // unique token identifier
  iat: number;
  exp: number;
}

/**
 * Signs an access token with the configured secret and 15-minute lifetime
 * Algorithm: HS256 (enforced)
 */
export function signAccessToken(payload: Omit<AccessTokenPayload, 'iat' | 'exp'>): string {
  return jwt.sign(payload, env.JWT_ACCESS_SECRET, {
    algorithm: 'HS256',
    expiresIn: ACCESS_TOKEN_LIFETIME,
  });
}

/**
 * Signs a refresh token with the configured secret and 7-day lifetime
 * Includes a unique jti (JWT ID) for client-side tracking
 * Algorithm: HS256 (enforced)
 */
export function signRefreshToken(payload: Omit<RefreshTokenPayload, 'iat' | 'exp' | 'jti'>): string {
  return jwt.sign(
    {
      ...payload,
      jti: randomUUID(),
    },
    env.JWT_REFRESH_SECRET,
    {
      algorithm: 'HS256',
      expiresIn: REFRESH_TOKEN_LIFETIME,
    }
  );
}

/**
 * Verifies and decodes an access token
 * Enforces HS256 algorithm to prevent algorithm substitution attacks
 * Returns the decoded payload or throws an error
 */
export function verifyAccessToken(token: string): AccessTokenPayload {
  try {
    const decoded = jwt.verify(token, env.JWT_ACCESS_SECRET, {
      algorithms: ['HS256'],
    }) as AccessTokenPayload;

    // Validate required claims
    if (
      !decoded.sub ||
      !decoded.email ||
      !Array.isArray(decoded.roles) ||
      decoded.isActive !== true ||
      typeof decoded.tokenVersion !== 'number' ||
      isNaN(decoded.tokenVersion) ||
      decoded.tokenVersion < 0
    ) {
      throw new Error('Invalid access token claims');
    }

    return decoded;
  } catch (error) {
    if (error instanceof jwt.TokenExpiredError) {
      throw new Error('Access token expired');
    }
    if (error instanceof jwt.JsonWebTokenError) {
      throw new Error('Invalid access token');
    }
    throw error;
  }
}

/**
 * Verifies and decodes a refresh token
 * Enforces HS256 algorithm to prevent algorithm substitution attacks
 * Returns the decoded payload or throws an error
 */
export function verifyRefreshToken(token: string): RefreshTokenPayload {
  try {
    const decoded = jwt.verify(token, env.JWT_REFRESH_SECRET, {
      algorithms: ['HS256'],
    }) as RefreshTokenPayload;

    // Validate required claims
    if (!decoded.sub || typeof decoded.tokenVersion !== 'number' || !decoded.jti) {
      throw new Error('Invalid refresh token claims');
    }

    return decoded;
  } catch (error) {
    if (error instanceof jwt.TokenExpiredError) {
      throw new Error('Refresh token expired');
    }
    if (error instanceof jwt.JsonWebTokenError) {
      throw new Error('Invalid refresh token');
    }
    throw error;
  }
}
