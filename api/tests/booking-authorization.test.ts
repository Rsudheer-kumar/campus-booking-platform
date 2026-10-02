/**
 * CampusFlow API - Phase 2.6D Booking Domain Authorization & RBAC Integration Tests
 *
 * Verifies that booking operations enforce:
 * - Authentication (401 for unauthenticated)
 * - Ownership (403 for unauthorized access to other users' bookings)
 * - Role-based authorization (403 for insufficient permissions)
 * - Identity forgery protection (body.userId cannot override authenticated identity)
 * - DEPARTMENT_HEAD on-behalf booking with same-department restriction
 * - Privileged access patterns (ADMIN, FACILITY_MANAGER visibility)
 *
 * TEST ISOLATION:
 * Uses isolated test database (campusflow_test), creates deterministic test users and resources.
 */

import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import type { Server } from 'http';
import type { AddressInfo } from 'net';
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
  ResourceStatus,
  AvailabilityRule,
  DayOfWeek,
  Reservation,
} from '../src/models';
import { signAccessToken } from '../src/utils/jwt';
import { zonedTimeToUtc } from '../src/utils/timezone';

interface TestApiResponse {
  success: boolean;
  data?: unknown;
  error?: {
    code: string;
    message: string;
  };
}

describe('Phase 2.6D - Booking Domain Authorization & RBAC Integration', () => {
  let server: Server;
  let baseUrl: string;

  const TEST_PREFIX = 'test_p26d_';
  let studentUser: any;
  let facultyUser: any;
  let staffUser: any;
  let adminUser: any;
  let facilityManagerUser: any;
  let departmentHeadUser: any;
  let custodianUser: any;
  let sharedResourceType: any;
  let sharedResource: any;
  let availabilityRule: any;

  const createdUserIds: string[] = [];
  const createdResourceIds: string[] = [];

  const defaultTz = 'America/New_York';

  // Helper to generate future booking dates on weekdays within operating hours
  function getFutureBookingSlot(slotIndex: number = 0, _dummy?: number): { startAt: string; endAt: string } {
    const weekdays = [
      '2026-10-19', '2026-10-20', '2026-10-21', '2026-10-22', '2026-10-23',
      '2026-10-26', '2026-10-27', '2026-10-28', '2026-10-29', '2026-10-30',
      '2026-11-02', '2026-11-03', '2026-11-04', '2026-11-05', '2026-11-06',
      '2026-11-09', '2026-11-10', '2026-11-11', '2026-11-12', '2026-11-13',
      '2026-11-16', '2026-11-17', '2026-11-18', '2026-11-19', '2026-11-20',
      '2026-11-23', '2026-11-24', '2026-11-25', '2026-11-26', '2026-11-27',
    ];
    const dateStr = weekdays[slotIndex % weekdays.length];
    const hour = 10 + (Math.floor(slotIndex / weekdays.length) % 5);
    const startHourStr = `${String(hour).padStart(2, '0')}:00`;
    const endHourStr = `${String(hour + 1).padStart(2, '0')}:00`;
    return {
      startAt: zonedTimeToUtc(dateStr, startHourStr, defaultTz).toISOString(),
      endAt: zonedTimeToUtc(dateStr, endHourStr, defaultTz).toISOString(),
    };
  }

  before(async () => {
    // 1. Connect to isolated test database
    await connectDatabase(env.MONGODB_TEST_URI);
    assert.strictEqual(isDatabaseConnected(), true);
    assert.strictEqual(mongoose.connection.db?.databaseName, 'campusflow_test');

    // 2. Synchronize indexes
    await Promise.all([Reservation.syncIndexes(), Resource.syncIndexes(), User.syncIndexes()]);

    // 3. Clean up previous test artifacts
    await Promise.all([
      Reservation.deleteMany({ title: new RegExp(`^${TEST_PREFIX}`, 'i') }),
      Resource.deleteMany({ code: new RegExp(`^${TEST_PREFIX}`, 'i') }),
      ResourceType.deleteMany({ code: new RegExp(`^${TEST_PREFIX}`, 'i') }),
      AvailabilityRule.deleteMany({ name: new RegExp(`^${TEST_PREFIX}`, 'i') }),
      User.deleteMany({ email: new RegExp(`^${TEST_PREFIX}`, 'i') }),
    ]);

    // 4. Create test users with different roles
    studentUser = await User.create({
      name: 'Test Student',
      email: `${TEST_PREFIX}student@example.com`,
      roles: [UserRole.STUDENT],
      isActive: true,
      tokenVersion: 0,
      department: 'Computer Science',
    });
    createdUserIds.push(studentUser._id.toString());

    facultyUser = await User.create({
      name: 'Test Faculty',
      email: `${TEST_PREFIX}faculty@example.com`,
      roles: [UserRole.FACULTY],
      isActive: true,
      tokenVersion: 0,
      department: 'Computer Science',
    });
    createdUserIds.push(facultyUser._id.toString());

    staffUser = await User.create({
      name: 'Test Staff',
      email: `${TEST_PREFIX}staff@example.com`,
      roles: [UserRole.STAFF],
      isActive: true,
      tokenVersion: 0,
      department: 'Administration',
    });
    createdUserIds.push(staffUser._id.toString());

    adminUser = await User.create({
      name: 'Test Admin',
      email: `${TEST_PREFIX}admin@example.com`,
      roles: [UserRole.ADMIN],
      isActive: true,
      tokenVersion: 0,
      department: 'Administration',
    });
    createdUserIds.push(adminUser._id.toString());

    facilityManagerUser = await User.create({
      name: 'Test Facility Manager',
      email: `${TEST_PREFIX}facility-manager@example.com`,
      roles: [UserRole.FACILITY_MANAGER],
      isActive: true,
      tokenVersion: 0,
      department: 'Facilities',
    });
    createdUserIds.push(facilityManagerUser._id.toString());

    departmentHeadUser = await User.create({
      name: 'Test Department Head',
      email: `${TEST_PREFIX}dept-head@example.com`,
      roles: [UserRole.DEPARTMENT_HEAD],
      isActive: true,
      tokenVersion: 0,
      department: 'Computer Science',
    });
    createdUserIds.push(departmentHeadUser._id.toString());

    custodianUser = await User.create({
      name: 'Test Custodian',
      email: `${TEST_PREFIX}custodian@example.com`,
      roles: [UserRole.CUSTODIAN],
      isActive: true,
      tokenVersion: 0,
      department: 'Facilities',
    });
    createdUserIds.push(custodianUser._id.toString());

    // 5. Create resource type and resource
    sharedResourceType = await ResourceType.create({
      code: `${TEST_PREFIX}CLASSROOM`,
      name: 'Test Classroom',
      category: ResourceCategory.SPACE,
    });

    sharedResource = await Resource.create({
      name: 'Test Room 101',
      code: `${TEST_PREFIX}ROOM101`,
      resourceType: sharedResourceType._id,
      capacity: 30,
      location: {
        building: 'Science Hall',
        floor: '1',
        roomNumber: '101',
      },
      status: ResourceStatus.ACTIVE,
      isActive: true,
    });
    createdResourceIds.push(sharedResource._id.toString());

    // 6. Create availability rule (8am-8pm, Mon-Fri)
    availabilityRule = await AvailabilityRule.create({
      name: `${TEST_PREFIX}Standard Hours`,
      resource: sharedResource._id,
      timezone: defaultTz,
      windows: [
        { dayOfWeek: DayOfWeek.MONDAY, startTime: '08:00', endTime: '20:00' },
        { dayOfWeek: DayOfWeek.TUESDAY, startTime: '08:00', endTime: '20:00' },
        { dayOfWeek: DayOfWeek.WEDNESDAY, startTime: '08:00', endTime: '20:00' },
        { dayOfWeek: DayOfWeek.THURSDAY, startTime: '08:00', endTime: '20:00' },
        { dayOfWeek: DayOfWeek.FRIDAY, startTime: '08:00', endTime: '20:00' },
      ],
      bookingPolicy: {
        minDurationMinutes: 30,
        maxDurationMinutes: 480,
        minLeadTimeMinutes: 0,
        maxAdvanceBookingDays: 365,
      },
      isActive: true,
    });

    // 7. Start app server
    await new Promise<void>((resolve) => {
      server = app.listen(0, () => {
        const address = server.address() as AddressInfo;
        baseUrl = `http://127.0.0.1:${address.port}`;
        resolve();
      });
    });
  });

  after(async () => {
    // Shut down server
    await new Promise<void>((resolve) => server.close(() => resolve()));

    // Clean up DB
    if (isDatabaseConnected()) {
      if (createdUserIds.length > 0) {
        await User.deleteMany({ _id: { $in: createdUserIds } });
      }
      if (createdResourceIds.length > 0) {
        await Resource.deleteMany({ _id: { $in: createdResourceIds } });
      }
      await disconnectDatabase();
    }
  });

  describe('A. Authentication', () => {
    it('A01 unauthenticated POST /bookings -> 401', async () => {
      const res = await fetch(`${baseUrl}/api/bookings`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          resourceId: sharedResource._id.toString(),
          userId: studentUser._id.toString(),
          startAt: getFutureBookingSlot(7, 8).startAt,
          endAt: getFutureBookingSlot(7, 8).endAt,
          timezone: defaultTz,
          title: `${TEST_PREFIX}Meeting`,
        }),
      });
      assert.strictEqual(res.status, 401);
      const body = (await res.json()) as TestApiResponse;
      assert.strictEqual(body.error?.code, 'UNAUTHORIZED');
    });

    it('A02 unauthenticated GET /bookings -> 401', async () => {
      const res = await fetch(`${baseUrl}/api/bookings`);
      assert.strictEqual(res.status, 401);
    });

    it('A03 unauthenticated GET /bookings/:id -> 401', async () => {
      const res = await fetch(`${baseUrl}/api/bookings/507f1f77bcf86cd799439011`);
      assert.strictEqual(res.status, 401);
    });

    it('A04 unauthenticated POST /bookings/:id/cancel -> 401', async () => {
      const res = await fetch(`${baseUrl}/api/bookings/507f1f77bcf86cd799439011/cancel`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ reason: 'Testing' }),
      });
      assert.strictEqual(res.status, 401);
    });

    it('A05 unauthenticated POST /bookings/:id/transition -> 401', async () => {
      const res = await fetch(`${baseUrl}/api/bookings/507f1f77bcf86cd799439011/transition`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: 'COMPLETED' }),
      });
      assert.strictEqual(res.status, 401);
    });

    it('A06 unauthenticated GET /bookings/availability -> 400 (no auth required, validation fails)', async () => {
      const res = await fetch(`${baseUrl}/api/bookings/availability`);
      assert.strictEqual(res.status, 400);
    });

    it('A07 unauthenticated GET /bookings/slots -> 400 (no auth required, validation fails)', async () => {
      const res = await fetch(`${baseUrl}/api/bookings/slots`);
      assert.strictEqual(res.status, 400);
    });
  });

  describe('B. Ownership & Self-Booking', () => {
    let studentBookingId: string;
    let facultyBookingId: string;

    it('B01 authenticated student can create own booking', async () => {
      const token = signAccessToken({
        sub: studentUser._id.toString(),
        email: studentUser.email,
        roles: studentUser.roles,
        isActive: true,
        tokenVersion: studentUser.tokenVersion,
      });

      const res = await fetch(`${baseUrl}/api/bookings`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          resourceId: sharedResource._id.toString(),
          startAt: getFutureBookingSlot(7, 8).startAt,
          endAt: getFutureBookingSlot(7, 8).endAt,
          timezone: defaultTz,
          title: `${TEST_PREFIX}Student Booking`,
        }),
      });

      const responseBody = (await res.json()) as TestApiResponse;
      assert.strictEqual(res.status, 201);
      assert.strictEqual(responseBody.success, true);
      studentBookingId = (responseBody.data as any)._id;
    });

    it('B02 authenticated faculty can create own booking', async () => {
      const token = signAccessToken({
        sub: facultyUser._id.toString(),
        email: facultyUser.email,
        roles: facultyUser.roles,
        isActive: true,
        tokenVersion: facultyUser.tokenVersion,
      });

      const res = await fetch(`${baseUrl}/api/bookings`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          resourceId: sharedResource._id.toString(),
          startAt: getFutureBookingSlot(8, 8).startAt,
          endAt: getFutureBookingSlot(8, 8).endAt,
          timezone: defaultTz,
          title: `${TEST_PREFIX}Faculty Booking`,
        }),
      });
      assert.strictEqual(res.status, 201);
      const body = (await res.json()) as TestApiResponse;
      facultyBookingId = (body.data as any)._id;
    });

    it('B03 student cannot view faculty booking -> 403', async () => {
      const token = signAccessToken({
        sub: studentUser._id.toString(),
        email: studentUser.email,
        roles: studentUser.roles,
        isActive: true,
        tokenVersion: studentUser.tokenVersion,
      });

      const res = await fetch(`${baseUrl}/api/bookings/${facultyBookingId}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      assert.strictEqual(res.status, 403);
      const body = (await res.json()) as TestApiResponse;
      assert.strictEqual(body.error?.code, 'FORBIDDEN');
    });

    it('B04 student can view own booking', async () => {
      const token = signAccessToken({
        sub: studentUser._id.toString(),
        email: studentUser.email,
        roles: studentUser.roles,
        isActive: true,
        tokenVersion: studentUser.tokenVersion,
      });

      const res = await fetch(`${baseUrl}/api/bookings/${studentBookingId}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      assert.strictEqual(res.status, 200);
      const body = (await res.json()) as TestApiResponse;
      assert.strictEqual(body.success, true);
    });

    it('B05 student cannot cancel faculty booking -> 403', async () => {
      const token = signAccessToken({
        sub: studentUser._id.toString(),
        email: studentUser.email,
        roles: studentUser.roles,
        isActive: true,
        tokenVersion: studentUser.tokenVersion,
      });

      const res = await fetch(`${baseUrl}/api/bookings/${facultyBookingId}/cancel`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ reason: 'Testing' }),
      });
      assert.strictEqual(res.status, 403);
    });

    it('B06 student can cancel own booking', async () => {
      const token = signAccessToken({
        sub: studentUser._id.toString(),
        email: studentUser.email,
        roles: studentUser.roles,
        isActive: true,
        tokenVersion: studentUser.tokenVersion,
      });

      const res = await fetch(`${baseUrl}/api/bookings/${studentBookingId}/cancel`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ reason: 'Changed plans' }),
      });
      assert.strictEqual(res.status, 200);
    });
  });

  describe('C. Role Authorization for Transitions', () => {
    let bookingId: string;

    it('C01 create test booking', async () => {
      const token = signAccessToken({
        sub: studentUser._id.toString(),
        email: studentUser.email,
        roles: studentUser.roles,
        isActive: true,
        tokenVersion: studentUser.tokenVersion,
      });

      const res = await fetch(`${baseUrl}/api/bookings`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          resourceId: sharedResource._id.toString(),
          startAt: getFutureBookingSlot(9, 8).startAt,
          endAt: getFutureBookingSlot(9, 8).endAt,
          timezone: defaultTz,
          title: `${TEST_PREFIX}Transition Test`,
        }),
      });
      const body = (await res.json()) as TestApiResponse;
      bookingId = (body.data as any)._id;
    });

    it('C02 student cannot transition to COMPLETED -> 403', async () => {
      const token = signAccessToken({
        sub: studentUser._id.toString(),
        email: studentUser.email,
        roles: studentUser.roles,
        isActive: true,
        tokenVersion: studentUser.tokenVersion,
      });

      const res = await fetch(`${baseUrl}/api/bookings/${bookingId}/transition`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ status: 'COMPLETED' }),
      });
      assert.strictEqual(res.status, 403);
    });

    it('C03 FACILITY_MANAGER can transition to COMPLETED', async () => {
      const token = signAccessToken({
        sub: facilityManagerUser._id.toString(),
        email: facilityManagerUser.email,
        roles: facilityManagerUser.roles,
        isActive: true,
        tokenVersion: facilityManagerUser.tokenVersion,
      });

      const res = await fetch(`${baseUrl}/api/bookings/${bookingId}/transition`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ status: 'COMPLETED' }),
      });
      assert.strictEqual(res.status, 200);
    });

    it('C04 ADMIN can transition bookings', async () => {
      // Create another booking to test ADMIN transition
      const token = signAccessToken({
        sub: studentUser._id.toString(),
        email: studentUser.email,
        roles: studentUser.roles,
        isActive: true,
        tokenVersion: studentUser.tokenVersion,
      });

      const createRes = await fetch(`${baseUrl}/api/bookings`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          resourceId: sharedResource._id.toString(),
          startAt: getFutureBookingSlot(10, 8).startAt,
          endAt: getFutureBookingSlot(10, 8).endAt,
          timezone: defaultTz,
          title: `${TEST_PREFIX}Admin Transition Test`,
        }),
      });
      const createBody = (await createRes.json()) as TestApiResponse;
      const testBookingId = (createBody.data as any)._id;

      const adminToken = signAccessToken({
        sub: adminUser._id.toString(),
        email: adminUser.email,
        roles: adminUser.roles,
        isActive: true,
        tokenVersion: adminUser.tokenVersion,
      });

      const res = await fetch(`${baseUrl}/api/bookings/${testBookingId}/transition`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${adminToken}`,
        },
        body: JSON.stringify({ status: 'CHECKED_IN' }),
      });
      assert.strictEqual(res.status, 200);
    });

    it('C05 CUSTODIAN can transition bookings', async () => {
      // Create another booking to test CUSTODIAN transition
      const token = signAccessToken({
        sub: studentUser._id.toString(),
        email: studentUser.email,
        roles: studentUser.roles,
        isActive: true,
        tokenVersion: studentUser.tokenVersion,
      });

      const createRes = await fetch(`${baseUrl}/api/bookings`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          resourceId: sharedResource._id.toString(),
          startAt: getFutureBookingSlot(11, 8).startAt,
          endAt: getFutureBookingSlot(11, 8).endAt,
          timezone: defaultTz,
          title: `${TEST_PREFIX}Custodian Transition Test`,
        }),
      });
      const createBody = (await createRes.json()) as TestApiResponse;
      const testBookingId = (createBody.data as any)._id;

      const custodianToken = signAccessToken({
        sub: custodianUser._id.toString(),
        email: custodianUser.email,
        roles: custodianUser.roles,
        isActive: true,
        tokenVersion: custodianUser.tokenVersion,
      });

      const res = await fetch(`${baseUrl}/api/bookings/${testBookingId}/transition`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${custodianToken}`,
        },
        body: JSON.stringify({ status: 'CHECKED_IN' }),
      });
      assert.strictEqual(res.status, 200);
    });
  });

  describe('D. Identity Forgery Protection', () => {
    it('D01 body.userId cannot override authenticated identity on create', async () => {
      const token = signAccessToken({
        sub: studentUser._id.toString(),
        email: studentUser.email,
        roles: studentUser.roles,
        isActive: true,
        tokenVersion: studentUser.tokenVersion,
      });

      // Try to book as facultyUser by passing userId in body (unauthorized identity forgery attempt)
      const res = await fetch(`${baseUrl}/api/bookings`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          resourceId: sharedResource._id.toString(),
          userId: facultyUser._id.toString(), // Attempt to forge identity
          startAt: getFutureBookingSlot(12, 8).startAt,
          endAt: getFutureBookingSlot(12, 8).endAt,
          timezone: defaultTz,
          title: `${TEST_PREFIX}Forgery Test`,
        }),
      });

      // Must be rejected with 403 Forbidden - non-DEPARTMENT_HEAD cannot override identity
      assert.strictEqual(res.status, 403);
      const body = (await res.json()) as TestApiResponse;
      assert.strictEqual(body.success, false);
      assert.strictEqual(body.error?.code, 'FORBIDDEN');
    });

    it('D02 query.userId cannot change list filtering for normal users', async () => {
      const token = signAccessToken({
        sub: studentUser._id.toString(),
        email: studentUser.email,
        roles: studentUser.roles,
        isActive: true,
        tokenVersion: studentUser.tokenVersion,
      });

      // Try to list faculty bookings by passing query.userId
      const res = await fetch(
        `${baseUrl}/api/bookings?userId=${facultyUser._id.toString()}`,
        {
          headers: { Authorization: `Bearer ${token}` },
        }
      );

      assert.strictEqual(res.status, 200);
      const body = (await res.json()) as TestApiResponse;
      const items = (body.data as any).items || [];

      // All returned items should be student's, not faculty's
      for (const item of items) {
        const userId = item.user._id || item.user;
        assert.strictEqual(
          userId,
          studentUser._id.toString(),
          'Student should only see their own bookings, not faculty'
        );
      }
    });

    it('D03 params userId cannot change accessed booking', async () => {
      // Create a faculty booking first
      const facultyToken = signAccessToken({
        sub: facultyUser._id.toString(),
        email: facultyUser.email,
        roles: facultyUser.roles,
        isActive: true,
        tokenVersion: facultyUser.tokenVersion,
      });

      const createRes = await fetch(`${baseUrl}/api/bookings`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${facultyToken}`,
        },
        body: JSON.stringify({
          resourceId: sharedResource._id.toString(),
          startAt: getFutureBookingSlot(13, 8).startAt,
          endAt: getFutureBookingSlot(13, 8).endAt,
          timezone: defaultTz,
          title: `${TEST_PREFIX}Faculty Test`,
        }),
      });
      const createBody = (await createRes.json()) as TestApiResponse;
      const facultyBookingId = (createBody.data as any)._id;

      // Try to access as student
      const studentToken = signAccessToken({
        sub: studentUser._id.toString(),
        email: studentUser.email,
        roles: studentUser.roles,
        isActive: true,
        tokenVersion: studentUser.tokenVersion,
      });

      const res = await fetch(`${baseUrl}/api/bookings/${facultyBookingId}`, {
        headers: { Authorization: `Bearer ${studentToken}` },
      });

      assert.strictEqual(res.status, 403, 'Student should not access faculty booking');
    });
  });

  describe('E. DEPARTMENT_HEAD On-Behalf Booking', () => {
    it('E01 DEPARTMENT_HEAD can book on behalf of same-department user', async () => {
      const token = signAccessToken({
        sub: departmentHeadUser._id.toString(),
        email: departmentHeadUser.email,
        roles: departmentHeadUser.roles,
        isActive: true,
        tokenVersion: departmentHeadUser.tokenVersion,
      });

      const res = await fetch(`${baseUrl}/api/bookings`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          resourceId: sharedResource._id.toString(),
          userId: studentUser._id.toString(), // Same department
          startAt: getFutureBookingSlot(14, 8).startAt,
          endAt: getFutureBookingSlot(14, 8).endAt,
          timezone: defaultTz,
          title: `${TEST_PREFIX}DeptHead On-Behalf`,
        }),
      });

      assert.strictEqual(res.status, 201);
      const body = (await res.json()) as TestApiResponse;
      const booking = body.data as any;
      assert.strictEqual(
        booking.user._id || booking.user,
        studentUser._id.toString(),
        'Booking should be for target student'
      );
    });

    it('E02 DEPARTMENT_HEAD cannot book on behalf of cross-department user -> 403', async () => {
      const token = signAccessToken({
        sub: departmentHeadUser._id.toString(),
        email: departmentHeadUser.email,
        roles: departmentHeadUser.roles,
        isActive: true,
        tokenVersion: departmentHeadUser.tokenVersion,
      });

      // staffUser is in Administration, not Computer Science
      const res = await fetch(`${baseUrl}/api/bookings`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          resourceId: sharedResource._id.toString(),
          userId: staffUser._id.toString(), // Cross-department
          startAt: getFutureBookingSlot(15, 8).startAt,
          endAt: getFutureBookingSlot(15, 8).endAt,
          timezone: defaultTz,
          title: `${TEST_PREFIX}Cross-Dept Attempt`,
        }),
      });

      assert.strictEqual(res.status, 403);
      const body = (await res.json()) as TestApiResponse;
      assert.match(
        body.error?.message || '',
        /same.?department/i,
        'Error should mention department restriction'
      );
    });

    it('E03 student cannot book on behalf of anyone -> 403', async () => {
      const token = signAccessToken({
        sub: studentUser._id.toString(),
        email: studentUser.email,
        roles: studentUser.roles,
        isActive: true,
        tokenVersion: studentUser.tokenVersion,
      });

      const res = await fetch(`${baseUrl}/api/bookings`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          resourceId: sharedResource._id.toString(),
          userId: facultyUser._id.toString(),
          startAt: getFutureBookingSlot(16, 8).startAt,
          endAt: getFutureBookingSlot(16, 8).endAt,
          timezone: defaultTz,
          title: `${TEST_PREFIX}Student On-Behalf`,
        }),
      });

      assert.strictEqual(res.status, 403);
      const body = (await res.json()) as TestApiResponse;
      assert.match(
        body.error?.message || '',
        /DEPARTMENT_HEAD/i,
        'Error should mention only DEPARTMENT_HEAD can book on behalf'
      );
    });
  });

  describe('F. Privileged Access Patterns', () => {
    let student1BookingId: string;
    let faculty1BookingId: string;

    before(async () => {
      // Create test bookings
      const studentToken = signAccessToken({
        sub: studentUser._id.toString(),
        email: studentUser.email,
        roles: studentUser.roles,
        isActive: true,
        tokenVersion: studentUser.tokenVersion,
      });

      const studentRes = await fetch(`${baseUrl}/api/bookings`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${studentToken}`,
        },
        body: JSON.stringify({
          resourceId: sharedResource._id.toString(),
          startAt: getFutureBookingSlot(17, 8).startAt,
          endAt: getFutureBookingSlot(17, 8).endAt,
          timezone: defaultTz,
          title: `${TEST_PREFIX}Priv Access Student`,
        }),
      });
      const studentBody = (await studentRes.json()) as TestApiResponse;
      student1BookingId = (studentBody.data as any)._id;

      const facultyToken = signAccessToken({
        sub: facultyUser._id.toString(),
        email: facultyUser.email,
        roles: facultyUser.roles,
        isActive: true,
        tokenVersion: facultyUser.tokenVersion,
      });

      const facultyRes = await fetch(`${baseUrl}/api/bookings`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${facultyToken}`,
        },
        body: JSON.stringify({
          resourceId: sharedResource._id.toString(),
          startAt: getFutureBookingSlot(18, 8).startAt,
          endAt: getFutureBookingSlot(18, 8).endAt,
          timezone: defaultTz,
          title: `${TEST_PREFIX}Priv Access Faculty`,
        }),
      });
      const facultyBody = (await facultyRes.json()) as TestApiResponse;
      faculty1BookingId = (facultyBody.data as any)._id;
    });

    it('F01 ADMIN can view any booking', async () => {
      const token = signAccessToken({
        sub: adminUser._id.toString(),
        email: adminUser.email,
        roles: adminUser.roles,
        isActive: true,
        tokenVersion: adminUser.tokenVersion,
      });

      const res = await fetch(`${baseUrl}/api/bookings/${student1BookingId}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      assert.strictEqual(res.status, 200);
    });

    it('F02 ADMIN can list all bookings', async () => {
      const token = signAccessToken({
        sub: adminUser._id.toString(),
        email: adminUser.email,
        roles: adminUser.roles,
        isActive: true,
        tokenVersion: adminUser.tokenVersion,
      });

      const res = await fetch(`${baseUrl}/api/bookings`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      assert.strictEqual(res.status, 200);
      const body = (await res.json()) as TestApiResponse;
      const items = (body.data as any).items || [];
      assert.ok(items.length > 0, 'ADMIN should see bookings');
    });

    it('F03 FACILITY_MANAGER can view any booking', async () => {
      const token = signAccessToken({
        sub: facilityManagerUser._id.toString(),
        email: facilityManagerUser.email,
        roles: facilityManagerUser.roles,
        isActive: true,
        tokenVersion: facilityManagerUser.tokenVersion,
      });

      const res = await fetch(`${baseUrl}/api/bookings/${faculty1BookingId}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      assert.strictEqual(res.status, 200);
    });

    it('F04 FACILITY_MANAGER can list all bookings', async () => {
      const token = signAccessToken({
        sub: facilityManagerUser._id.toString(),
        email: facilityManagerUser.email,
        roles: facilityManagerUser.roles,
        isActive: true,
        tokenVersion: facilityManagerUser.tokenVersion,
      });

      const res = await fetch(`${baseUrl}/api/bookings`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      assert.strictEqual(res.status, 200);
      const body = (await res.json()) as TestApiResponse;
      const items = (body.data as any).items || [];
      assert.ok(items.length > 0, 'FACILITY_MANAGER should see bookings');
    });

    it('F05 FACILITY_MANAGER can cancel any booking', async () => {
      const token = signAccessToken({
        sub: facilityManagerUser._id.toString(),
        email: facilityManagerUser.email,
        roles: facilityManagerUser.roles,
        isActive: true,
        tokenVersion: facilityManagerUser.tokenVersion,
      });

      // Create a booking to cancel
      const studentToken = signAccessToken({
        sub: studentUser._id.toString(),
        email: studentUser.email,
        roles: studentUser.roles,
        isActive: true,
        tokenVersion: studentUser.tokenVersion,
      });

      const createRes = await fetch(`${baseUrl}/api/bookings`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${studentToken}`,
        },
        body: JSON.stringify({
          resourceId: sharedResource._id.toString(),
          startAt: getFutureBookingSlot(19, 8).startAt,
          endAt: getFutureBookingSlot(19, 8).endAt,
          timezone: defaultTz,
          title: `${TEST_PREFIX}FM Cancel Test`,
        }),
      });
      const createBody = (await createRes.json()) as TestApiResponse;
      const bookingId = (createBody.data as any)._id;

      const cancelRes = await fetch(`${baseUrl}/api/bookings/${bookingId}/cancel`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ reason: 'FM cancellation' }),
      });
      assert.strictEqual(cancelRes.status, 200);
    });
  });

  describe('G. Public Endpoints Remain Public', () => {
    it('G01 GET /availability remains public', async () => {
      const res = await fetch(
        `${baseUrl}/api/bookings/availability?resourceId=${sharedResource._id}&startAt=2025-01-20T08:00:00Z&endAt=2025-01-20T09:00:00Z`
      );
      // Should not be 401; should be 200 if available or 400/409 if conflict
      assert.notStrictEqual(res.status, 401);
    });

    it('G02 GET /slots remains public', async () => {
      const res = await fetch(
        `${baseUrl}/api/bookings/slots?resourceId=${sharedResource._id}&date=2025-01-20&slotDurationMinutes=60`
      );
      // Should not be 401
      assert.notStrictEqual(res.status, 401);
    });
  });
});
