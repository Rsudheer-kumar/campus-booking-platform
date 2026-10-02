/**
 * CampusFlow API - Authentication and RBAC Middleware
 * Provides JWT authentication verification and role-based access control (RBAC).
 */

import { Request, Response, NextFunction } from 'express';
import { verifyAccessToken } from '../utils/jwt';
import { User, UserRoleType } from '../models/user.model';
import { UnauthorizedError, ForbiddenError } from '../utils/errors';

/**
 * Middleware: authenticate
 * Extracts, verifies, and validates the access JWT from Authorization header.
 * Attaches trusted user context to req.user.
 */
export const authenticate = async (req: Request, _res: Response, next: NextFunction): Promise<void> => {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader || typeof authHeader !== 'string') {
      throw new UnauthorizedError('Authorization header with Bearer token required');
    }

    if (!authHeader.startsWith('Bearer ')) {
      throw new UnauthorizedError('Authorization header with Bearer token required');
    }

    const token = authHeader.substring(7).trim();
    if (!token) {
      throw new UnauthorizedError('Authorization header with Bearer token required');
    }

    // Cryptographic verification and claim validation
    const decoded = verifyAccessToken(token);

    // Database lookup for active user verification
    const user = await User.findById(decoded.sub)
      .select('_id email roles department isActive tokenVersion')
      .lean();

    if (!user) {
      throw new UnauthorizedError('User not found');
    }

    if (!user.isActive) {
      throw new UnauthorizedError('Account is inactive');
    }

    // Attach trusted user object to req.user (no password hash, no secrets)
    req.user = {
      id: user._id.toString(),
      email: user.email,
      roles: user.roles,
      department: user.department,
      isActive: user.isActive,
      tokenVersion: user.tokenVersion ?? 0,
    };

    next();
  } catch (error) {
    if (error instanceof UnauthorizedError || error instanceof ForbiddenError) {
      next(error);
    } else if (error instanceof Error) {
      next(new UnauthorizedError(error.message));
    } else {
      next(new UnauthorizedError('Authentication failed'));
    }
  }
};

/**
 * Middleware Factory: requireRoles
 * Enforces Role-Based Access Control (RBAC) using OR logic across required roles.
 * Expects req.user to be set by prior authenticate middleware.
 */
export const requireRoles = (...roles: UserRoleType[]) => {
  return (req: Request, _res: Response, next: NextFunction): void => {
    if (!req.user) {
      return next(new UnauthorizedError('Unauthorized'));
    }

    const hasRole = roles.some((role) => req.user?.roles.includes(role));
    if (!hasRole) {
      return next(new ForbiddenError('Forbidden: Insufficient permissions'));
    }

    next();
  };
};
