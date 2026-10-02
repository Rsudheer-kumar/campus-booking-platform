/**
 * CampusFlow API - Authentication Routes
 * Defines the /api/auth endpoints for login, refresh, and logout
 */

import { Router } from 'express';
import { login, refresh, logout } from '../controllers/auth.controller';
import { authenticate } from '../middleware/auth';

const authRoutes = Router();

/**
 * POST /api/auth/login
 * Login with email and password
 * Request: { email: string, password: string }
 * Response: { accessToken: string, user: UserInfo }
 * Sets cf_refresh cookie (httpOnly, SameSite=Lax, path=/api/auth)
 */
authRoutes.post('/login', login);

/**
 * POST /api/auth/refresh
 * Refresh access token using cf_refresh cookie
 * Request: (cookie-based, no body required)
 * Response: { accessToken: string, user: UserInfo }
 * Updates cf_refresh cookie with new token and jti
 */
authRoutes.post('/refresh', refresh);

/**
 * POST /api/auth/logout
 * Logout and invalidate all refresh tokens for the user
 * Request: Authorization: Bearer <accessToken>
 * Response: { message: string }
 * Clears cf_refresh cookie
 */
authRoutes.post('/logout', authenticate, logout);

export default authRoutes;
