/**
 * CampusFlow API - Phase 2.6C Authentication & RBAC Middleware Tests
 * 
 * Verifies JWT authentication middleware, identity protection, RBAC foundation,
 * and security protections (anti-forgery, anti-disclosure).
 */

import { describe, it, before, after, beforeEach, afterEach } from "node:test";
import assert from "node:assert/strict";
import type { Server } from "http";
import type { AddressInfo } from "net";
import express, { type Request, type Response } from "express";
import mongoose from "mongoose";
import jwt from "jsonwebtoken";

import { connectDatabase, disconnectDatabase, isDatabaseConnected } from "../src/config/database";
import { env } from "../src/config/env";
import { User, UserRole, type UserRoleType } from "../src/models";
import { hashPassword } from "../src/utils/password";
import { signAccessToken } from "../src/utils/jwt";
import { authenticate, requireRoles } from "../src/middleware/auth";
import { errorHandler } from "../src/middleware/errorHandler";
import { app as realApp } from "../src/app";

describe("Phase 2.6C - Authentication & RBAC Middleware", () => {
  const TEST_PREFIX = "test_p26c_";
  let testUser: any;
  let testAdmin: any;
  let testFacilityManager: any;
  const createdUserIds: string[] = [];

  // Ephemeral test servers
  let testServer: Server;
  let testBaseUrl: string;
  let realServer: Server;
  let realBaseUrl: string;

  before(async () => {
    // Connect to database
    await connectDatabase(env.MONGODB_TEST_URI);
    assert.strictEqual(isDatabaseConnected(), true, "Database must be connected");
    const connectedDb = mongoose.connection.db?.databaseName;
    assert.strictEqual(
      connectedDb,
      "campusflow_test",
      "Tests must run exclusively on isolated test database"
    );

    // Clean up any stale records from previous runs
    await User.deleteMany({ email: new RegExp(`^${TEST_PREFIX}`, 'i') });

    // Create fixture users
    const passwordHash = await hashPassword("TestPassword123!");

    testUser = await User.create({
      name: "Test Student",
      email: `${TEST_PREFIX}student@example.com`,
      roles: [UserRole.STUDENT],
      isActive: true,
      tokenVersion: 0,
      department: "Computer Science",
    });
    createdUserIds.push(testUser._id.toString());

    testAdmin = await User.create({
      name: "Test Admin",
      email: `${TEST_PREFIX}admin@example.com`,
      roles: [UserRole.ADMIN],
      isActive: true,
      tokenVersion: 0,
      department: "Administration",
    });
    createdUserIds.push(testAdmin._id.toString());

    testFacilityManager = await User.create({
      name: "Test Manager",
      email: `${TEST_PREFIX}manager@example.com`,
      roles: [UserRole.FACILITY_MANAGER],
      isActive: true,
      tokenVersion: 0,
      department: "Facilities",
    });
    createdUserIds.push(testFacilityManager._id.toString());

    // 1. Build & start a test-dedicated Express server to test custom middleware permutations
    const testApp = express();
    testApp.use(express.json());

    const handleAuth = (req: Request, res: Response) => {
      res.status(200).json({
        success: true,
        user: req.user,
      });
    };
    testApp.all("/test-auth/authenticate", authenticate, handleAuth);
    testApp.all("/test-auth/authenticate/:userId", authenticate, handleAuth);

    testApp.get("/test-auth/admin-only", authenticate, requireRoles(UserRole.ADMIN), (req: Request, res: Response) => {
      res.status(200).json({
        success: true,
        user: req.user,
      });
    });

    testApp.get(
      "/test-auth/multi-role",
      authenticate,
      requireRoles(UserRole.ADMIN, UserRole.FACILITY_MANAGER),
      (req: Request, res: Response) => {
        res.status(200).json({
          success: true,
          user: req.user,
        });
      }
    );

    testApp.use(errorHandler);

    await new Promise<void>((resolve) => {
      testServer = testApp.listen(0, () => {
        const address = testServer.address() as AddressInfo;
        testBaseUrl = `http://127.0.0.1:${address.port}`;
        resolve();
      });
    });

    // 2. Start real app for public/protected integration tests
    await new Promise<void>((resolve) => {
      realServer = realApp.listen(0, () => {
        const address = realServer.address() as AddressInfo;
        realBaseUrl = `http://127.0.0.1:${address.port}`;
        resolve();
      });
    });
  });

  after(async () => {
    // Shut down servers
    if (testServer) {
      testServer.closeAllConnections?.();
      await new Promise<void>((resolve) => testServer.close(() => resolve()));
    }
    if (realServer) {
      realServer.closeAllConnections?.();
      await new Promise<void>((resolve) => realServer.close(() => resolve()));
    }

    // Clean up DB
    if (isDatabaseConnected()) {
      if (createdUserIds.length > 0) {
        await User.deleteMany({ _id: { $in: createdUserIds } });
      }
      await disconnectDatabase();
    }
  });

  describe('Authentication Middleware (A)', () => {
    it('A01 missing Authorization -> 401', async () => {
      const res = await fetch(`${testBaseUrl}/test-auth/authenticate`);
      assert.strictEqual(res.status, 401);
      const body = (await res.json()) as any;
      assert.strictEqual(body.success, false);
      assert.strictEqual(body.error.code, 'UNAUTHORIZED');
      assert.match(body.error.message, /Authorization header with Bearer token required/i);
    });

    it('A02 malformed Authorization -> 401', async () => {
      const res = await fetch(`${testBaseUrl}/test-auth/authenticate`, {
        headers: { Authorization: 'Basic abc123xyz' },
      });
      assert.strictEqual(res.status, 401);
      const body = (await res.json()) as any;
      assert.strictEqual(body.error.code, 'UNAUTHORIZED');
    });

    it('A03 empty Bearer -> 401', async () => {
      const res = await fetch(`${testBaseUrl}/test-auth/authenticate`, {
        headers: { Authorization: 'Bearer   ' },
      });
      assert.strictEqual(res.status, 401);
    });

    it('A04 invalid JWT -> 401', async () => {
      const res = await fetch(`${testBaseUrl}/test-auth/authenticate`, {
        headers: { Authorization: 'Bearer not.a.valid.jwt' },
      });
      assert.strictEqual(res.status, 401);
    });

    it('A05 expired JWT -> 401', async () => {
      const expiredToken = jwt.sign(
        {
          sub: testUser._id.toString(),
          email: testUser.email,
          roles: testUser.roles,
          isActive: true,
          tokenVersion: testUser.tokenVersion,
        },
        env.JWT_ACCESS_SECRET,
        { algorithm: 'HS256', expiresIn: -10 }
      );

      const res = await fetch(`${testBaseUrl}/test-auth/authenticate`, {
        headers: { Authorization: `Bearer ${expiredToken}` },
      });
      assert.strictEqual(res.status, 401);
      const body = (await res.json()) as any;
      assert.match(body.error.message, /expired/i);
    });

    it('A06 wrong signature -> 401', async () => {
      const wrongSignatureToken = jwt.sign(
        {
          sub: testUser._id.toString(),
          email: testUser.email,
          roles: testUser.roles,
          isActive: true,
          tokenVersion: testUser.tokenVersion,
        },
        'incorrect_signature_secret',
        { algorithm: 'HS256', expiresIn: 900 }
      );

      const res = await fetch(`${testBaseUrl}/test-auth/authenticate`, {
        headers: { Authorization: `Bearer ${wrongSignatureToken}` },
      });
      assert.strictEqual(res.status, 401);
    });
    it('A07 wrong algorithm -> 401', async () => {
      // Sign with HS384 instead of HS256
      const wrongAlgToken = jwt.sign(
        {
          sub: testUser._id.toString(),
          email: testUser.email,
          roles: testUser.roles,
          isActive: true,
          tokenVersion: testUser.tokenVersion,
        },
        env.JWT_ACCESS_SECRET,
        { algorithm: 'HS384', expiresIn: 900 }
      );

      const res = await fetch(`${testBaseUrl}/test-auth/authenticate`, {
        headers: { Authorization: `Bearer ${wrongAlgToken}` },
      });
      assert.strictEqual(res.status, 401);
    });

    it('A08 alg=none -> 401', async () => {
      const algNoneToken = jwt.sign(
        {
          sub: testUser._id.toString(),
          email: testUser.email,
          roles: testUser.roles,
          isActive: true,
          tokenVersion: testUser.tokenVersion,
        },
        '',
        { algorithm: 'none' as any }
      );

      const res = await fetch(`${testBaseUrl}/test-auth/authenticate`, {
        headers: { Authorization: `Bearer ${algNoneToken}` },
      });
      assert.strictEqual(res.status, 401);
    });

    it('A09 missing sub -> 401', async () => {
      const missingSubToken = jwt.sign(
        {
          email: testUser.email,
          roles: testUser.roles,
          isActive: true,
          tokenVersion: testUser.tokenVersion,
        },
        env.JWT_ACCESS_SECRET,
        { algorithm: 'HS256', expiresIn: 900 }
      );

      const res = await fetch(`${testBaseUrl}/test-auth/authenticate`, {
        headers: { Authorization: `Bearer ${missingSubToken}` },
      });
      assert.strictEqual(res.status, 401);
    });

    it('A10 invalid claims -> 401', async () => {
      // Empty roles or invalid types
      const invalidClaimsToken = jwt.sign(
        {
          sub: testUser._id.toString(),
          email: 'not-an-email',
          roles: 'ADMIN', // should be an array
          isActive: true,
          tokenVersion: testUser.tokenVersion,
        },
        env.JWT_ACCESS_SECRET,
        { algorithm: 'HS256', expiresIn: 900 }
      );

      const res = await fetch(`${testBaseUrl}/test-auth/authenticate`, {
        headers: { Authorization: `Bearer ${invalidClaimsToken}` },
      });
      assert.strictEqual(res.status, 401);
    });

    it('A11 invalid tokenVersion -> 401', async () => {
      const invalidVersionToken = jwt.sign(
        {
          sub: testUser._id.toString(),
          email: testUser.email,
          roles: testUser.roles,
          isActive: true,
          tokenVersion: 'v1', // should be a number
        },
        env.JWT_ACCESS_SECRET,
        { algorithm: 'HS256', expiresIn: 900 }
      );

      const res = await fetch(`${testBaseUrl}/test-auth/authenticate`, {
        headers: { Authorization: `Bearer ${invalidVersionToken}` },
      });
      assert.strictEqual(res.status, 401);
    });

    it('A12 inactive user -> 401', async () => {
      // Temporarily deactivate test student
      await User.findByIdAndUpdate(testUser._id, { isActive: false });

      const token = signAccessToken({
        sub: testUser._id.toString(),
        email: testUser.email,
        roles: testUser.roles,
        isActive: true,
        tokenVersion: testUser.tokenVersion,
      });

      const res = await fetch(`${testBaseUrl}/test-auth/authenticate`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      assert.strictEqual(res.status, 401);

      const body = (await res.json()) as any;
      assert.match(body.error.message, /inactive/i);

      // Reactivate
      await User.findByIdAndUpdate(testUser._id, { isActive: true });
    });

    it('A13 valid JWT -> authenticated', async () => {
      const token = signAccessToken({
        sub: testUser._id.toString(),
        email: testUser.email,
        roles: testUser.roles,
        isActive: true,
        tokenVersion: testUser.tokenVersion,
      });

      const res = await fetch(`${testBaseUrl}/test-auth/authenticate`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      assert.strictEqual(res.status, 200);
      const body = (await res.json()) as any;
      assert.ok(body.user);
      assert.strictEqual(body.user.id, testUser._id.toString());
    });
  });

  describe('Identity Protection & Context Disclosure (I)', () => {
    let token: string;
    let resBody: any;

    before(async () => {
      token = signAccessToken({
        sub: testUser._id.toString(),
        email: testUser.email,
        roles: testUser.roles,
        isActive: true,
        tokenVersion: testUser.tokenVersion,
        department: testUser.department,
      });

      const res = await fetch(`${testBaseUrl}/test-auth/authenticate`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      assert.strictEqual(res.status, 200);
      resBody = await res.json();
    });

    it('I01 req.user exists', () => {
      assert.ok(resBody.user, 'req.user must exist');
    });

    it('I02 correct user ID', () => {
      assert.strictEqual(resBody.user.id, testUser._id.toString());
    });

    it('I03 correct email', () => {
      assert.strictEqual(resBody.user.email, testUser.email);
    });

    it('I04 correct roles', () => {
      assert.deepStrictEqual(resBody.user.roles, testUser.roles);
    });

    it('I05 correct department where applicable', () => {
      assert.strictEqual(resBody.user.department, testUser.department);
    });

    it('I06 passwordHash absent', () => {
      assert.strictEqual(resBody.user.passwordHash, undefined, 'passwordHash must not leak');
      const rawString = JSON.stringify(resBody);
      assert.strictEqual(rawString.includes('passwordHash'), false, 'passwordHash key must not exist anywhere in the payload');
    });

    it('I07 access token absent', () => {
      assert.strictEqual(resBody.user.accessToken, undefined, 'accessToken must not leak in user payload');
      // It is fine if Bearer is in headers but should not be returned in user body
      assert.strictEqual(resBody.user.token === undefined, true);
    });

    it('I08 refresh token absent', () => {
      assert.strictEqual(resBody.user.refreshToken, undefined, 'refreshToken must not leak in user payload');
      const rawString = JSON.stringify(resBody);
      assert.strictEqual(rawString.includes('refreshToken'), false);
    });

    it('I09 secrets absent', () => {
      const rawString = JSON.stringify(resBody);
      assert.strictEqual(rawString.includes(env.JWT_ACCESS_SECRET), false, 'cryptographic secrets must never be disclosed');
    });
  });

  describe('RBAC Foundation & Or Logic (R)', () => {
    it('R01 required role succeeds', async () => {
      const adminToken = signAccessToken({
        sub: testAdmin._id.toString(),
        email: testAdmin.email,
        roles: testAdmin.roles,
        isActive: true,
        tokenVersion: testAdmin.tokenVersion,
      });

      const res = await fetch(`${testBaseUrl}/test-auth/admin-only`, {
        headers: { Authorization: `Bearer ${adminToken}` },
      });
      assert.strictEqual(res.status, 200);
      const body = (await res.json()) as any;
      assert.strictEqual(body.success, true);
    });

    it('R02 missing role -> 403', async () => {
      const studentToken = signAccessToken({
        sub: testUser._id.toString(),
        email: testUser.email,
        roles: testUser.roles,
        isActive: true,
        tokenVersion: testUser.tokenVersion,
      });

      const res = await fetch(`${testBaseUrl}/test-auth/admin-only`, {
        headers: { Authorization: `Bearer ${studentToken}` },
      });
      assert.strictEqual(res.status, 403);
      const body = (await res.json()) as any;
      assert.strictEqual(body.success, false);
      assert.strictEqual(body.error.code, 'FORBIDDEN');
    });

    it('R03 multiple roles -> correct OR behavior', async () => {
      // 1. Facility Manager can access multi-role endpoint (ADMIN or FACILITY_MANAGER)
      const fmToken = signAccessToken({
        sub: testFacilityManager._id.toString(),
        email: testFacilityManager.email,
        roles: testFacilityManager.roles,
        isActive: true,
        tokenVersion: testFacilityManager.tokenVersion,
      });

      const resFM = await fetch(`${testBaseUrl}/test-auth/multi-role`, {
        headers: { Authorization: `Bearer ${fmToken}` },
      });
      assert.strictEqual(resFM.status, 200, 'Facility Manager should access ADMIN or FACILITY_MANAGER route');

      // 2. Admin can access multi-role endpoint
      const adminToken = signAccessToken({
        sub: testAdmin._id.toString(),
        email: testAdmin.email,
        roles: testAdmin.roles,
        isActive: true,
        tokenVersion: testAdmin.tokenVersion,
      });

      const resAdmin = await fetch(`${testBaseUrl}/test-auth/multi-role`, {
        headers: { Authorization: `Bearer ${adminToken}` },
      });
      assert.strictEqual(resAdmin.status, 200, 'Admin should access ADMIN or FACILITY_MANAGER route');

      // 3. Student is rejected
      const studentToken = signAccessToken({
        sub: testUser._id.toString(),
        email: testUser.email,
        roles: testUser.roles,
        isActive: true,
        tokenVersion: testUser.tokenVersion,
      });

      const resStudent = await fetch(`${testBaseUrl}/test-auth/multi-role`, {
        headers: { Authorization: `Bearer ${studentToken}` },
      });
      assert.strictEqual(resStudent.status, 403, 'Student should be forbidden from multi-role route');
    });

    it('R04 unauthenticated -> 401', async () => {
      const res = await fetch(`${testBaseUrl}/test-auth/admin-only`);
      assert.strictEqual(res.status, 401);
    });

    it('R05 forged role claim rejected (DB holds correct truth)', async () => {
      // Client compromises a JWT generation or crafts a token with roles: ["ADMIN"]
      // but the actual DB record for this sub (testUser) is roles: ["STUDENT"]
      const forgedToken = jwt.sign(
        {
          sub: testUser._id.toString(), // Student sub
          email: testUser.email,
          roles: [UserRole.ADMIN], // Forged role claim in token!
          isActive: true,
          tokenVersion: testUser.tokenVersion,
        },
        env.JWT_ACCESS_SECRET,
        { algorithm: 'HS256', expiresIn: 900 }
      );

      // Attempt to access ADMIN-only route using the token
      const res = await fetch(`${testBaseUrl}/test-auth/admin-only`, {
        headers: { Authorization: `Bearer ${forgedToken}` },
      });

      // It must reject with 403 because the middleware loads the roles from the DB, not client JWT claims!
      assert.strictEqual(res.status, 403, 'Should load truth from DB and reject forged token claims with 403');
    });

    it('R06 modified role claim rejected', async () => {
      // Modifying roles in the token string itself breaks the signature
      const validToken = signAccessToken({
        sub: testUser._id.toString(),
        email: testUser.email,
        roles: testUser.roles,
        isActive: true,
        tokenVersion: testUser.tokenVersion,
      });

      const [header, payload, signature] = validToken.split('.');
      const decodedPayload = JSON.parse(Buffer.from(payload, 'base64').toString());
      decodedPayload.roles = [UserRole.ADMIN]; // Maliciously escalate roles
      const modifiedToken = `${header}.${Buffer.from(JSON.stringify(decodedPayload)).toString('base64')}.${signature}`;

      const res = await fetch(`${testBaseUrl}/test-auth/admin-only`, {
        headers: { Authorization: `Bearer ${modifiedToken}` },
      });

      assert.strictEqual(res.status, 401, 'Should reject modified token due to invalid signature');
    });
  });

  describe('Identity Forgery Protection (F)', () => {
    let token: string;

    before(() => {
      token = signAccessToken({
        sub: testUser._id.toString(),
        email: testUser.email,
        roles: testUser.roles,
        isActive: true,
        tokenVersion: testUser.tokenVersion,
      });
    });

    it('F01 body userId cannot replace JWT identity', async () => {
      const res = await fetch(`${testBaseUrl}/test-auth/authenticate`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ userId: testAdmin._id.toString() }),
      });

      assert.strictEqual(res.status, 200);
      const body = (await res.json()) as any;
      assert.strictEqual(body.user.id, testUser._id.toString(), 'Should retain student ID from JWT/DB');
    });

    it('F02 query userId cannot replace JWT identity', async () => {
      const res = await fetch(`${testBaseUrl}/test-auth/authenticate?userId=${testAdmin._id.toString()}`, {
        headers: { Authorization: `Bearer ${token}` },
      });

      assert.strictEqual(res.status, 200);
      const body = (await res.json()) as any;
      assert.strictEqual(body.user.id, testUser._id.toString(), 'Should retain student ID from JWT/DB');
    });

    it('F03 params userId cannot replace JWT identity', async () => {
      const res = await fetch(`${testBaseUrl}/test-auth/authenticate/${testAdmin._id.toString()}`, {
        headers: { Authorization: `Bearer ${token}` },
      });

      assert.strictEqual(res.status, 200);
      const body = (await res.json()) as any;
      assert.strictEqual(body.user.id, testUser._id.toString(), 'Should retain student ID from JWT/DB');
    });

    it('F04 client identity headers cannot replace JWT identity', async () => {
      const res = await fetch(`${testBaseUrl}/test-auth/authenticate`, {
        headers: {
          Authorization: `Bearer ${token}`,
          'X-User-Id': testAdmin._id.toString(),
          'X-User-Roles': 'ADMIN',
        },
      });

      assert.strictEqual(res.status, 200);
      const body = (await res.json()) as any;
      assert.strictEqual(body.user.id, testUser._id.toString(), 'Should retain student ID');
      assert.deepStrictEqual(body.user.roles, [UserRole.STUDENT], 'Should retain student roles');
    });
  });

  describe('Credential Disclosure Protections (D)', () => {
    it('D01 passwordHash never exposed', async () => {
      const token = signAccessToken({
        sub: testUser._id.toString(),
        email: testUser.email,
        roles: testUser.roles,
        isActive: true,
        tokenVersion: testUser.tokenVersion,
      });

      const res = await fetch(`${testBaseUrl}/test-auth/authenticate`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const text = await res.text();
      assert.strictEqual(text.includes('passwordHash'), false);
    });

    it('D02 JWT secret never exposed', async () => {
      const token = signAccessToken({
        sub: testUser._id.toString(),
        email: testUser.email,
        roles: testUser.roles,
        isActive: true,
        tokenVersion: testUser.tokenVersion,
      });

      const res = await fetch(`${testBaseUrl}/test-auth/authenticate`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const text = await res.text();
      assert.strictEqual(text.includes(env.JWT_ACCESS_SECRET), false);
    });

    it('D03 refresh token never exposed', async () => {
      const token = signAccessToken({
        sub: testUser._id.toString(),
        email: testUser.email,
        roles: testUser.roles,
        isActive: true,
        tokenVersion: testUser.tokenVersion,
      });

      const res = await fetch(`${testBaseUrl}/test-auth/authenticate`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const text = await res.text();
      assert.strictEqual(text.includes('refreshToken'), false);
    });

    it('D04 access token never exposed', async () => {
      const token = signAccessToken({
        sub: testUser._id.toString(),
        email: testUser.email,
        roles: testUser.roles,
        isActive: true,
        tokenVersion: testUser.tokenVersion,
      });

      const res = await fetch(`${testBaseUrl}/test-auth/authenticate`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const body = (await res.json()) as any;
      assert.strictEqual(body.user.accessToken, undefined);
    });

    it('D05 stack trace not exposed in production errors', async () => {
      const originalEnv = env.NODE_ENV;
      // Force production mode to ensure stack traces are hidden
      (env as any).NODE_ENV = 'production';

      const res = await fetch(`${testBaseUrl}/test-auth/authenticate`, {
        headers: { Authorization: 'Bearer invalid.token' },
      });
      assert.strictEqual(res.status, 401);
      const body = (await res.json()) as any;
      assert.strictEqual(body.error?.stack, undefined);

      // Restore original environment
      (env as any).NODE_ENV = originalEnv;
    });
  });
  describe('Route Protection & Public Routes (P)', () => {
    it('P01 login remains public', async () => {
      // POST to login with missing fields. Expect 400 validation error, not 401 Unauthorized.
      const res = await fetch(`${realBaseUrl}/api/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({}),
      });

      assert.strictEqual(res.status, 400);
      const body = (await res.json()) as any;
      assert.strictEqual(body.error.code, 'VALIDATION_ERROR');
    });

    it('P02 refresh remains public', async () => {
      // POST to refresh without refresh cookie. Expect 401, but from refresh validation, not from access token auth.
      const res = await fetch(`${realBaseUrl}/api/auth/refresh`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
      });

      assert.strictEqual(res.status, 401);
      const body = (await res.json()) as any;
      assert.strictEqual(body.error.code, 'UNAUTHORIZED');
      assert.match(body.error.message, /refresh token/i);
    });

    it('P03 logout remains usable and requires authentication', async () => {
      // 1. Unauthenticated logout is rejected with 401
      const resUnauth = await fetch(`${realBaseUrl}/api/auth/logout`, {
        method: 'POST',
      });
      assert.strictEqual(resUnauth.status, 401);

      // 2. Authenticated logout succeeds
      const token = signAccessToken({
        sub: testUser._id.toString(),
        email: testUser.email,
        roles: testUser.roles,
        isActive: true,
        tokenVersion: testUser.tokenVersion,
      });

      const resAuth = await fetch(`${realBaseUrl}/api/auth/logout`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
      });
      assert.strictEqual(resAuth.status, 200);
      const body = (await resAuth.json()) as any;
      assert.strictEqual(body.success, true);
    });

    it('P04 public availability remains public where applicable', async () => {
      // GET availability without token. Expect 400 validation (since query is missing), not 401 unauthorized.
      const res = await fetch(`${realBaseUrl}/api/bookings/availability`);
      assert.strictEqual(res.status, 400);
      const body = (await res.json()) as any;
      assert.strictEqual(body.error.code, 'VALIDATION_ERROR');
    });
  });

});
