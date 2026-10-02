/**
 * CampusFlow API - Authentication Controller
 * Handles HTTP endpoints for login, refresh, and logout operations
 */

import { Request, Response, NextFunction } from 'express';
import { AuthenticationService } from '../services/auth.service';
import { sendSuccess, sendError } from '../utils/response';
import { validateLoginRequest, validateRefreshRequest } from '../validators';
import { env } from '../config/env';
import { verifyAccessToken } from '../utils/jwt';

const REFRESH_COOKIE_NAME = 'cf_refresh';
const REFRESH_COOKIE_PATH = '/api/auth';
const REFRESH_COOKIE_MAX_AGE = 604800000; // 7 days in milliseconds

/**
 * POST /api/auth/login
 * Authenticates user by email and password
 * Returns access token and sets refresh token cookie
 */
export const login = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    // Validate request body
    const validation = validateLoginRequest(req.body);
    if (!validation.success) {
      sendError(res, 'VALIDATION_ERROR', 'Invalid request', 400, validation.errors || []);
      return;
    }

    // Type guard ensures data is defined after success check
    if (!validation.data) {
      sendError(res, 'VALIDATION_ERROR', 'Invalid request', 400);
      return;
    }

    const { email, password } = validation.data;

    // Authenticate user
    const { accessToken, refreshToken, user } = await AuthenticationService.login(email, password);

    // Set refresh token cookie
    // httpOnly: true prevents JavaScript access
    // secure: true in production requires HTTPS
    // sameSite: 'lax' prevents CSRF while allowing top-level navigation
    // path: /api/auth ensures cookie is only sent to auth endpoints
    res.cookie(REFRESH_COOKIE_NAME, refreshToken, {
      httpOnly: true,
      secure: env.isProduction,
      sameSite: 'lax',
      path: REFRESH_COOKIE_PATH,
      maxAge: REFRESH_COOKIE_MAX_AGE,
    });

    // Return access token and safe user data (no refresh token in JSON)
    sendSuccess(res, {
      accessToken,
      user,
    });
  } catch (error) {
    next(error);
  }
};

/**
 * POST /api/auth/refresh
 * Issues a new access token using the refresh token cookie
 * Also rotates the refresh token (new cookie with new jti)
 */
export const refresh = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    // Extract refresh token from cookie
    const refreshToken = (req.cookies as Record<string, string>)?.[REFRESH_COOKIE_NAME];

    // Validate refresh token presence and format
    const validation = validateRefreshRequest(refreshToken);
    if (!validation.success) {
      const errorMessage = validation.errors?.[0]?.message || 'Unauthorized';
      sendError(res, 'UNAUTHORIZED', errorMessage, 401);
      return;
    }

    // Type guard ensures data is defined after success check
    if (!validation.data) {
      sendError(res, 'UNAUTHORIZED', 'Unauthorized', 401);
      return;
    }

    // Use the validated token to refresh
    const { accessToken, refreshToken: newRefreshToken, user } = await AuthenticationService.refresh(
      validation.data.token
    );

    // Replace refresh token cookie with new one
    res.cookie(REFRESH_COOKIE_NAME, newRefreshToken, {
      httpOnly: true,
      secure: env.isProduction,
      sameSite: 'lax',
      path: REFRESH_COOKIE_PATH,
      maxAge: REFRESH_COOKIE_MAX_AGE,
    });

    // Return new access token and safe user data
    sendSuccess(res, {
      accessToken,
      user,
    });
  } catch (error) {
    next(error);
  }
};

/**
 * POST /api/auth/logout
 * Logs out by invalidating all refresh tokens (incrementing tokenVersion)
 * and clearing the refresh token cookie
 *
 * Note: In Phase 2.6B, we extract user ID from the access token directly
 * to avoid requiring Phase 2.6C global authenticate middleware.
 * Phase 2.6C will replace this with req.user.id from middleware.
 */
export const logout = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const userId = req.user?.id;
    if (!userId) {
      sendError(res, 'UNAUTHORIZED', 'Unauthorized', 401);
      return;
    }

    // Invalidate all refresh tokens for this user
    await AuthenticationService.logout(userId);

    // Clear refresh token cookie
    res.clearCookie(REFRESH_COOKIE_NAME, {
      path: REFRESH_COOKIE_PATH,
    });

    sendSuccess(res, { message: 'Logged out successfully' });
  } catch (error) {
    next(error);
  }
};
