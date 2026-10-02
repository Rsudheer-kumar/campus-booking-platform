/**
 * CampusFlow API - Authentication Service
 * Handles user login, refresh, and logout operations with JWT token management
 */

import { User, UserDocument } from '../models/user.model';
import { verifyPassword } from '../utils/password';
import { signAccessToken, signRefreshToken, verifyRefreshToken } from '../utils/jwt';
import { UnauthorizedError } from '../utils/errors';

export class AuthenticationService {
  /**
   * Authenticates a user by email and password
   * Returns access token and safe user data on success
   * Rejects inactive users and invalid credentials with 401
   * Does not reveal whether an account exists
   */
  static async login(email: string, password: string) {
    // Normalize email to lowercase for consistent lookup
    const normalizedEmail = email.toLowerCase().trim();

    // Find user and explicitly select passwordHash
    const user = await User.findOne({ email: normalizedEmail }).select('+passwordHash');

    // Reject with generic message if not found or password invalid
    // This prevents account enumeration
    if (!user || !user.passwordHash) {
      throw new UnauthorizedError('Invalid email or password');
    }

    // Verify password against the stored hash
    const passwordValid = await verifyPassword(password, user.passwordHash);
    if (!passwordValid) {
      throw new UnauthorizedError('Invalid email or password');
    }

    // Reject inactive users
    if (!user.isActive) {
      throw new UnauthorizedError('Account is inactive');
    }

    // Generate tokens
    const accessToken = signAccessToken({
      sub: user._id.toString(),
      email: user.email,
      roles: user.roles,
      department: user.department,
      isActive: true,
      tokenVersion: user.tokenVersion ?? 0,
    });

    const refreshToken = signRefreshToken({
      sub: user._id.toString(),
      tokenVersion: user.tokenVersion ?? 0,
    });

    // Update lastLoginAt
    await User.findByIdAndUpdate(user._id, {
      lastLoginAt: new Date(),
    });

    // Return access token and safe user data (no passwords, no refresh token in JSON)
    return {
      accessToken,
      user: {
        id: user._id.toString(),
        email: user.email,
        roles: user.roles,
        department: user.department,
        isActive: user.isActive,
      },
      refreshToken, // only exposed for cookie setting, not in JSON response
    };
  }

  /**
   * Refreshes an access token using a valid refresh token
   * Validates refresh token, user existence, active status, and tokenVersion match
   * Returns new access and refresh tokens
   * Rejects with 401 on any validation failure
   */
  static async refresh(refreshToken: string) {
    // Verify refresh token signature and claims
    const payload = verifyRefreshToken(refreshToken);

    // Load user by ID from token
    const user = await User.findById(payload.sub);

    // Reject if user not found
    if (!user) {
      throw new UnauthorizedError('User not found');
    }

    // Reject inactive users
    if (!user.isActive) {
      throw new UnauthorizedError('Account is inactive');
    }

    // Verify tokenVersion matches (prevents use of invalidated refresh tokens)
    if (user.tokenVersion !== payload.tokenVersion) {
      throw new UnauthorizedError('Refresh token has been revoked');
    }

    // Generate new tokens with updated state
    const newAccessToken = signAccessToken({
      sub: user._id.toString(),
      email: user.email,
      roles: user.roles,
      department: user.department,
      isActive: true,
      tokenVersion: user.tokenVersion ?? 0,
    });

    const newRefreshToken = signRefreshToken({
      sub: user._id.toString(),
      tokenVersion: user.tokenVersion ?? 0,
    });

    // Return tokens and safe user data
    return {
      accessToken: newAccessToken,
      user: {
        id: user._id.toString(),
        email: user.email,
        roles: user.roles,
        department: user.department,
        isActive: user.isActive,
      },
      refreshToken: newRefreshToken, // only exposed for cookie setting
    };
  }

  /**
   * Logs out a user by incrementing their tokenVersion
   * This invalidates all existing refresh tokens for the user
   * Existing access tokens remain valid until their 15-minute expiration
   * Requires user ID to be extracted from access token or other auth context
   */
  static async logout(userId: string) {
    // Atomically increment tokenVersion
    await User.findByIdAndUpdate(userId, {
      $inc: { tokenVersion: 1 },
    });
  }
}
