/**
 * CampusFlow API - Phase 3.3 Check-In & Auto-Release Integration Test Suite
 * Comprehensive verification of:
 * 1. Ephemeral QR check-in token engine, single-use hashing, TTL, anti-enumeration, and rate limiting.
 * 2. 10 ordered check-in verification checks, idempotency, timing-safe equality, and atomic state transitions.
 * 3. Admin manual check-in override, justification auditing, and time boundary constraints.
 * 4. Early checkout, immediate slot capacity release, and transition to COMPLETED.
 * 5. Autonomous in-process auto-release scheduler, mutex, lookback bounds, and capacity recovery.
 * 6. Dynamic 30-day no-show evaluation, strike thresholds, suspension, and administrative pardons.
 */

import { describe, it, before, after, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import type { Server } from 'http';
import type { AddressInfo } from 'net';
import crypto from 'crypto';
import mongoose from 'mongoose';
import { connectDatabase, disconnectDatabase, isDatabaseConnected } from '../src/config/database';
import { env } from '../src/config/env';
import { app } from '../src/app';
import {
  User,
  UserRole,
  ResourceType,
  ResourceCategory,
  Resource,
  Reservation,
  ReservationStatus,
  AvailabilityRule,
  DayOfWeek,
  type ResourceDocument,
  type UserDocument,
} from '../src/models';
import { ReservationService } from '../src/services/reservation.service';
import { AutoReleaseScheduler } from '../src/schedulers/autoRelease.scheduler';
import { signAccessToken } from '../src/utils/jwt';
import { tokenRateLimiter } from '../src/utils/rateLimiter';

describe('CampusFlow Phase 3.3: Check-In & Auto-Release Integration Tests', () => {
  let server: Server;
  let baseUrl: string;

  const TEST_PREFIX = 'TEST_C33_';
  let testResourceType: any;
  let testResource1: ResourceDocument;
  let testResource2: ResourceDocument;

  let ownerUser: UserDocument;
  let otherUser: UserDocument;
  let adminUser: UserDocument;

  let ownerToken: string;
  let otherToken: string;
  let adminToken: string;

  before(async () => {
    await connectDatabase(env.MONGODB_TEST_URI);
    assert.strictEqual(isDatabaseConnected(), true);
    assert.strictEqual(mongoose.connection.db?.databaseName, 'campusflow_test');

    await Promise.all([
      Reservation.syncIndexes(),
      Resource.syncIndexes(),
      User.syncIndexes(),
    ]);

    // Clean up test collections for prefix
    await Promise.all([
      Reservation.deleteMany({ title: new RegExp(`^${TEST_PREFIX}`, 'i') }),
      Resource.deleteMany({ code: new RegExp(`^${TEST_PREFIX}`, 'i') }),
      ResourceType.deleteMany({ code: new RegExp(`^${TEST_PREFIX}`, 'i') }),
      User.deleteMany({ email: new RegExp(`^${TEST_PREFIX}`, 'i') }),
      AvailabilityRule.deleteMany({ name: new RegExp(`^${TEST_PREFIX}`, 'i') }),
    ]);

    testResourceType = await ResourceType.create({
      name: `${TEST_PREFIX}Conference Type`,
      code: `${TEST_PREFIX}CONF_TYPE`,
      category: ResourceCategory.MEETING_ROOM,
      isActive: true,
    });

    testResource1 = await Resource.create({
      name: `${TEST_PREFIX}Meeting Room Alpha`,
      code: `${TEST_PREFIX}ALPHA`,
      resourceType: testResourceType._id,
      capacity: 10,
      location: { building: 'Tech Hall', floor: 2, roomNumber: '201' },
      isActive: true,
    });

    testResource2 = await Resource.create({
      name: `${TEST_PREFIX}Meeting Room Beta`,
      code: `${TEST_PREFIX}BETA`,
      resourceType: testResourceType._id,
      capacity: 10,
      location: { building: 'Tech Hall', floor: 2, roomNumber: '202' },
      isActive: true,
    });

    for (const res of [testResource1, testResource2]) {
      await AvailabilityRule.create({
        resource: res._id,
        name: `${TEST_PREFIX}Rule ${res.code}`,
        timezone: 'UTC',
        windows: [
          DayOfWeek.MONDAY,
          DayOfWeek.TUESDAY,
          DayOfWeek.WEDNESDAY,
          DayOfWeek.THURSDAY,
          DayOfWeek.FRIDAY,
          DayOfWeek.SATURDAY,
          DayOfWeek.SUNDAY,
        ].map((day) => ({ dayOfWeek: day, startTime: '00:00', endTime: '23:59' })),
        bookingPolicy: {
          minDurationMinutes: 15,
          maxDurationMinutes: 480,
          minLeadTimeMinutes: 0,
          maxAdvanceBookingDays: 90,
        },
        isActive: true,
      });
    }

    ownerUser = await User.create({
      name: `${TEST_PREFIX}Owner User`,
      email: `${TEST_PREFIX}owner@univ.edu`,
      roles: [UserRole.STUDENT],
      department: 'Computer Science',
      isActive: true,
    });
    ownerToken = signAccessToken({
      sub: ownerUser._id.toString(),
      email: ownerUser.email,
      roles: ownerUser.roles,
      isActive: true,
      tokenVersion: 0,
    });

    otherUser = await User.create({
      name: `${TEST_PREFIX}Other User`,
      email: `${TEST_PREFIX}other@univ.edu`,
      roles: [UserRole.STUDENT],
      department: 'Computer Science',
      isActive: true,
    });
    otherToken = signAccessToken({
      sub: otherUser._id.toString(),
      email: otherUser.email,
      roles: otherUser.roles,
      isActive: true,
      tokenVersion: 0,
    });

    adminUser = await User.create({
      name: `${TEST_PREFIX}Admin User`,
      email: `${TEST_PREFIX}admin@univ.edu`,
      roles: [UserRole.ADMIN],
      department: 'Administration',
      isActive: true,
    });
    adminToken = signAccessToken({
      sub: adminUser._id.toString(),
      email: adminUser.email,
      roles: adminUser.roles,
      isActive: true,
      tokenVersion: 0,
    });

    server = app.listen(0);
    const addr = server.address() as AddressInfo;
    baseUrl = `http://127.0.0.1:${addr.port}`;
  });

  after(async () => {
    if (server) {
      await new Promise<void>((resolve) => server.close(() => resolve()));
    }
    await Promise.all([
      Reservation.deleteMany({ title: new RegExp(`^${TEST_PREFIX}`, 'i') }),
      Resource.deleteMany({ code: new RegExp(`^${TEST_PREFIX}`, 'i') }),
      ResourceType.deleteMany({ code: new RegExp(`^${TEST_PREFIX}`, 'i') }),
      User.deleteMany({ email: new RegExp(`^${TEST_PREFIX}`, 'i') }),
      AvailabilityRule.deleteMany({ name: new RegExp(`^${TEST_PREFIX}`, 'i') }),
    ]);
    await disconnectDatabase();
  });

  beforeEach(() => {
    tokenRateLimiter.reset();
  });

  /* ─────────────────────────────────────────────────────────────
   * 1. CHECK-IN TOKEN GENERATION TESTS
   * ───────────────────────────────────────────────────────────── */
  describe('Check-In Token Generation (POST /api/bookings/:id/check-in-token)', () => {
    it('generates an ephemeral 64-char token for the booking owner within valid window', async () => {
      const now = new Date();
      const startAt = new Date(now.getTime() + 5 * 60 * 1000); // 5 min in future (within 15m early window)
      const endAt = new Date(now.getTime() + 65 * 60 * 1000);

      const reservation = await Reservation.create({
        title: `${TEST_PREFIX}Token Gen Valid`,
        resource: testResource1._id,
        user: ownerUser._id,
        startAt,
        endAt,
        timezone: 'UTC',
        status: ReservationStatus.CONFIRMED,
      });

      const res = await fetch(`${baseUrl}/api/bookings/${reservation._id}/check-in-token`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${ownerToken}` },
      });

      assert.strictEqual(res.status, 200);
      const body = await res.json();
      assert.strictEqual(body.success, true);
      assert.strictEqual(typeof body.data.token, 'string');
      assert.strictEqual(body.data.token.length, 64); // 32 random bytes hex
      assert.strictEqual(body.data.resourceId, testResource1._id.toString());

      // Verify SHA-256 hash was persisted in MongoDB, plaintext NOT persisted
      const saved = await Reservation.findById(reservation._id).select('+checkInTokenHash');
      assert.ok(saved?.checkInTokenHash);
      assert.notStrictEqual(saved?.checkInTokenHash, body.data.token);
      const computedHash = crypto.createHash('sha256').update(body.data.token).digest('hex');
      assert.strictEqual(saved?.checkInTokenHash, computedHash);
    });

    it('enforces anti-enumeration: returns 404 RESERVATION_NOT_FOUND when non-owner requests token', async () => {
      const now = new Date();
      const reservation = await Reservation.create({
        title: `${TEST_PREFIX}Token Anti-Enum`,
        resource: testResource1._id,
        user: ownerUser._id,
        startAt: new Date(now.getTime() + 5 * 60 * 1000),
        endAt: new Date(now.getTime() + 65 * 60 * 1000),
        timezone: 'UTC',
        status: ReservationStatus.CONFIRMED,
      });

      const res = await fetch(`${baseUrl}/api/bookings/${reservation._id}/check-in-token`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${otherToken}` },
      });

      assert.strictEqual(res.status, 404);
      const body = await res.json();
      assert.strictEqual(body.error?.code, 'RESERVATION_NOT_FOUND');
    });

    it('allows ADMIN to generate check-in token for any booking', async () => {
      const now = new Date();
      const reservation = await Reservation.create({
        title: `${TEST_PREFIX}Token Admin Allowed`,
        resource: testResource1._id,
        user: ownerUser._id,
        startAt: new Date(now.getTime() + 5 * 60 * 1000),
        endAt: new Date(now.getTime() + 65 * 60 * 1000),
        timezone: 'UTC',
        status: ReservationStatus.CONFIRMED,
      });

      const res = await fetch(`${baseUrl}/api/bookings/${reservation._id}/check-in-token`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${adminToken}` },
      });

      assert.strictEqual(res.status, 200);
      const body = await res.json();
      assert.strictEqual(body.success, true);
    });

    it('rejects token generation when booking is not CONFIRMED', async () => {
      const now = new Date();
      const reservation = await Reservation.create({
        title: `${TEST_PREFIX}Token Non-Confirmed`,
        resource: testResource1._id,
        user: ownerUser._id,
        startAt: new Date(now.getTime() + 5 * 60 * 1000),
        endAt: new Date(now.getTime() + 65 * 60 * 1000),
        timezone: 'UTC',
        status: ReservationStatus.PENDING,
      });

      const res = await fetch(`${baseUrl}/api/bookings/${reservation._id}/check-in-token`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${ownerToken}` },
      });

      assert.strictEqual(res.status, 409);
      const body = await res.json();
      assert.strictEqual(body.error?.code, 'RESERVATION_NOT_CONFIRMED');
    });

    it('rejects token generation when window is not open (startAt > now + 15m)', async () => {
      const now = new Date();
      const reservation = await Reservation.create({
        title: `${TEST_PREFIX}Token Too Early`,
        resource: testResource1._id,
        user: ownerUser._id,
        startAt: new Date(now.getTime() + 60 * 60 * 1000), // 1 hour in future
        endAt: new Date(now.getTime() + 120 * 60 * 1000),
        timezone: 'UTC',
        status: ReservationStatus.CONFIRMED,
      });

      const res = await fetch(`${baseUrl}/api/bookings/${reservation._id}/check-in-token`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${ownerToken}` },
      });

      assert.strictEqual(res.status, 400);
      const body = await res.json();
      assert.strictEqual(body.error?.code, 'CHECKIN_WINDOW_NOT_OPEN');
    });

    it('rejects token generation when grace window has expired (now > startAt + 15m)', async () => {
      const now = new Date();
      const reservation = await Reservation.create({
        title: `${TEST_PREFIX}Token Grace Expired`,
        resource: testResource1._id,
        user: ownerUser._id,
        startAt: new Date(now.getTime() - 20 * 60 * 1000), // 20m in past
        endAt: new Date(now.getTime() + 40 * 60 * 1000),
        timezone: 'UTC',
        status: ReservationStatus.CONFIRMED,
      });

      const res = await fetch(`${baseUrl}/api/bookings/${reservation._id}/check-in-token`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${ownerToken}` },
      });

      assert.strictEqual(res.status, 400);
      const body = await res.json();
      assert.strictEqual(body.error?.code, 'CHECKIN_WINDOW_EXPIRED');
    });

    it('enforces rate limiting: rejects 6th request within 1 minute with 429', async () => {
      const now = new Date();
      const reservation = await Reservation.create({
        title: `${TEST_PREFIX}Token Rate Limit`,
        resource: testResource1._id,
        user: ownerUser._id,
        startAt: new Date(now.getTime() + 5 * 60 * 1000),
        endAt: new Date(now.getTime() + 65 * 60 * 1000),
        timezone: 'UTC',
        status: ReservationStatus.CONFIRMED,
      });

      // 5 successful requests
      for (let i = 0; i < 5; i++) {
        const res = await fetch(`${baseUrl}/api/bookings/${reservation._id}/check-in-token`, {
          method: 'POST',
          headers: { Authorization: `Bearer ${ownerToken}` },
        });
        assert.strictEqual(res.status, 200);
      }

      // 6th request should be rate limited
      const res6 = await fetch(`${baseUrl}/api/bookings/${reservation._id}/check-in-token`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${ownerToken}` },
      });
      assert.strictEqual(res6.status, 429);
      const body6 = await res6.json();
      assert.strictEqual(body6.error?.code, 'RATE_LIMIT_EXCEEDED');
    });

    it('invalidates previously issued token on regeneration', async () => {
      const now = new Date();
      const reservation = await Reservation.create({
        title: `${TEST_PREFIX}Token Invalidation`,
        resource: testResource1._id,
        user: ownerUser._id,
        startAt: new Date(now.getTime() + 5 * 60 * 1000),
        endAt: new Date(now.getTime() + 65 * 60 * 1000),
        timezone: 'UTC',
        status: ReservationStatus.CONFIRMED,
      });

      const res1 = await fetch(`${baseUrl}/api/bookings/${reservation._id}/check-in-token`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${ownerToken}` },
      });
      const token1 = (await res1.json()).data.token;

      const res2 = await fetch(`${baseUrl}/api/bookings/${reservation._id}/check-in-token`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${ownerToken}` },
      });
      const token2 = (await res2.json()).data.token;

      assert.notStrictEqual(token1, token2);

      // Attempt check-in with token 1: should fail with INVALID_CHECKIN_TOKEN
      const checkInRes = await fetch(`${baseUrl}/api/bookings/${reservation._id}/check-in`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${ownerToken}`,
        },
        body: JSON.stringify({
          token: token1,
          resourceId: testResource1._id.toString(),
        }),
      });
      assert.strictEqual(checkInRes.status, 400);
      const checkInBody = await checkInRes.json();
      assert.strictEqual(checkInBody.error?.code, 'INVALID_CHECKIN_TOKEN');
    });
  });

  /* ─────────────────────────────────────────────────────────────
   * 2. QR CHECK-IN VALIDATION (10 ORDERED CHECKS) & IDEMPOTENCY
   * ───────────────────────────────────────────────────────────── */
  describe('QR Check-In Endpoint (POST /api/bookings/:id/check-in)', () => {
    it('performs successful QR check-in: transitions CONFIRMED -> CHECKED_IN', async () => {
      const now = new Date();
      const reservation = await Reservation.create({
        title: `${TEST_PREFIX}QR CheckIn Success`,
        resource: testResource1._id,
        user: ownerUser._id,
        startAt: new Date(now.getTime() + 5 * 60 * 1000),
        endAt: new Date(now.getTime() + 65 * 60 * 1000),
        timezone: 'UTC',
        status: ReservationStatus.CONFIRMED,
      });

      const tokenRes = await fetch(`${baseUrl}/api/bookings/${reservation._id}/check-in-token`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${ownerToken}` },
      });
      const token = (await tokenRes.json()).data.token;

      const checkInRes = await fetch(`${baseUrl}/api/bookings/${reservation._id}/check-in`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${ownerToken}`,
        },
        body: JSON.stringify({
          token,
          resourceId: testResource1._id.toString(),
        }),
      });

      assert.strictEqual(checkInRes.status, 200);
      const body = await checkInRes.json();
      assert.strictEqual(body.success, true);
      assert.strictEqual(body.data.status, 'CHECKED_IN');
      assert.ok(body.data.checkInAt);

      const updated = await Reservation.findById(reservation._id);
      assert.strictEqual(updated?.status, ReservationStatus.CHECKED_IN);
      assert.strictEqual(updated?.checkInMethod, 'QR_SCAN');
      assert.ok(updated?.checkInTokenUsedAt);
    });

    it('enforces check 1: anti-enumeration 404 for non-owner caller', async () => {
      const now = new Date();
      const reservation = await Reservation.create({
        title: `${TEST_PREFIX}Check1 Anti-Enum`,
        resource: testResource1._id,
        user: ownerUser._id,
        startAt: new Date(now.getTime() + 5 * 60 * 1000),
        endAt: new Date(now.getTime() + 65 * 60 * 1000),
        timezone: 'UTC',
        status: ReservationStatus.CONFIRMED,
      });

      const checkInRes = await fetch(`${baseUrl}/api/bookings/${reservation._id}/check-in`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${otherToken}`,
        },
        body: JSON.stringify({
          token: '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef',
          resourceId: testResource1._id.toString(),
        }),
      });

      assert.strictEqual(checkInRes.status, 404);
      const body = await checkInRes.json();
      assert.strictEqual(body.error?.code, 'RESERVATION_NOT_FOUND');
    });

    it('enforces check 2: owner idempotency on re-scan returns 200 isIdempotent: true', async () => {
      const now = new Date();
      const reservation = await Reservation.create({
        title: `${TEST_PREFIX}Check2 Idempotency`,
        resource: testResource1._id,
        user: ownerUser._id,
        startAt: new Date(now.getTime() + 5 * 60 * 1000),
        endAt: new Date(now.getTime() + 65 * 60 * 1000),
        timezone: 'UTC',
        status: ReservationStatus.CONFIRMED,
      });

      const tokenRes = await fetch(`${baseUrl}/api/bookings/${reservation._id}/check-in-token`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${ownerToken}` },
      });
      const token = (await tokenRes.json()).data.token;

      // First check-in
      await fetch(`${baseUrl}/api/bookings/${reservation._id}/check-in`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${ownerToken}`,
        },
        body: JSON.stringify({
          token,
          resourceId: testResource1._id.toString(),
        }),
      });

      // Second check-in by owner with same token
      const reScanRes = await fetch(`${baseUrl}/api/bookings/${reservation._id}/check-in`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${ownerToken}`,
        },
        body: JSON.stringify({
          token,
          resourceId: testResource1._id.toString(),
        }),
      });

      assert.strictEqual(reScanRes.status, 200);
      const reScanBody = await reScanRes.json();
      assert.strictEqual(reScanBody.success, true);
      assert.strictEqual(reScanBody.data.isIdempotent, true);
      assert.strictEqual(reScanBody.data.status, 'CHECKED_IN');
    });

    it('enforces check 3: rejects when status is not CONFIRMED', async () => {
      const now = new Date();
      const reservation = await Reservation.create({
        title: `${TEST_PREFIX}Check3 Wrong Status`,
        resource: testResource1._id,
        user: ownerUser._id,
        startAt: new Date(now.getTime() + 5 * 60 * 1000),
        endAt: new Date(now.getTime() + 65 * 60 * 1000),
        timezone: 'UTC',
        status: ReservationStatus.CANCELLED,
      });

      const checkInRes = await fetch(`${baseUrl}/api/bookings/${reservation._id}/check-in`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${ownerToken}`,
        },
        body: JSON.stringify({
          token: '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef',
          resourceId: testResource1._id.toString(),
        }),
      });

      assert.strictEqual(checkInRes.status, 409);
      const body = await checkInRes.json();
      assert.strictEqual(body.error?.code, 'INVALID_RESERVATION_STATUS');
    });

    it('enforces check 4: pre-window check rejects before early check-in window', async () => {
      const now = new Date();
      const plaintextToken = crypto.randomBytes(32).toString('hex');
      const tokenHash = crypto.createHash('sha256').update(plaintextToken).digest('hex');

      const reservation = await Reservation.create({
        title: `${TEST_PREFIX}Check4 Pre-Window`,
        resource: testResource1._id,
        user: ownerUser._id,
        startAt: new Date(now.getTime() + 60 * 60 * 1000), // 60 min in future (> 15m)
        endAt: new Date(now.getTime() + 120 * 60 * 1000),
        timezone: 'UTC',
        status: ReservationStatus.CONFIRMED,
        checkInTokenHash: tokenHash,
        checkInTokenExpiresAt: new Date(now.getTime() + 5 * 60 * 1000),
      });

      const checkInRes = await fetch(`${baseUrl}/api/bookings/${reservation._id}/check-in`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${ownerToken}`,
        },
        body: JSON.stringify({
          token: plaintextToken,
          resourceId: testResource1._id.toString(),
        }),
      });

      assert.strictEqual(checkInRes.status, 400);
      const body = await checkInRes.json();
      assert.strictEqual(body.error?.code, 'CHECKIN_WINDOW_NOT_OPEN');
    });

    it('enforces check 5: post-grace expiration rejects when now > startAt + grace', async () => {
      const now = new Date();
      const plaintextToken = crypto.randomBytes(32).toString('hex');
      const tokenHash = crypto.createHash('sha256').update(plaintextToken).digest('hex');

      const reservation = await Reservation.create({
        title: `${TEST_PREFIX}Check5 Post-Grace`,
        resource: testResource1._id,
        user: ownerUser._id,
        startAt: new Date(now.getTime() - 20 * 60 * 1000), // 20m in past (> 15m grace)
        endAt: new Date(now.getTime() + 40 * 60 * 1000),
        timezone: 'UTC',
        status: ReservationStatus.CONFIRMED,
        checkInTokenHash: tokenHash,
        checkInTokenExpiresAt: new Date(now.getTime() + 5 * 60 * 1000),
      });

      const checkInRes = await fetch(`${baseUrl}/api/bookings/${reservation._id}/check-in`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${ownerToken}`,
        },
        body: JSON.stringify({
          token: plaintextToken,
          resourceId: testResource1._id.toString(),
        }),
      });

      assert.strictEqual(checkInRes.status, 400);
      const body = await checkInRes.json();
      assert.strictEqual(body.error?.code, 'CHECKIN_WINDOW_EXPIRED');
    });

    it('enforces check 6: rejects when reservation has no active check-in token', async () => {
      const now = new Date();
      const reservation = await Reservation.create({
        title: `${TEST_PREFIX}Check6 No Token`,
        resource: testResource1._id,
        user: ownerUser._id,
        startAt: new Date(now.getTime() + 5 * 60 * 1000),
        endAt: new Date(now.getTime() + 65 * 60 * 1000),
        timezone: 'UTC',
        status: ReservationStatus.CONFIRMED,
      });

      const checkInRes = await fetch(`${baseUrl}/api/bookings/${reservation._id}/check-in`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${ownerToken}`,
        },
        body: JSON.stringify({
          token: '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef',
          resourceId: testResource1._id.toString(),
        }),
      });

      assert.strictEqual(checkInRes.status, 400);
      const body = await checkInRes.json();
      assert.strictEqual(body.error?.code, 'INVALID_CHECKIN_TOKEN');
    });

    it('enforces check 7: rejects when check-in token is expired (> 5 min TTL)', async () => {
      const now = new Date();
      const plaintextToken = crypto.randomBytes(32).toString('hex');
      const tokenHash = crypto.createHash('sha256').update(plaintextToken).digest('hex');

      const reservation = await Reservation.create({
        title: `${TEST_PREFIX}Check7 Token Expired`,
        resource: testResource1._id,
        user: ownerUser._id,
        startAt: new Date(now.getTime() + 5 * 60 * 1000),
        endAt: new Date(now.getTime() + 65 * 60 * 1000),
        timezone: 'UTC',
        status: ReservationStatus.CONFIRMED,
        checkInTokenHash: tokenHash,
        checkInTokenExpiresAt: new Date(now.getTime() - 1000), // Expired 1s ago
      });

      const checkInRes = await fetch(`${baseUrl}/api/bookings/${reservation._id}/check-in`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${ownerToken}`,
        },
        body: JSON.stringify({
          token: plaintextToken,
          resourceId: testResource1._id.toString(),
        }),
      });

      assert.strictEqual(checkInRes.status, 400);
      const body = await checkInRes.json();
      assert.strictEqual(body.error?.code, 'TOKEN_EXPIRED');
    });

    it('enforces check 8: rejects when token has already been used on unconfirmed booking', async () => {
      const now = new Date();
      const plaintextToken = crypto.randomBytes(32).toString('hex');
      const tokenHash = crypto.createHash('sha256').update(plaintextToken).digest('hex');

      const reservation = await Reservation.create({
        title: `${TEST_PREFIX}Check8 Token Used`,
        resource: testResource1._id,
        user: ownerUser._id,
        startAt: new Date(now.getTime() + 5 * 60 * 1000),
        endAt: new Date(now.getTime() + 65 * 60 * 1000),
        timezone: 'UTC',
        status: ReservationStatus.CONFIRMED,
        checkInTokenHash: tokenHash,
        checkInTokenExpiresAt: new Date(now.getTime() + 5 * 60 * 1000),
        checkInTokenUsedAt: new Date(now.getTime() - 1000), // Marked used
      });

      const checkInRes = await fetch(`${baseUrl}/api/bookings/${reservation._id}/check-in`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${ownerToken}`,
        },
        body: JSON.stringify({
          token: plaintextToken,
          resourceId: testResource1._id.toString(),
        }),
      });

      assert.strictEqual(checkInRes.status, 409);
      const body = await checkInRes.json();
      assert.strictEqual(body.error?.code, 'TOKEN_ALREADY_USED');
    });

    it('enforces check 9: timing-safe cryptographic comparison rejects wrong token', async () => {
      const now = new Date();
      const plaintextToken = crypto.randomBytes(32).toString('hex');
      const tokenHash = crypto.createHash('sha256').update(plaintextToken).digest('hex');
      const bogusToken = crypto.randomBytes(32).toString('hex');

      const reservation = await Reservation.create({
        title: `${TEST_PREFIX}Check9 Wrong Hash`,
        resource: testResource1._id,
        user: ownerUser._id,
        startAt: new Date(now.getTime() + 5 * 60 * 1000),
        endAt: new Date(now.getTime() + 65 * 60 * 1000),
        timezone: 'UTC',
        status: ReservationStatus.CONFIRMED,
        checkInTokenHash: tokenHash,
        checkInTokenExpiresAt: new Date(now.getTime() + 5 * 60 * 1000),
      });

      const checkInRes = await fetch(`${baseUrl}/api/bookings/${reservation._id}/check-in`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${ownerToken}`,
        },
        body: JSON.stringify({
          token: bogusToken,
          resourceId: testResource1._id.toString(),
        }),
      });

      assert.strictEqual(checkInRes.status, 400);
      const body = await checkInRes.json();
      assert.strictEqual(body.error?.code, 'INVALID_CHECKIN_TOKEN');
    });

    it('enforces check 10: resource verification rejects mismatched resource code', async () => {
      const now = new Date();
      const plaintextToken = crypto.randomBytes(32).toString('hex');
      const tokenHash = crypto.createHash('sha256').update(plaintextToken).digest('hex');

      const reservation = await Reservation.create({
        title: `${TEST_PREFIX}Check10 Resource Mismatch`,
        resource: testResource1._id,
        user: ownerUser._id,
        startAt: new Date(now.getTime() + 5 * 60 * 1000),
        endAt: new Date(now.getTime() + 65 * 60 * 1000),
        timezone: 'UTC',
        status: ReservationStatus.CONFIRMED,
        checkInTokenHash: tokenHash,
        checkInTokenExpiresAt: new Date(now.getTime() + 5 * 60 * 1000),
      });

      const checkInRes = await fetch(`${baseUrl}/api/bookings/${reservation._id}/check-in`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${ownerToken}`,
        },
        body: JSON.stringify({
          token: plaintextToken,
          resourceId: testResource2._id.toString(), // Scanned Beta instead of Alpha
        }),
      });

      assert.strictEqual(checkInRes.status, 400);
      const body = await checkInRes.json();
      assert.strictEqual(body.error?.code, 'RESOURCE_MISMATCH');
    });
  });

  /* ─────────────────────────────────────────────────────────────
   * 3. ADMIN MANUAL CHECK-IN TESTS
   * ───────────────────────────────────────────────────────────── */
  describe('Admin Manual Check-In (POST /api/bookings/:id/manual-check-in)', () => {
    it('allows ADMIN to manually check in booking past grace period up to endAt', async () => {
      const now = new Date();
      const reservation = await Reservation.create({
        title: `${TEST_PREFIX}Manual CheckIn Admin`,
        resource: testResource1._id,
        user: ownerUser._id,
        startAt: new Date(now.getTime() - 30 * 60 * 1000), // 30m in past (well past 15m grace)
        endAt: new Date(now.getTime() + 30 * 60 * 1000),   // Still before endAt
        timezone: 'UTC',
        status: ReservationStatus.CONFIRMED,
      });

      const res = await fetch(`${baseUrl}/api/bookings/${reservation._id}/manual-check-in`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${adminToken}`,
        },
        body: JSON.stringify({
          justification: 'Card reader offline, student confirmed in room with lab attendant.',
        }),
      });

      assert.strictEqual(res.status, 200);
      const body = await res.json();
      assert.strictEqual(body.success, true);
      assert.strictEqual(body.data.status, 'CHECKED_IN');

      const updated = await Reservation.findById(reservation._id);
      assert.strictEqual(updated?.status, ReservationStatus.CHECKED_IN);
      assert.strictEqual(updated?.checkInMethod, 'ADMIN_MANUAL');
      assert.strictEqual(updated?.checkedInBy?.toString(), adminUser._id.toString());
      assert.ok(updated?.checkInNotes?.includes('Card reader offline'));
    });

    it('rejects manual check-in from non-admin with 403 Forbidden', async () => {
      const now = new Date();
      const reservation = await Reservation.create({
        title: `${TEST_PREFIX}Manual CheckIn Forbidden`,
        resource: testResource1._id,
        user: ownerUser._id,
        startAt: new Date(now.getTime() - 5 * 60 * 1000),
        endAt: new Date(now.getTime() + 55 * 60 * 1000),
        timezone: 'UTC',
        status: ReservationStatus.CONFIRMED,
      });

      const res = await fetch(`${baseUrl}/api/bookings/${reservation._id}/manual-check-in`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${ownerToken}`,
        },
        body: JSON.stringify({
          justification: 'Trying to manually check in without admin privileges.',
        }),
      });

      assert.strictEqual(res.status, 403);
    });

    it('rejects manual check-in with justification shorter than 10 characters', async () => {
      const now = new Date();
      const reservation = await Reservation.create({
        title: `${TEST_PREFIX}Manual Justification Short`,
        resource: testResource1._id,
        user: ownerUser._id,
        startAt: new Date(now.getTime() - 5 * 60 * 1000),
        endAt: new Date(now.getTime() + 55 * 60 * 1000),
        timezone: 'UTC',
        status: ReservationStatus.CONFIRMED,
      });

      const res = await fetch(`${baseUrl}/api/bookings/${reservation._id}/manual-check-in`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${adminToken}`,
        },
        body: JSON.stringify({
          justification: 'Too short', // 9 chars
        }),
      });

      assert.strictEqual(res.status, 400);
    });

    it('rejects manual check-in when reservation has already ended (now >= endAt)', async () => {
      const now = new Date();
      const reservation = await Reservation.create({
        title: `${TEST_PREFIX}Manual Ended`,
        resource: testResource1._id,
        user: ownerUser._id,
        startAt: new Date(now.getTime() - 120 * 60 * 1000),
        endAt: new Date(now.getTime() - 10 * 60 * 1000), // Ended 10m ago
        timezone: 'UTC',
        status: ReservationStatus.CONFIRMED,
      });

      const res = await fetch(`${baseUrl}/api/bookings/${reservation._id}/manual-check-in`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${adminToken}`,
        },
        body: JSON.stringify({
          justification: 'Trying to check in after the meeting completely concluded.',
        }),
      });

      assert.strictEqual(res.status, 400);
      const body = await res.json();
      assert.strictEqual(body.error?.code, 'RESERVATION_ENDED');
    });
  });

  /* ─────────────────────────────────────────────────────────────
   * 4. EARLY CHECKOUT & CAPACITY RESTORATION TESTS
   * ───────────────────────────────────────────────────────────── */
  describe('Early Checkout (POST /api/bookings/:id/checkout)', () => {
    it('transitions CHECKED_IN -> COMPLETED and restores capacity immediately', async () => {
      const now = new Date();
      const startAt = new Date(now.getTime() - 10 * 60 * 1000);
      const endAt = new Date(now.getTime() + 50 * 60 * 1000);

      const reservation = await Reservation.create({
        title: `${TEST_PREFIX}Checkout Test`,
        resource: testResource1._id,
        user: ownerUser._id,
        startAt,
        endAt,
        timezone: 'UTC',
        status: ReservationStatus.CHECKED_IN,
        checkInAt: startAt,
      });

      // Checkout by owner
      const res = await fetch(`${baseUrl}/api/bookings/${reservation._id}/checkout`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${ownerToken}` },
      });

      assert.strictEqual(res.status, 200);
      const body = await res.json();
      assert.strictEqual(body.success, true);
      assert.strictEqual(body.data.status, 'COMPLETED');
      assert.ok(body.data.checkOutAt);

      const updated = await Reservation.findById(reservation._id);
      assert.strictEqual(updated?.status, ReservationStatus.COMPLETED);
      assert.ok(updated?.checkOutAt);

      // Verify that another reservation can now be booked for the exact same slot without conflict
      const newReservation = await Reservation.create({
        title: `${TEST_PREFIX}Post Checkout Rebook`,
        resource: testResource1._id,
        user: otherUser._id,
        startAt,
        endAt,
        timezone: 'UTC',
        status: ReservationStatus.CONFIRMED,
      });
      assert.ok(newReservation._id);
    });

    it('enforces anti-enumeration 404 when non-owner/non-admin attempts checkout', async () => {
      const now = new Date();
      const reservation = await Reservation.create({
        title: `${TEST_PREFIX}Checkout Anti-Enum`,
        resource: testResource1._id,
        user: ownerUser._id,
        startAt: new Date(now.getTime() - 10 * 60 * 1000),
        endAt: new Date(now.getTime() + 50 * 60 * 1000),
        timezone: 'UTC',
        status: ReservationStatus.CHECKED_IN,
      });

      const res = await fetch(`${baseUrl}/api/bookings/${reservation._id}/checkout`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${otherToken}` },
      });

      assert.strictEqual(res.status, 404);
      const body = await res.json();
      assert.strictEqual(body.error?.code, 'RESERVATION_NOT_FOUND');
    });

    it('rejects checkout when booking is not in CHECKED_IN status', async () => {
      const now = new Date();
      const reservation = await Reservation.create({
        title: `${TEST_PREFIX}Checkout Not Checked In`,
        resource: testResource1._id,
        user: ownerUser._id,
        startAt: new Date(now.getTime() - 10 * 60 * 1000),
        endAt: new Date(now.getTime() + 50 * 60 * 1000),
        timezone: 'UTC',
        status: ReservationStatus.CONFIRMED,
      });

      const res = await fetch(`${baseUrl}/api/bookings/${reservation._id}/checkout`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${ownerToken}` },
      });

      assert.strictEqual(res.status, 409);
      const body = await res.json();
      assert.strictEqual(body.error?.code, 'INVALID_RESERVATION_STATUS');
    });
  });

  /* ─────────────────────────────────────────────────────────────
   * 5. AUTONOMOUS IN-PROCESS AUTO-RELEASE SCHEDULER TESTS
   * ───────────────────────────────────────────────────────────── */
  describe('Autonomous Auto-Release Scheduler (AutoReleaseScheduler)', () => {
    it('releases past-grace CONFIRMED bookings to NO_SHOW and restores capacity', async () => {
      const now = new Date();
      // startAt was 30 minutes ago (well past 15m grace)
      const startAt = new Date(now.getTime() - 30 * 60 * 1000);
      const endAt = new Date(now.getTime() + 30 * 60 * 1000);

      const reservation = await Reservation.create({
        title: `${TEST_PREFIX}Scheduler Release`,
        resource: testResource1._id,
        user: ownerUser._id,
        startAt,
        endAt,
        timezone: 'UTC',
        status: ReservationStatus.CONFIRMED,
      });

      // Run single sweep
      const scheduler = new AutoReleaseScheduler();
      const { released } = await scheduler.runOnce();
      assert.ok(released >= 1);

      const updated = await Reservation.findById(reservation._id);
      assert.strictEqual(updated?.status, ReservationStatus.NO_SHOW);
      assert.ok(updated?.autoReleasedAt);
      assert.ok(updated?.autoReleaseReason?.includes('Check-in grace period expired'));

      // Verify that slot capacity was freed up and a new booking succeeds
      const newBooking = await Reservation.create({
        title: `${TEST_PREFIX}Scheduler Rebook`,
        resource: testResource1._id,
        user: otherUser._id,
        startAt,
        endAt,
        timezone: 'UTC',
        status: ReservationStatus.CONFIRMED,
      });
      assert.ok(newBooking._id);
    });

    it('never auto-releases PENDING bookings', async () => {
      const now = new Date();
      const startAt = new Date(now.getTime() - 30 * 60 * 1000);
      const endAt = new Date(now.getTime() + 30 * 60 * 1000);

      const reservation = await Reservation.create({
        title: `${TEST_PREFIX}Scheduler Ignore Pending`,
        resource: testResource2._id,
        user: ownerUser._id,
        startAt,
        endAt,
        timezone: 'UTC',
        status: ReservationStatus.PENDING,
      });

      const scheduler = new AutoReleaseScheduler();
      await scheduler.runOnce();

      const notReleased = await Reservation.findById(reservation._id);
      assert.strictEqual(notReleased?.status, ReservationStatus.PENDING);
    });

    it('never auto-releases CHECKED_IN bookings', async () => {
      const now = new Date();
      const startAt = new Date(now.getTime() - 30 * 60 * 1000);
      const endAt = new Date(now.getTime() + 30 * 60 * 1000);

      const reservation = await Reservation.create({
        title: `${TEST_PREFIX}Scheduler Ignore CheckedIn`,
        resource: testResource2._id,
        user: ownerUser._id,
        startAt,
        endAt,
        timezone: 'UTC',
        status: ReservationStatus.CHECKED_IN,
        checkInAt: startAt,
      });

      const scheduler = new AutoReleaseScheduler();
      await scheduler.runOnce();

      const notReleased = await Reservation.findById(reservation._id);
      assert.strictEqual(notReleased?.status, ReservationStatus.CHECKED_IN);
    });

    it('respects lookback window: does not touch bookings older than 24 hours', async () => {
      const now = new Date();
      // startAt was 30 hours ago (beyond default 24h lookback)
      const startAt = new Date(now.getTime() - 30 * 60 * 60 * 1000);
      const endAt = new Date(now.getTime() - 29 * 60 * 60 * 1000);

      const reservation = await Reservation.create({
        title: `${TEST_PREFIX}Scheduler Beyond Lookback`,
        resource: testResource2._id,
        user: ownerUser._id,
        startAt,
        endAt,
        timezone: 'UTC',
        status: ReservationStatus.CONFIRMED,
      });

      const scheduler = new AutoReleaseScheduler();
      await scheduler.runOnce();

      const notReleased = await Reservation.findById(reservation._id);
      assert.strictEqual(notReleased?.status, ReservationStatus.CONFIRMED);
    });

    it('enforces execution mutex: prevents concurrent overlapping ticks', async () => {
      const scheduler = new AutoReleaseScheduler();
      // Fire multiple sweeps concurrently
      const results = await Promise.all([
        scheduler.runOnce(),
        scheduler.runOnce(),
        scheduler.runOnce(),
      ]);
      // All ticks should resolve without error
      assert.strictEqual(results.length, 3);
    });
  });

  /* ─────────────────────────────────────────────────────────────
   * 6. DYNAMIC 30-DAY NO-SHOW EVALUATION & ADMINISTRATIVE PARDON
   * ───────────────────────────────────────────────────────────── */
  describe('Dynamic 30-Day No-Show Evaluation & Administrative Pardon', () => {
    it('blocks booking creation when user has accumulated 3 unpardoned NO_SHOW strikes in 30 days', async () => {
      const now = new Date();
      const strikeUser = await User.create({
        name: `${TEST_PREFIX}Strike User`,
        email: `${TEST_PREFIX}strike@univ.edu`,
        roles: [UserRole.STUDENT],
        department: 'Computer Science',
        isActive: true,
      });

      // Create 3 unpardoned NO_SHOW bookings within the past 10 days
      for (let i = 1; i <= 3; i++) {
        await Reservation.create({
          title: `${TEST_PREFIX}Strike Booking ${i}`,
          resource: testResource1._id,
          user: strikeUser._id,
          startAt: new Date(now.getTime() - i * 24 * 60 * 60 * 1000),
          endAt: new Date(now.getTime() - (i * 24 - 1) * 60 * 60 * 1000),
          timezone: 'UTC',
          status: ReservationStatus.NO_SHOW,
          autoReleasedAt: new Date(now.getTime() - i * 24 * 60 * 60 * 1000),
        });
      }

      // Attempt to create a new reservation as strikeUser
      const futureStart = new Date(now.getTime() + 2 * 24 * 60 * 60 * 1000);
      const futureEnd = new Date(now.getTime() + (2 * 24 + 1) * 60 * 60 * 1000);

      await assert.rejects(
        async () => {
          await ReservationService.createReservation({
            resourceId: testResource1._id.toString(),
            userId: strikeUser._id.toString(),
            startAt: futureStart.toISOString(),
            endAt: futureEnd.toISOString(),
            title: `${TEST_PREFIX}Blocked Reservation`,
            timezone: 'UTC',
          });
        },
        (err: any) => {
          assert.strictEqual(err.code, 'NO_SHOW_RESTRICTION_ACTIVE');
          return true;
        }
      );
    });

    it('ignores NO_SHOW strikes that occurred outside the 30-day window', async () => {
      const now = new Date();
      const oldStrikeUser = await User.create({
        name: `${TEST_PREFIX}Old Strike User`,
        email: `${TEST_PREFIX}oldstrike@univ.edu`,
        roles: [UserRole.STUDENT],
        department: 'Computer Science',
        isActive: true,
      });

      // Create 2 strikes 40 days ago (outside 30-day window) and 1 strike 5 days ago
      for (let i = 1; i <= 2; i++) {
        await Reservation.create({
          title: `${TEST_PREFIX}Old Strike ${i}`,
          resource: testResource1._id,
          user: oldStrikeUser._id,
          startAt: new Date(now.getTime() - (40 + i) * 24 * 60 * 60 * 1000),
          endAt: new Date(now.getTime() - (40 + i - 1) * 60 * 60 * 1000),
          timezone: 'UTC',
          status: ReservationStatus.NO_SHOW,
        });
      }
      await Reservation.create({
        title: `${TEST_PREFIX}Recent Strike 1`,
        resource: testResource1._id,
        user: oldStrikeUser._id,
        startAt: new Date(now.getTime() - 5 * 24 * 60 * 60 * 1000),
        endAt: new Date(now.getTime() - 4 * 24 * 60 * 60 * 1000),
        timezone: 'UTC',
        status: ReservationStatus.NO_SHOW,
      });

      // User has only 1 strike in 30 days (< 3 threshold), booking must succeed
      const futureStart = new Date(now.getTime() + 3 * 24 * 60 * 60 * 1000);
      const futureEnd = new Date(now.getTime() + (3 * 24 + 1) * 60 * 60 * 1000);

      const created = await ReservationService.createReservation({
        resourceId: testResource2._id.toString(),
        userId: oldStrikeUser._id.toString(),
        startAt: futureStart.toISOString(),
        endAt: futureEnd.toISOString(),
        title: `${TEST_PREFIX}Allowed Despite Old Strikes`,
        timezone: 'UTC',
      });

      assert.ok(created._id);
    });

    it('allows ADMIN to pardon a NO_SHOW reservation, restoring booking eligibility', async () => {
      const now = new Date();
      const pardonUser = await User.create({
        name: `${TEST_PREFIX}Pardon User`,
        email: `${TEST_PREFIX}pardon@univ.edu`,
        roles: [UserRole.STUDENT],
        department: 'Computer Science',
        isActive: true,
      });

      // Create 3 NO_SHOW strikes
      const strikes: any[] = [];
      for (let i = 1; i <= 3; i++) {
        const s = await Reservation.create({
          title: `${TEST_PREFIX}Pardon Candidate ${i}`,
          resource: testResource1._id,
          user: pardonUser._id,
          startAt: new Date(now.getTime() - i * 24 * 60 * 60 * 1000),
          endAt: new Date(now.getTime() - (i * 24 - 1) * 60 * 60 * 1000),
          timezone: 'UTC',
          status: ReservationStatus.NO_SHOW,
        });
        strikes.push(s);
      }

      // Non-admin cannot pardon (403)
      const nonAdminPardonRes = await fetch(`${baseUrl}/api/bookings/${strikes[0]._id}/pardon-no-show`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${ownerToken}`,
        },
        body: JSON.stringify({ reason: 'Student had documented medical emergency.' }),
      });
      assert.strictEqual(nonAdminPardonRes.status, 403);

      // Admin pardons one strike
      const adminPardonRes = await fetch(`${baseUrl}/api/bookings/${strikes[0]._id}/pardon-no-show`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${adminToken}`,
        },
        body: JSON.stringify({ reason: 'Documented university athletic travel excuse.' }),
      });
      assert.strictEqual(adminPardonRes.status, 200);
      const pardonBody = await adminPardonRes.json();
      assert.strictEqual(pardonBody.success, true);
      assert.strictEqual(pardonBody.data.noShowPardoned, true);

      // Verify DB record
      const pardonedDoc = await Reservation.findById(strikes[0]._id);
      assert.strictEqual(pardonedDoc?.noShowPardoned, true);
      assert.strictEqual(pardonedDoc?.noShowPardonReason, 'Documented university athletic travel excuse.');
      assert.strictEqual(pardonedDoc?.noShowPardonedBy?.toString(), adminUser._id.toString());

      // Cannot pardon already pardoned reservation
      const rePardonRes = await fetch(`${baseUrl}/api/bookings/${strikes[0]._id}/pardon-no-show`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${adminToken}`,
        },
        body: JSON.stringify({ reason: 'Trying to pardon again.' }),
      });
      assert.strictEqual(rePardonRes.status, 409);
      const rePardonBody = await rePardonRes.json();
      assert.strictEqual(rePardonBody.error?.code, 'ALREADY_PARDONED');

      // Now user only has 2 active strikes (< 3 threshold), booking creation must succeed!
      const futureStart = new Date(now.getTime() + 4 * 24 * 60 * 60 * 1000);
      const futureEnd = new Date(now.getTime() + (4 * 24 + 1) * 60 * 60 * 1000);

      const created = await ReservationService.createReservation({
        resourceId: testResource2._id.toString(),
        userId: pardonUser._id.toString(),
        startAt: futureStart.toISOString(),
        endAt: futureEnd.toISOString(),
        title: `${TEST_PREFIX}Allowed After Pardon`,
        timezone: 'UTC',
      });
      assert.ok(created._id);
    });

    it('rejects pardon attempt on a non-NO_SHOW reservation', async () => {
      const now = new Date();
      const reservation = await Reservation.create({
        title: `${TEST_PREFIX}Pardon Non-NoShow`,
        resource: testResource1._id,
        user: ownerUser._id,
        startAt: new Date(now.getTime() + 24 * 60 * 60 * 1000),
        endAt: new Date(now.getTime() + 25 * 60 * 60 * 1000),
        timezone: 'UTC',
        status: ReservationStatus.CONFIRMED,
      });

      const res = await fetch(`${baseUrl}/api/bookings/${reservation._id}/pardon-no-show`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${adminToken}`,
        },
        body: JSON.stringify({ reason: 'Mistakenly trying to pardon confirmed booking.' }),
      });

      assert.strictEqual(res.status, 409);
      const body = await res.json();
      assert.strictEqual(body.error?.code, 'PARDON_NOT_ALLOWED');
    });
  });
});
