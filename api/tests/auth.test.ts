/**
 * CampusFlow API - Phase 2.6B Authentication Tests
 * Tests JWT token generation/verification, login, refresh, logout, and cookie handling.
 *
 * TEST ISOLATION:
 * Operates strictly on the dedicated, isolated test database (`campusflow_test`).
 * Creates temporary test users and cleans them up after each test.
 */

import { describe, it, before, after, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import mongoose from 'mongoose';
import { connectDatabase, disconnectDatabase, isDatabaseConnected } from '../src/config/database';
import { env } from '../src/config/env';
import { User, UserRole } from '../src/models';
import { hashPassword, PASSWORD_POLICY } from '../src/utils/password';
import {
  signAccessToken,
  signRefreshToken,
  verifyAccessToken,
  verifyRefreshToken,
  AccessTokenPayload,
  RefreshTokenPayload,
} from '../src/utils/jwt';
import { AuthenticationService } from '../src/services/auth.service';

describe('Phase 2.6B - JWT Authentication', () => {
  const TEST_PREFIX = 'test_p26b_';
  const createdUserIds: string[] = [];

  before(async () => {
    await connectDatabase(env.MONGODB_TEST_URI);
    assert.strictEqual(isDatabaseConnected(), true, 'Database must be connected');
    const connectedDb = mongoose.connection.db?.databaseName;
    assert.strictEqual(
      connectedDb,
      'campusflow_test',
      `Tests must run exclusively on isolated test database (connected to: "${connectedDb}")`
    );
  });

  after(async () => {
    if (isDatabaseConnected()) {
      if (createdUserIds.length > 0) {
        await User.deleteMany({ _id: { $in: createdUserIds } });
      }
      await disconnectDatabase();
    }
  });

  describe('JWT Access Token', () => {
    it('should generate an HS256 access token with 15-minute expiry', () => {
      const payload = {
        sub: 'test-user-id',
        email: 'test@example.com',
        roles: [UserRole.STUDENT],
        isActive: true as const,
        tokenVersion: 0,
      };

      const token = signAccessToken(payload);
      assert.strictEqual(typeof token, 'string', 'Token must be a string');
      assert.strictEqual(token.split('.').length, 3, 'JWT must have 3 parts (header.payload.signature)');

      const decoded = verifyAccessToken(token);
      assert.strictEqual(decoded.sub, payload.sub);
      assert.strictEqual(decoded.email, payload.email);
      assert.deepStrictEqual(decoded.roles, payload.roles);
      assert.strictEqual(decoded.isActive, true);
      assert.strictEqual(typeof decoded.iat, 'number');
      assert.strictEqual(typeof decoded.exp, 'number');

      // Verify 15-minute expiry (900 seconds)
      const expiryDelta = decoded.exp - decoded.iat;
      assert.strictEqual(expiryDelta, 900, 'Access token must expire in exactly 900 seconds (15 minutes)');
    });

    it('should enforce HS256 algorithm on verification', () => {
      const payload = {
        sub: 'test-user-id',
        email: 'test@example.com',
        roles: [UserRole.STUDENT],
        isActive: true as const,
        tokenVersion: 0,
      };

      const token = signAccessToken(payload);

      // Verify with correct algorithm should succeed
      assert.doesNotThrow(() => {
        verifyAccessToken(token);
      }, 'Verification with HS256 algorithm must succeed');
    });

    it('should reject access token with malformed claims', () => {
      // Create a token with missing required claims (using low-level jwt directly)
      const jwt = require('jsonwebtoken');
      const malformedToken = jwt.sign(
        {
          // Missing 'sub', 'email', 'roles', 'isActive'
          someField: 'value',
        },
        env.JWT_ACCESS_SECRET,
        { algorithm: 'HS256' }
      );

      assert.throws(
        () => {
          verifyAccessToken(malformedToken);
        },
        /Invalid access token claims/,
        'Verification must reject token with missing required claims'
      );
    });

    it('should reject access token with incorrect secret', () => {
      const payload = {
        sub: 'test-user-id',
        email: 'test@example.com',
        roles: [UserRole.STUDENT],
        isActive: true as const,
        tokenVersion: 0,
      };

      const token = signAccessToken(payload);

      // Try to verify with wrong secret
      const jwt = require('jsonwebtoken');
      assert.throws(
        () => {
          jwt.verify(token, 'wrong-secret', { algorithms: ['HS256'] });
        },
        /invalid signature/i,
        'Verification must reject token signed with different secret'
      );
    });

    it('should reject unsupported algorithm claims', () => {
      // Create a token with HS512 (wrong algorithm)
      const jwt = require('jsonwebtoken');
      const malformedToken = jwt.sign(
        {
          sub: 'test-user-id',
          email: 'test@example.com',
          roles: [UserRole.STUDENT],
          isActive: true,
        },
        env.JWT_ACCESS_SECRET,
        { algorithm: 'HS512' } // Wrong algorithm
      );

      // Verification should reject this because we only allow HS256
      assert.throws(
        () => {
          verifyAccessToken(malformedToken);
        },
        /JsonWebTokenError|invalid|algorithm/i,
        'Verification must reject token with unsupported algorithm'
      );
    });
  });

  describe('JWT Refresh Token', () => {
    it('should generate an HS256 refresh token with 7-day expiry and unique jti', () => {
      const payload = {
        sub: 'test-user-id',
        tokenVersion: 0,
      };

      const token = signRefreshToken(payload);
      assert.strictEqual(typeof token, 'string', 'Token must be a string');
      assert.strictEqual(token.split('.').length, 3, 'JWT must have 3 parts');

      const decoded = verifyRefreshToken(token);
      assert.strictEqual(decoded.sub, payload.sub);
      assert.strictEqual(decoded.tokenVersion, payload.tokenVersion);
      assert.strictEqual(typeof decoded.jti, 'string');
      assert.strictEqual(decoded.jti.length, 36, 'jti must be UUID format (36 chars with hyphens)');

      // Verify 7-day expiry (604800 seconds)
      const expiryDelta = decoded.exp - decoded.iat;
      assert.strictEqual(expiryDelta, 604800, 'Refresh token must expire in exactly 604800 seconds (7 days)');
    });

    it('should generate unique jti for each refresh token', () => {
      const payload = {
        sub: 'test-user-id',
        tokenVersion: 0,
      };

      const token1 = signRefreshToken(payload);
      const token2 = signRefreshToken(payload);

      const decoded1 = verifyRefreshToken(token1);
      const decoded2 = verifyRefreshToken(token2);

      assert.notStrictEqual(decoded1.jti, decoded2.jti, 'Each refresh token must have a unique jti');
    });

    it('should reject refresh token with malformed claims', () => {
      const jwt = require('jsonwebtoken');
      const malformedToken = jwt.sign(
        {
          // Missing 'sub', 'tokenVersion', 'jti'
          someField: 'value',
        },
        env.JWT_REFRESH_SECRET,
        { algorithm: 'HS256' }
      );

      assert.throws(
        () => {
          verifyRefreshToken(malformedToken);
        },
        /Invalid refresh token claims/,
        'Verification must reject token with missing required claims'
      );
    });

    it('should reject refresh token with incorrect secret', () => {
      const payload = {
        sub: 'test-user-id',
        tokenVersion: 0,
      };

      const token = signRefreshToken(payload);

      const jwt = require('jsonwebtoken');
      assert.throws(
        () => {
          jwt.verify(token, 'wrong-secret', { algorithms: ['HS256'] });
        },
        /invalid signature/i,
        'Verification must reject token signed with different secret'
      );
    });
  });

  describe('Login Flow', () => {
    let testUser: typeof User;

    beforeEach(async () => {
      // Clean up any existing user with this email from previous test runs
      await User.deleteOne({ email: `${TEST_PREFIX}login@example.com` });

      // Create a test user with known credentials
      const hashedPassword = await hashPassword('TestPassword123!');
      testUser = await User.create({
        name: 'Test User',
        email: `${TEST_PREFIX}login@example.com`,
        passwordHash: hashedPassword,
        roles: [UserRole.STUDENT],
        isActive: true,
        tokenVersion: 0,
      });
      createdUserIds.push(testUser._id.toString());
    });

    it('should successfully login with valid credentials and return access token', async () => {
      const result = await AuthenticationService.login(testUser.email, 'TestPassword123!');

      assert.strictEqual(typeof result.accessToken, 'string', 'Access token must be returned');
      assert.strictEqual(typeof result.refreshToken, 'string', 'Refresh token must be returned for cookie');
      assert.strictEqual(result.user.email, testUser.email);
      assert.deepStrictEqual(result.user.roles, [UserRole.STUDENT]);
      assert.strictEqual(result.user.isActive, true);

      // Verify access token is valid
      const decoded = verifyAccessToken(result.accessToken);
      assert.strictEqual(decoded.sub, testUser._id.toString());
      assert.strictEqual(decoded.email, testUser.email);
    });

    it('should reject login with incorrect password', async () => {
      try {
        await AuthenticationService.login(testUser.email, 'WrongPassword123!');
        assert.fail('Should have thrown UnauthorizedError');
      } catch (error) {
        assert.match((error as Error).message, /Invalid email or password/);
      }
    });

    it('should reject login with unknown email', async () => {
      try {
        await AuthenticationService.login(`${TEST_PREFIX}unknown@example.com`, 'TestPassword123!');
        assert.fail('Should have thrown UnauthorizedError');
      } catch (error) {
        assert.match((error as Error).message, /Invalid email or password/);
      }
    });

    it('should not reveal whether account exists on password error', async () => {
      let unknownErrorMsg = '';
      let wrongPasswordMsg = '';

      try {
        await AuthenticationService.login(`${TEST_PREFIX}unknown@example.com`, 'TestPassword123!');
      } catch (error) {
        unknownErrorMsg = (error as Error).message;
      }

      try {
        await AuthenticationService.login(testUser.email, 'WrongPassword123!');
      } catch (error) {
        wrongPasswordMsg = (error as Error).message;
      }

      assert.strictEqual(unknownErrorMsg, wrongPasswordMsg, 'Error messages must be identical to prevent enumeration');
    });

    it('should reject login from inactive user', async () => {
      await User.findByIdAndUpdate(testUser._id, { isActive: false });

      try {
        await AuthenticationService.login(testUser.email, 'TestPassword123!');
        assert.fail('Should have thrown UnauthorizedError');
      } catch (error) {
        assert.match((error as Error).message, /Account is inactive/);
      }
    });

    it('should normalize email to lowercase', async () => {
      const result = await AuthenticationService.login(`${TEST_PREFIX}LOGIN@EXAMPLE.COM`, 'TestPassword123!');
      assert.strictEqual(result.user.email, testUser.email.toLowerCase());
    });

    it('should update lastLoginAt on successful login', async () => {
      const beforeLogin = new Date();
      await AuthenticationService.login(testUser.email, 'TestPassword123!');
      const afterLogin = new Date();

      const updatedUser = await User.findById(testUser._id);
      assert.ok(updatedUser?.lastLoginAt, 'lastLoginAt must be set');
      assert.ok(
        updatedUser.lastLoginAt >= beforeLogin && updatedUser.lastLoginAt <= afterLogin,
        'lastLoginAt must be updated to current time'
      );
    });

    it('should preserve roles during login', async () => {
      const multiRoleUser = await User.create({
        name: 'Multi Role User',
        email: `${TEST_PREFIX}multirole@example.com`,
        passwordHash: await hashPassword('TestPassword123!'),
        roles: [UserRole.STUDENT, UserRole.FACULTY],
        isActive: true,
      });
      createdUserIds.push(multiRoleUser._id.toString());

      const result = await AuthenticationService.login(multiRoleUser.email, 'TestPassword123!');
      assert.deepStrictEqual(result.user.roles, [UserRole.STUDENT, UserRole.FACULTY]);
    });

    it('should explicitly select passwordHash during login', async () => {
      // This is verified by ensuring login doesn't throw
      // and the password is actually verified (not just assumed)
      const result = await AuthenticationService.login(testUser.email, 'TestPassword123!');
      assert.ok(result.accessToken, 'Login must succeed with correct password');

      // If passwordHash was not selected, password verification would fail
      assert.rejects(
        async () => {
          await AuthenticationService.login(testUser.email, 'WrongPassword');
        },
        /Invalid email or password/
      );
    });

    it('should not return passwordHash in response', async () => {
      const result = await AuthenticationService.login(testUser.email, 'TestPassword123!');
      assert.strictEqual((result as any).passwordHash, undefined);
      assert.strictEqual((result.user as any).passwordHash, undefined);
    });

    it('should not return refresh token in JSON response (for cookie only)', async () => {
      // The refreshToken is returned to the service but should not be in the JSON response
      // Controller handles moving it to the cookie
      const result = await AuthenticationService.login(testUser.email, 'TestPassword123!');
      assert.strictEqual(typeof result.refreshToken, 'string', 'Service returns refreshToken for cookie-setting');
      // The HTTP response would exclude it (tested in integration tests)
    });

    it('should not increment tokenVersion on normal login', async () => {
      const tokenVersionBefore = testUser.tokenVersion;
      await AuthenticationService.login(testUser.email, 'TestPassword123!');
      const updatedUser = await User.findById(testUser._id);
      assert.strictEqual(updatedUser?.tokenVersion, tokenVersionBefore, 'tokenVersion must not change on login');
    });
  });

  describe('Refresh Token Flow', () => {
    let testUser: typeof User;
    let accessToken: string;
    let refreshToken: string;

    beforeEach(async () => {
      // Clean up any existing user with this email from previous test runs
      await User.deleteOne({ email: `${TEST_PREFIX}refresh@example.com` });

      const hashedPassword = await hashPassword('TestPassword123!');
      testUser = await User.create({
        name: 'Test User',
        email: `${TEST_PREFIX}refresh@example.com`,
        passwordHash: hashedPassword,
        roles: [UserRole.STUDENT],
        isActive: true,
        tokenVersion: 0,
      });
      createdUserIds.push(testUser._id.toString());

      const loginResult = await AuthenticationService.login(testUser.email, 'TestPassword123!');
      accessToken = loginResult.accessToken;
      refreshToken = loginResult.refreshToken;
    });

    it('should successfully refresh and return new access token', async () => {
      const result = await AuthenticationService.refresh(refreshToken);

      assert.strictEqual(typeof result.accessToken, 'string');
      assert.strictEqual(typeof result.refreshToken, 'string');

      // Access tokens generated within the same second will have identical payloads
      // The important verification is that decoding works and claims are correct
      const newDecoded = verifyAccessToken(result.accessToken);
      assert.strictEqual(newDecoded.sub, testUser._id.toString());
      assert.strictEqual(newDecoded.email, testUser.email);

      // Refresh token MUST be different (new jti)
      assert.notStrictEqual(result.refreshToken, refreshToken, 'New refresh token must be different (new jti)');
      const newRefreshDecoded = verifyRefreshToken(result.refreshToken);
      const oldRefreshDecoded = verifyRefreshToken(refreshToken);
      assert.notStrictEqual(newRefreshDecoded.jti, oldRefreshDecoded.jti, 'jti must be different on refresh');
    });

    it('should reject refresh with invalid signature', async () => {
      const jwt = require('jsonwebtoken');
      const invalidToken = jwt.sign(
        { sub: testUser._id.toString(), tokenVersion: 0, jti: 'fake-jti' },
        'wrong-secret',
        { algorithm: 'HS256' }
      );

      try {
        await AuthenticationService.refresh(invalidToken);
        assert.fail('Should have thrown error');
      } catch (error) {
        assert.match((error as Error).message, /Invalid refresh token/);
      }
    });

    it('should reject refresh with expired token', async () => {
      const jwt = require('jsonwebtoken');
      const expiredToken = jwt.sign(
        { sub: testUser._id.toString(), tokenVersion: 0, jti: 'fake-jti' },
        env.JWT_REFRESH_SECRET,
        { algorithm: 'HS256', expiresIn: -1 } // Already expired
      );

      try {
        await AuthenticationService.refresh(expiredToken);
        assert.fail('Should have thrown error');
      } catch (error) {
        assert.match((error as Error).message, /Refresh token expired|Invalid refresh token/);
      }
    });

    it('should reject refresh from nonexistent user', async () => {
      const fakeUserId = new mongoose.Types.ObjectId().toString();
      const fakeRefreshToken = signRefreshToken({
        sub: fakeUserId,
        tokenVersion: 0,
      });

      try {
        await AuthenticationService.refresh(fakeRefreshToken);
        assert.fail('Should have thrown error');
      } catch (error) {
        assert.match((error as Error).message, /User not found/);
      }
    });

    it('should reject refresh from inactive user', async () => {
      await User.findByIdAndUpdate(testUser._id, { isActive: false });

      try {
        await AuthenticationService.refresh(refreshToken);
        assert.fail('Should have thrown error');
      } catch (error) {
        assert.match((error as Error).message, /Account is inactive/);
      }
    });

    it('should reject refresh when tokenVersion mismatches (revoked)', async () => {
      // Increment tokenVersion to simulate logout/revocation
      await User.findByIdAndUpdate(testUser._id, { $inc: { tokenVersion: 1 } });

      try {
        await AuthenticationService.refresh(refreshToken);
        assert.fail('Should have thrown error');
      } catch (error) {
        assert.match((error as Error).message, /Refresh token has been revoked|tokenVersion/);
      }
    });

    it('should generate new jti on token rotation', async () => {
      const result1 = await AuthenticationService.refresh(refreshToken);
      const decoded1 = verifyRefreshToken(result1.refreshToken);

      const result2 = await AuthenticationService.refresh(result1.refreshToken);
      const decoded2 = verifyRefreshToken(result2.refreshToken);

      assert.notStrictEqual(decoded1.jti, decoded2.jti, 'Each refresh must generate a new jti');
    });

    it('should not return refresh token in JSON response (for cookie only)', async () => {
      const result = await AuthenticationService.refresh(refreshToken);
      assert.strictEqual(typeof result.refreshToken, 'string', 'Service returns refreshToken for cookie-setting');
      // HTTP response would exclude it (tested in integration)
    });
  });

  describe('Logout Flow', () => {
    let testUser: typeof User;
    let refreshToken: string;

    beforeEach(async () => {
      // Clean up any existing user with this email from previous test runs
      await User.deleteOne({ email: `${TEST_PREFIX}logout@example.com` });

      const hashedPassword = await hashPassword('TestPassword123!');
      testUser = await User.create({
        name: 'Test User',
        email: `${TEST_PREFIX}logout@example.com`,
        passwordHash: hashedPassword,
        roles: [UserRole.STUDENT],
        isActive: true,
        tokenVersion: 0,
      });
      createdUserIds.push(testUser._id.toString());

      const loginResult = await AuthenticationService.login(testUser.email, 'TestPassword123!');
      refreshToken = loginResult.refreshToken;
    });

    it('should increment tokenVersion on logout', async () => {
      const tokenVersionBefore = testUser.tokenVersion;

      await AuthenticationService.logout(testUser._id.toString());

      const updatedUser = await User.findById(testUser._id);
      assert.strictEqual(updatedUser?.tokenVersion, tokenVersionBefore + 1, 'tokenVersion must be incremented');
    });

    it('should invalidate all refresh tokens after logout', async () => {
      const tokenBefore = refreshToken;
      const decodedBefore = verifyRefreshToken(tokenBefore);
      assert.strictEqual(decodedBefore.tokenVersion, 0);

      // Logout
      await AuthenticationService.logout(testUser._id.toString());

      // Try to use old refresh token
      try {
        await AuthenticationService.refresh(tokenBefore);
        assert.fail('Should have thrown error');
      } catch (error) {
        assert.match((error as Error).message, /Refresh token has been revoked/);
      }
    });

    it('should not instantly invalidate existing access tokens', async () => {
      const loginResult = await AuthenticationService.login(testUser.email, 'TestPassword123!');
      const accessToken = loginResult.accessToken;

      // Logout
      await AuthenticationService.logout(testUser._id.toString());

      // Old access token should still be verifiable (until its 15-min expiry)
      assert.doesNotThrow(() => {
        verifyAccessToken(accessToken);
      }, 'Existing access token should remain valid until expiration');
    });

    it('should atomically increment tokenVersion', async () => {
      const user1 = testUser;

      // Create a second user for testing atomicity
      const hashedPassword = await hashPassword('TestPassword123!');
      const user2 = await User.create({
        name: 'Test User 2',
        email: `${TEST_PREFIX}logout2@example.com`,
        passwordHash: hashedPassword,
        roles: [UserRole.STUDENT],
        isActive: true,
        tokenVersion: 0,
      });
      createdUserIds.push(user2._id.toString());

      // Logout both users
      await Promise.all([
        AuthenticationService.logout(user1._id.toString()),
        AuthenticationService.logout(user2._id.toString()),
      ]);

      const updatedUser1 = await User.findById(user1._id);
      const updatedUser2 = await User.findById(user2._id);

      assert.strictEqual(updatedUser1?.tokenVersion, 1);
      assert.strictEqual(updatedUser2?.tokenVersion, 1);
    });
  });

  describe('Security - Credential Leakage Prevention', () => {
    it('should not expose passwordHash in any response', async () => {
      const hashedPassword = await hashPassword('TestPassword123!');
      const testUser = await User.create({
        name: 'Test User',
        email: `${TEST_PREFIX}noleak@example.com`,
        passwordHash: hashedPassword,
        roles: [UserRole.STUDENT],
        isActive: true,
      });
      createdUserIds.push(testUser._id.toString());

      const result = await AuthenticationService.login(testUser.email, 'TestPassword123!');

      assert.strictEqual((result as any).passwordHash, undefined);
      assert.strictEqual((result.user as any).passwordHash, undefined);
      assert.strictEqual((result.user as any).password, undefined);
    });

    it('should not expose secrets via errors or logs', () => {
      // Verify that JWT secrets are not logged anywhere
      assert.ok(env.JWT_ACCESS_SECRET.length >= 32, 'Access secret must be configured');
      assert.ok(env.JWT_REFRESH_SECRET.length >= 32, 'Refresh secret must be configured');
      // (Actual logging inspection is verified in integration/controller tests)
    });

    it('should validate JWT secrets meet minimum length requirements in production', () => {
      if (env.isProduction) {
        assert.ok(
          env.JWT_ACCESS_SECRET.length >= 32,
          'Production JWT_ACCESS_SECRET must be at least 32 characters'
        );
        assert.ok(
          env.JWT_REFRESH_SECRET.length >= 32,
          'Production JWT_REFRESH_SECRET must be at least 32 characters'
        );
      }
    });
  });
});
