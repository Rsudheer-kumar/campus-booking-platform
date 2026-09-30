/**
 * CampusFlow API - Reservation Engine Integration Tests (Phase 2.5)
 * Comprehensive testing of:
 * 1. Reservation domain model, schema invariants, and lifecycle state machine
 * 2. Partial unique index preventing duplicate active reservations
 * 3. Authoritative half-open interval conflict detection (All 8 permutations)
 * 4. Availability calculation & discrete slot generation
 * 5. Blackout enforcement & boundary non-conflicts
 * 6. Multidimensional Quota enforcement across scopes, subjects, and timezones
 * 7. HTTP REST API endpoints (/api/bookings)
 *
 * TEST ISOLATION:
 * Operates strictly on the dedicated, isolated test database (`campusflow_test`).
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
  Blackout,
  BlackoutCategory,
  Quota,
  QuotaScopeType,
  QuotaSubjectType,
  QuotaMetric,
  QuotaPeriod,
  Reservation,
  ReservationStatus,
  isValidReservationTransition,
  type UserDocument,
  type ResourceTypeDocument,
  type ResourceDocument,
  type BlackoutDocument,
  type ReservationDocument,
} from '../src/models';
import { zonedTimeToUtc } from '../src/utils/timezone';
import { AvailabilityService } from '../src/services/availability.service';
import { QuotaService } from '../src/services/quota.service';

interface TestApiResponse {
  success: boolean;
  data?: {
    _id?: string;
    status?: string;
    resource?: unknown;
    user?: unknown;
    items?: unknown[];
    total?: number;
    checkInAt?: string;
    cancelledAt?: string;
    available?: boolean;
    slots?: unknown[];
  };
  error?: {
    code: string;
    message: string;
  };
}

describe('CampusFlow Reservation & Booking Engine Integration Tests (Phase 2.5)', () => {
  let server: Server;
  let baseUrl: string;

  const TEST_PREFIX = 'TEST_PHASE25_';
  let sharedUser: UserDocument;
  let sharedResourceType: ResourceTypeDocument;
  let sharedResource: ResourceDocument;

  const defaultTz = 'America/New_York';

  before(async () => {
    // 1. Connect to isolated test database
    await connectDatabase(env.MONGODB_TEST_URI);
    assert.strictEqual(isDatabaseConnected(), true);
    assert.strictEqual(mongoose.connection.db?.databaseName, 'campusflow_test');

    // 2. Synchronize indexes for Reservation
    await Reservation.syncIndexes();

    // 3. Clean up any previous test artifacts
    await Promise.all([
      Reservation.deleteMany({ title: new RegExp(`^${TEST_PREFIX}`, 'i') }),
      AvailabilityRule.deleteMany({ name: new RegExp(`^${TEST_PREFIX}`, 'i') }),
      Blackout.deleteMany({ reason: new RegExp(`^${TEST_PREFIX}`, 'i') }),
      Quota.deleteMany({ name: new RegExp(`^${TEST_PREFIX}`, 'i') }),
      Resource.deleteMany({ code: new RegExp(`^${TEST_PREFIX}`, 'i') }),
      ResourceType.deleteMany({ code: new RegExp(`^${TEST_PREFIX}`, 'i') }),
      User.deleteMany({ email: new RegExp(`^${TEST_PREFIX}`, 'i') }),
    ]);

    // 4. Seed shared foundational entities
    sharedResourceType = await ResourceType.create({
      name: `${TEST_PREFIX}Laboratory Space`,
      code: `${TEST_PREFIX}LAB`,
      category: ResourceCategory.LABORATORY,
      isActive: true,
    });

    sharedUser = await User.create({
      name: `${TEST_PREFIX}Alice Researcher`,
      email: `${TEST_PREFIX}alice@university.edu`,
      roles: [UserRole.FACULTY],
      department: 'Electrical & Computer Engineering',
      isActive: true,
    });

    sharedResource = await Resource.create({
      name: `${TEST_PREFIX}Robotics Workstation A`,
      code: `${TEST_PREFIX}ROBOT-01`,
      resourceType: sharedResourceType._id,
      capacity: 4,
      status: ResourceStatus.ACTIVE,
      isActive: true,
      location: {
        building: 'Engineering Hall',
        floor: '3rd Floor',
        room: 'Lab 305',
      },
    });

    // Mon - Fri: 08:00 - 20:00 (America/New_York)
    await AvailabilityRule.create({
      resource: sharedResource._id,
      timezone: defaultTz,
      name: `${TEST_PREFIX}Standard Lab Hours`,
      windows: [
        { dayOfWeek: DayOfWeek.MONDAY, startTime: '08:00', endTime: '20:00' },
        { dayOfWeek: DayOfWeek.TUESDAY, startTime: '08:00', endTime: '20:00' },
        { dayOfWeek: DayOfWeek.WEDNESDAY, startTime: '08:00', endTime: '20:00' },
        { dayOfWeek: DayOfWeek.THURSDAY, startTime: '08:00', endTime: '20:00' },
        { dayOfWeek: DayOfWeek.FRIDAY, startTime: '08:00', endTime: '20:00' },
      ],
      bookingPolicy: {
        minDurationMinutes: 30,
        maxDurationMinutes: 240,
        minLeadTimeMinutes: 0,
        maxAdvanceBookingDays: 30,
      },
      isActive: true,
    });

    // 4. Start ephemeral test HTTP server
    await new Promise<void>((resolve) => {
      server = app.listen(0, () => {
        const address = server.address() as AddressInfo;
        baseUrl = `http://127.0.0.1:${address.port}`;
        resolve();
      });
    });
  });

  after(async () => {
    // Teardown test server
    if (server) {
      await new Promise<void>((resolve) => server.close(() => resolve()));
    }

    // Clean up created test entities
    await Promise.all([
      Reservation.deleteMany({ title: new RegExp(`^${TEST_PREFIX}`, 'i') }),
      AvailabilityRule.deleteMany({ name: new RegExp(`^${TEST_PREFIX}`, 'i') }),
      Blackout.deleteMany({ reason: new RegExp(`^${TEST_PREFIX}`, 'i') }),
      Quota.deleteMany({ name: new RegExp(`^${TEST_PREFIX}`, 'i') }),
      Resource.deleteMany({ code: new RegExp(`^${TEST_PREFIX}`, 'i') }),
      ResourceType.deleteMany({ code: new RegExp(`^${TEST_PREFIX}`, 'i') }),
      User.deleteMany({ email: new RegExp(`^${TEST_PREFIX}`, 'i') }),
    ]);

    await disconnectDatabase();
  });

  /* ========================================================================= */
  /* 1. RESERVATION MODEL & LIFECYCLE STATE MACHINE                            */
  /* ========================================================================= */
  describe('1. Reservation Domain Model & State Machine', () => {
    it('should create a valid reservation with default CONFIRMED status', async () => {
      const startAt = zonedTimeToUtc('2026-10-12', '10:00', defaultTz); // Monday
      const endAt = zonedTimeToUtc('2026-10-12', '11:00', defaultTz);

      const reservation = await Reservation.create({
        resource: sharedResource._id,
        user: sharedUser._id,
        startAt,
        endAt,
        timezone: defaultTz,
        title: `${TEST_PREFIX}Introductory Session`,
        description: 'First research team orientation',
      });

      assert.ok(reservation._id);
      assert.strictEqual(reservation.status, ReservationStatus.CONFIRMED);
      assert.strictEqual(reservation.timezone, defaultTz);
      assert.strictEqual(reservation.startAt.getTime(), startAt.getTime());
      assert.strictEqual(reservation.endAt.getTime(), endAt.getTime());

      // Clean up
      await Reservation.findByIdAndDelete(reservation._id);
    });

    it('should reject reservation where startAt >= endAt', async () => {
      const startAt = zonedTimeToUtc('2026-10-12', '11:00', defaultTz);
      const endAt = zonedTimeToUtc('2026-10-12', '10:00', defaultTz); // earlier than start

      await assert.rejects(
        async () => {
          await Reservation.create({
            resource: sharedResource._id,
            user: sharedUser._id,
            startAt,
            endAt,
            timezone: defaultTz,
            title: `${TEST_PREFIX}Invalid Interval`,
          });
        },
        /Reservation startAt must be earlier than endAt/
      );
    });

    it('should reject invalid IANA timezone identifiers', async () => {
      const startAt = new Date('2026-10-12T10:00:00Z');
      const endAt = new Date('2026-10-12T11:00:00Z');

      await assert.rejects(
        async () => {
          await Reservation.create({
            resource: sharedResource._id,
            user: sharedUser._id,
            startAt,
            endAt,
            timezone: 'EST', // Informal abbreviation, must be rejected
            title: `${TEST_PREFIX}Invalid TZ`,
          });
        },
        /Invalid IANA timezone identifier/
      );
    });

    it('should validate allowed and prohibited state transitions', () => {
      // Valid transitions
      assert.strictEqual(isValidReservationTransition(ReservationStatus.PENDING, ReservationStatus.CONFIRMED), true);
      assert.strictEqual(isValidReservationTransition(ReservationStatus.PENDING, ReservationStatus.REJECTED), true);
      assert.strictEqual(isValidReservationTransition(ReservationStatus.CONFIRMED, ReservationStatus.CHECKED_IN), true);
      assert.strictEqual(isValidReservationTransition(ReservationStatus.CONFIRMED, ReservationStatus.CANCELLED), true);
      assert.strictEqual(isValidReservationTransition(ReservationStatus.CHECKED_IN, ReservationStatus.COMPLETED), true);

      // Prohibited transitions
      assert.strictEqual(isValidReservationTransition(ReservationStatus.COMPLETED, ReservationStatus.CONFIRMED), false);
      assert.strictEqual(isValidReservationTransition(ReservationStatus.CANCELLED, ReservationStatus.CHECKED_IN), false);
      assert.strictEqual(isValidReservationTransition(ReservationStatus.REJECTED, ReservationStatus.CONFIRMED), false);
      assert.strictEqual(isValidReservationTransition(ReservationStatus.EXPIRED, ReservationStatus.CONFIRMED), false);
    });

    it('should enforce partial unique index preventing duplicate identical active reservations', async () => {
      const startAt = zonedTimeToUtc('2026-10-12', '13:00', defaultTz);
      const endAt = zonedTimeToUtc('2026-10-12', '14:00', defaultTz);

      const first = await Reservation.create({
        resource: sharedResource._id,
        user: sharedUser._id,
        startAt,
        endAt,
        timezone: defaultTz,
        status: ReservationStatus.CONFIRMED,
        title: `${TEST_PREFIX}First Active Slot`,
      });

      // Attempt to insert duplicate exact slot with active status
      await assert.rejects(
        async () => {
          await Reservation.create({
            resource: sharedResource._id,
            user: sharedUser._id,
            startAt,
            endAt,
            timezone: defaultTz,
            status: ReservationStatus.CONFIRMED,
            title: `${TEST_PREFIX}Duplicate Active Slot`,
          });
        },
        (err: unknown) => typeof err === 'object' && err !== null && (err as { code?: number }).code === 11000
      );

      // Clean up
      await Reservation.findByIdAndDelete(first._id);
    });
  });

  /* ========================================================================= */
  /* 2. AVAILABILITY CALCULATION & DISCRETE SLOT ENGINE                        */
  /* ========================================================================= */
  describe('2. Availability Calculation & Slot Generation', () => {
    it('should report available for valid slot within operating hours', async () => {
      const startAt = zonedTimeToUtc('2026-10-12', '10:00', defaultTz);
      const endAt = zonedTimeToUtc('2026-10-12', '11:30', defaultTz);

      const result = await AvailabilityService.checkAvailability({
        resourceId: sharedResource._id,
        startAt,
        endAt,
      });

      assert.strictEqual(result.available, true);
      assert.ok(result.rule);
    });

    it('should reject slot outside operating hours (e.g., weekend or late evening)', async () => {
      // Sunday is not in the rule's windows
      const sundayStart = zonedTimeToUtc('2026-10-11', '10:00', defaultTz);
      const sundayEnd = zonedTimeToUtc('2026-10-11', '11:00', defaultTz);

      const resultSunday = await AvailabilityService.checkAvailability({
        resourceId: sharedResource._id,
        startAt: sundayStart,
        endAt: sundayEnd,
      });

      assert.strictEqual(resultSunday.available, false);
      assert.strictEqual(resultSunday.reason, 'OUTSIDE_OPERATING_HOURS');

      // Monday after 20:00 closing
      const eveningStart = zonedTimeToUtc('2026-10-12', '20:00', defaultTz);
      const eveningEnd = zonedTimeToUtc('2026-10-12', '21:00', defaultTz);

      const resultEvening = await AvailabilityService.checkAvailability({
        resourceId: sharedResource._id,
        startAt: eveningStart,
        endAt: eveningEnd,
      });

      assert.strictEqual(resultEvening.available, false);
      assert.strictEqual(resultEvening.reason, 'OUTSIDE_OPERATING_HOURS');
    });

    it('should enforce min and max booking duration policy', async () => {
      // Min duration is 30m, test 15m
      const shortStart = zonedTimeToUtc('2026-10-12', '10:00', defaultTz);
      const shortEnd = zonedTimeToUtc('2026-10-12', '10:15', defaultTz);

      const resultShort = await AvailabilityService.checkAvailability({
        resourceId: sharedResource._id,
        startAt: shortStart,
        endAt: shortEnd,
      });
      assert.strictEqual(resultShort.available, false);
      assert.strictEqual(resultShort.reason, 'DURATION_TOO_SHORT');

      // Max duration is 240m (4h), test 300m (5h)
      const longStart = zonedTimeToUtc('2026-10-12', '10:00', defaultTz);
      const longEnd = zonedTimeToUtc('2026-10-12', '15:00', defaultTz);

      const resultLong = await AvailabilityService.checkAvailability({
        resourceId: sharedResource._id,
        startAt: longStart,
        endAt: longEnd,
      });
      assert.strictEqual(resultLong.available, false);
      assert.strictEqual(resultLong.reason, 'DURATION_TOO_LONG');
    });

    it('should generate discrete bookable slots across operating window', async () => {
      // Monday 2026-10-12: 08:00 - 20:00 (12 hours = 12 x 60m slots)
      const slots = await AvailabilityService.calculateSlots({
        resourceId: sharedResource._id,
        date: '2026-10-12',
        slotDurationMinutes: 60,
      });

      assert.strictEqual(slots.length, 12);
      assert.strictEqual(slots[0].startTime, '08:00');
      assert.strictEqual(slots[0].endTime, '09:00');
      assert.strictEqual(slots[0].available, true);
      assert.strictEqual(slots[11].startTime, '19:00');
      assert.strictEqual(slots[11].endTime, '20:00');
      assert.strictEqual(slots[11].available, true);
    });
  });

  /* ========================================================================= */
  /* 3. AUTHORITATIVE CONFLICT DETECTION (ALL 8 PERMUTATIONS)                  */
  /* ========================================================================= */
  describe('3. Conflict Detection - All 8 Interval Overlap Permutations', () => {
    let existingReservation: ReservationDocument | null = null;

    before(async () => {
      // Existing active reservation: Monday 2026-10-12 [12:00, 14:00)
      existingReservation = await Reservation.create({
        resource: sharedResource._id,
        user: sharedUser._id,
        startAt: zonedTimeToUtc('2026-10-12', '12:00', defaultTz),
        endAt: zonedTimeToUtc('2026-10-12', '14:00', defaultTz),
        timezone: defaultTz,
        status: ReservationStatus.CONFIRMED,
        title: `${TEST_PREFIX}Existing Baseline Reservation`,
      });
    });

    after(async () => {
      if (existingReservation) {
        await Reservation.findByIdAndDelete(existingReservation._id);
      }
    });

    it('Case 1: Candidate entirely before existing [10:00, 11:30) -> NO conflict', async () => {
      const result = await AvailabilityService.checkAvailability({
        resourceId: sharedResource._id,
        startAt: zonedTimeToUtc('2026-10-12', '10:00', defaultTz),
        endAt: zonedTimeToUtc('2026-10-12', '11:30', defaultTz),
      });
      assert.strictEqual(result.available, true);
    });

    it('Case 2: Candidate entirely after existing [14:30, 16:00) -> NO conflict', async () => {
      const result = await AvailabilityService.checkAvailability({
        resourceId: sharedResource._id,
        startAt: zonedTimeToUtc('2026-10-12', '14:30', defaultTz),
        endAt: zonedTimeToUtc('2026-10-12', '16:00', defaultTz),
      });
      assert.strictEqual(result.available, true);
    });

    it('Case 3: Candidate exactly matches existing [12:00, 14:00) -> CONFLICT', async () => {
      const result = await AvailabilityService.checkAvailability({
        resourceId: sharedResource._id,
        startAt: zonedTimeToUtc('2026-10-12', '12:00', defaultTz),
        endAt: zonedTimeToUtc('2026-10-12', '14:00', defaultTz),
      });
      assert.strictEqual(result.available, false);
      assert.strictEqual(result.reason, 'RESERVATION_CONFLICT');
    });

    it('Case 4: Candidate starts before, ends inside existing [11:00, 13:00) -> CONFLICT', async () => {
      const result = await AvailabilityService.checkAvailability({
        resourceId: sharedResource._id,
        startAt: zonedTimeToUtc('2026-10-12', '11:00', defaultTz),
        endAt: zonedTimeToUtc('2026-10-12', '13:00', defaultTz),
      });
      assert.strictEqual(result.available, false);
      assert.strictEqual(result.reason, 'RESERVATION_CONFLICT');
    });

    it('Case 5: Candidate starts inside, ends after existing [13:00, 15:00) -> CONFLICT', async () => {
      const result = await AvailabilityService.checkAvailability({
        resourceId: sharedResource._id,
        startAt: zonedTimeToUtc('2026-10-12', '13:00', defaultTz),
        endAt: zonedTimeToUtc('2026-10-12', '15:00', defaultTz),
      });
      assert.strictEqual(result.available, false);
      assert.strictEqual(result.reason, 'RESERVATION_CONFLICT');
    });

    it('Case 6: Candidate entirely inside existing [12:30, 13:30) -> CONFLICT', async () => {
      const result = await AvailabilityService.checkAvailability({
        resourceId: sharedResource._id,
        startAt: zonedTimeToUtc('2026-10-12', '12:30', defaultTz),
        endAt: zonedTimeToUtc('2026-10-12', '13:30', defaultTz),
      });
      assert.strictEqual(result.available, false);
      assert.strictEqual(result.reason, 'RESERVATION_CONFLICT');
    });

    it('Case 7: Candidate entirely encloses existing [11:00, 15:00) -> CONFLICT', async () => {
      const result = await AvailabilityService.checkAvailability({
        resourceId: sharedResource._id,
        startAt: zonedTimeToUtc('2026-10-12', '11:00', defaultTz),
        endAt: zonedTimeToUtc('2026-10-12', '15:00', defaultTz),
      });
      assert.strictEqual(result.available, false);
      assert.strictEqual(result.reason, 'RESERVATION_CONFLICT');
    });

    it('Case 8a: Candidate touches existing at end boundary [10:00, 12:00) -> NO conflict', async () => {
      const result = await AvailabilityService.checkAvailability({
        resourceId: sharedResource._id,
        startAt: zonedTimeToUtc('2026-10-12', '10:00', defaultTz),
        endAt: zonedTimeToUtc('2026-10-12', '12:00', defaultTz),
      });
      assert.strictEqual(result.available, true);
    });

    it('Case 8b: Candidate touches existing at start boundary [14:00, 16:00) -> NO conflict', async () => {
      const result = await AvailabilityService.checkAvailability({
        resourceId: sharedResource._id,
        startAt: zonedTimeToUtc('2026-10-12', '14:00', defaultTz),
        endAt: zonedTimeToUtc('2026-10-12', '16:00', defaultTz),
      });
      assert.strictEqual(result.available, true);
    });
  });

  /* ========================================================================= */
  /* 4. BLACKOUT ENFORCEMENT & HALF-OPEN BOUNDARIES                            */
  /* ========================================================================= */
  describe('4. Blackout Enforcement', () => {
    let blackout: BlackoutDocument | null = null;

    before(async () => {
      // Blackout: Tuesday 2026-10-13 [14:00, 16:00)
      blackout = await Blackout.create({
        resource: sharedResource._id,
        category: BlackoutCategory.MAINTENANCE,
        reason: `${TEST_PREFIX}Hardware Firmware Upgrade`,
        startAt: zonedTimeToUtc('2026-10-13', '14:00', defaultTz),
        endAt: zonedTimeToUtc('2026-10-13', '16:00', defaultTz),
        isActive: true,
      });
    });

    after(async () => {
      if (blackout) {
        await Blackout.findByIdAndDelete(blackout._id);
      }
    });

    it('should reject booking that overlaps an active blackout', async () => {
      const result = await AvailabilityService.checkAvailability({
        resourceId: sharedResource._id,
        startAt: zonedTimeToUtc('2026-10-13', '14:30', defaultTz),
        endAt: zonedTimeToUtc('2026-10-13', '15:30', defaultTz),
      });

      assert.strictEqual(result.available, false);
      assert.strictEqual(result.reason, 'BLACKOUT_CONFLICT');
    });

    it('should allow booking that touches blackout boundary [12:00, 14:00) or [16:00, 18:00)', async () => {
      const beforeResult = await AvailabilityService.checkAvailability({
        resourceId: sharedResource._id,
        startAt: zonedTimeToUtc('2026-10-13', '12:00', defaultTz),
        endAt: zonedTimeToUtc('2026-10-13', '14:00', defaultTz),
      });
      assert.strictEqual(beforeResult.available, true);

      const afterResult = await AvailabilityService.checkAvailability({
        resourceId: sharedResource._id,
        startAt: zonedTimeToUtc('2026-10-13', '16:00', defaultTz),
        endAt: zonedTimeToUtc('2026-10-13', '18:00', defaultTz),
      });
      assert.strictEqual(afterResult.available, true);
    });
  });

  /* ========================================================================= */
  /* 5. MULTIDIMENSIONAL QUOTA ENFORCEMENT                                     */
  /* ========================================================================= */
  describe('5. Quota Enforcement', () => {
    it('should enforce daily BOOKING_COUNT limit for USER', async () => {
      // Daily limit: 1 booking per day for this user on this resource
      const quota = await Quota.create({
        name: `${TEST_PREFIX}Daily One Booking Quota`,
        scopeType: QuotaScopeType.RESOURCE,
        resource: sharedResource._id,
        subjectType: QuotaSubjectType.USER,
        user: sharedUser._id,
        metric: QuotaMetric.BOOKING_COUNT,
        period: QuotaPeriod.DAILY,
        limit: 1,
        timezone: defaultTz,
        isActive: true,
      });

      const dayDate = '2026-10-14'; // Wednesday
      const startAt1 = zonedTimeToUtc(dayDate, '09:00', defaultTz);
      const endAt1 = zonedTimeToUtc(dayDate, '10:00', defaultTz);

      // First check: allowed
      const check1 = await QuotaService.evaluateQuotas({
        userId: sharedUser._id,
        resourceId: sharedResource._id,
        startAt: startAt1,
        endAt: endAt1,
      });
      assert.strictEqual(check1.allowed, true);

      // Commit the first booking
      const res1 = await Reservation.create({
        resource: sharedResource._id,
        user: sharedUser._id,
        startAt: startAt1,
        endAt: endAt1,
        timezone: defaultTz,
        status: ReservationStatus.CONFIRMED,
        title: `${TEST_PREFIX}Quota Test 1`,
      });

      // Second check on the same day: should violate quota!
      const startAt2 = zonedTimeToUtc(dayDate, '11:00', defaultTz);
      const endAt2 = zonedTimeToUtc(dayDate, '12:00', defaultTz);

      const check2 = await QuotaService.evaluateQuotas({
        userId: sharedUser._id,
        resourceId: sharedResource._id,
        startAt: startAt2,
        endAt: endAt2,
      });

      assert.strictEqual(check2.allowed, false);
      assert.ok(check2.violation);
      assert.strictEqual(check2.violation?.limit, 1);
      assert.strictEqual(check2.violation?.consumed, 1);

      // Clean up
      await Reservation.findByIdAndDelete(res1._id);
      await Quota.findByIdAndDelete(quota._id);
    });

    it('should enforce DURATION_MINUTES limit for DEPARTMENT subject', async () => {
      // Weekly limit: 120 minutes for Electrical & Computer Engineering department
      const quota = await Quota.create({
        name: `${TEST_PREFIX}Dept Weekly Duration Quota`,
        scopeType: QuotaScopeType.RESOURCE,
        resource: sharedResource._id,
        subjectType: QuotaSubjectType.DEPARTMENT,
        department: 'Electrical & Computer Engineering',
        metric: QuotaMetric.DURATION_MINUTES,
        period: QuotaPeriod.WEEKLY,
        limit: 120, // 2 hours
        timezone: defaultTz,
        isActive: true,
      });

      const dayDate = '2026-10-15'; // Thursday
      const startAt = zonedTimeToUtc(dayDate, '09:00', defaultTz);
      const endAt = zonedTimeToUtc(dayDate, '12:00', defaultTz); // 180 min > 120 min

      const check = await QuotaService.evaluateQuotas({
        userId: sharedUser._id,
        resourceId: sharedResource._id,
        startAt,
        endAt,
      });

      assert.strictEqual(check.allowed, false);
      assert.ok(check.violation);
      assert.strictEqual(check.violation?.metric, QuotaMetric.DURATION_MINUTES);
      assert.strictEqual(check.violation?.requested, 180);
      assert.strictEqual(check.violation?.limit, 120);

      await Quota.findByIdAndDelete(quota._id);
    });
  });

  /* ========================================================================= */
  /* 6. HTTP API LAYER INTEGRATION (/api/bookings)                             */
  /* ========================================================================= */
  describe('6. HTTP API Layer (/api/bookings)', () => {
    let createdBookingId: string;

    it('POST /api/bookings should create a reservation (201 Created)', async () => {
      const startAt = zonedTimeToUtc('2026-10-16', '10:00', defaultTz).toISOString(); // Friday
      const endAt = zonedTimeToUtc('2026-10-16', '11:00', defaultTz).toISOString();

      const res = await fetch(`${baseUrl}/api/bookings`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          resourceId: sharedResource._id.toString(),
          userId: sharedUser._id.toString(),
          startAt,
          endAt,
          timezone: defaultTz,
          title: `${TEST_PREFIX}API Test Reservation`,
          description: 'Testing HTTP endpoint creation',
        }),
      });

      assert.strictEqual(res.status, 201);
      const body = (await res.json()) as TestApiResponse;
      assert.strictEqual(body.success, true);
      assert.ok(body.data?._id);
      assert.strictEqual(body.data?.status, ReservationStatus.CONFIRMED);
      createdBookingId = body.data?._id;
    });

    it('POST /api/bookings should reject conflicting reservation (409 Conflict)', async () => {
      // Same slot
      const startAt = zonedTimeToUtc('2026-10-16', '10:00', defaultTz).toISOString();
      const endAt = zonedTimeToUtc('2026-10-16', '11:00', defaultTz).toISOString();

      const res = await fetch(`${baseUrl}/api/bookings`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          resourceId: sharedResource._id.toString(),
          userId: sharedUser._id.toString(),
          startAt,
          endAt,
          timezone: defaultTz,
          title: `${TEST_PREFIX}Conflicting Attempt`,
        }),
      });

      assert.strictEqual(res.status, 409);
      const body = (await res.json()) as TestApiResponse;
      assert.strictEqual(body.success, false);
      assert.strictEqual(body.error?.code, 'CONFLICT');
    });

    it('GET /api/bookings/:id should retrieve the reservation (200 OK)', async () => {
      const res = await fetch(`${baseUrl}/api/bookings/${createdBookingId}`);
      assert.strictEqual(res.status, 200);

      const body = (await res.json()) as TestApiResponse;
      assert.strictEqual(body.success, true);
      assert.strictEqual(body.data?._id, createdBookingId);
      assert.ok(body.data?.resource);
      assert.ok(body.data?.user);
    });

    it('GET /api/bookings should list reservations with filtering (200 OK)', async () => {
      const res = await fetch(`${baseUrl}/api/bookings?resourceId=${sharedResource._id}`);
      assert.strictEqual(res.status, 200);

      const body = (await res.json()) as TestApiResponse;
      assert.strictEqual(body.success, true);
      assert.ok(Array.isArray(body.data?.items));
      assert.ok((body.data?.total ?? 0) >= 1);
    });

    it('POST /api/bookings/:id/transition should transition status to CHECKED_IN', async () => {
      const res = await fetch(`${baseUrl}/api/bookings/${createdBookingId}/transition`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          status: ReservationStatus.CHECKED_IN,
          userId: sharedUser._id.toString(),
        }),
      });

      assert.strictEqual(res.status, 200);
      const body = (await res.json()) as TestApiResponse;
      assert.strictEqual(body.success, true);
      assert.strictEqual(body.data?.status, ReservationStatus.CHECKED_IN);
      assert.ok(body.data?.checkInAt);
    });

    it('POST /api/bookings/:id/cancel should cancel the reservation', async () => {
      const res = await fetch(`${baseUrl}/api/bookings/${createdBookingId}/cancel`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          userId: sharedUser._id.toString(),
          reason: 'Research experiment postponed',
        }),
      });

      assert.strictEqual(res.status, 200);
      const body = (await res.json()) as TestApiResponse;
      assert.strictEqual(body.success, true);
      assert.strictEqual(body.data?.status, ReservationStatus.CANCELLED);
      assert.ok(body.data?.cancelledAt);
    });

    it('GET /api/bookings/availability should return availability status', async () => {
      // Friday 10:00 - 11:00 is now free since previous booking was CANCELLED
      const startAt = encodeURIComponent(zonedTimeToUtc('2026-10-16', '10:00', defaultTz).toISOString());
      const endAt = encodeURIComponent(zonedTimeToUtc('2026-10-16', '11:00', defaultTz).toISOString());

      const res = await fetch(
        `${baseUrl}/api/bookings/availability?resourceId=${sharedResource._id}&startAt=${startAt}&endAt=${endAt}`
      );

      assert.strictEqual(res.status, 200);
      const body = (await res.json()) as TestApiResponse;
      assert.strictEqual(body.success, true);
      assert.strictEqual(body.data?.available, true);
    });

    it('GET /api/bookings/slots should return discrete slots', async () => {
      const res = await fetch(
        `${baseUrl}/api/bookings/slots?resourceId=${sharedResource._id}&date=2026-10-16&slotDurationMinutes=60`
      );

      assert.strictEqual(res.status, 200);
      const body = (await res.json()) as TestApiResponse;
      assert.strictEqual(body.success, true);
      assert.ok(Array.isArray(body.data?.slots));
      assert.strictEqual(body.data.slots.length, 12);
    });
  });
});
