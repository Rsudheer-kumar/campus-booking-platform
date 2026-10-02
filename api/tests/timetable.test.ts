/**
 * CampusFlow API - Timetable Integration Test Suite (Phase 3.1)
 * Authoritative end-to-end integration and invariant tests for academic timetable integration:
 * - TimetableEntry schema validation and interval invariants
 * - Resource code resolution and atomic batch ingestion
 * - Version progression, stale rejection, and idempotency
 * - Hard availability enforcement and privacy protection
 * - Discrete slot calculation and adjacent interval validation
 * - Direct booking write-path rejection
 * - Automatic cancellation of superseded reservations with SUPERSEDED_BY_TIMETABLE_REPUBLICATION
 * - Terminal reservation protection
 * - Role-based access control (ADMIN sync, audit guards)
 * - Concurrency race serialization with real MongoDB transactions
 */

import { describe, it, before, after, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import type { Server } from 'http';
import type { AddressInfo } from 'net';
import mongoose, { Types } from 'mongoose';
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
  ReservationStatus,
  ACTIVE_RESERVATION_STATES,
  TimetableEntry,
  type ResourceDocument,
  type UserDocument,
} from '../src/models';
import { AvailabilityService } from '../src/services/availability.service';
import { ReservationService } from '../src/services/reservation.service';
import { TimetableService } from '../src/services/timetable.service';
import { zonedTimeToUtc } from '../src/utils/timezone';
import { signAccessToken } from '../src/utils/jwt';

describe('CampusFlow Timetable Integration Tests (Phase 3.1)', () => {
  let server: Server;
  let baseUrl: string;

  const TEST_PREFIX = 'TEST_TT_';
  let testResource: ResourceDocument;
  let testResource2: ResourceDocument;
  let adminUser: UserDocument;
  let studentUser: UserDocument;
  let facilityManagerUser: UserDocument;

  let adminToken: string;
  let studentToken: string;
  let facilityManagerToken: string;

  const defaultTz = 'America/New_York';

  before(async () => {
    await connectDatabase(env.MONGODB_TEST_URI);
    assert.strictEqual(isDatabaseConnected(), true);
    assert.strictEqual(mongoose.connection.db?.databaseName, 'campusflow_test');

    await Promise.all([
      TimetableEntry.syncIndexes(),
      Reservation.syncIndexes(),
      Resource.syncIndexes(),
    ]);

    // Clean up any stale test fixtures
    await Promise.all([
      TimetableEntry.deleteMany({ academicTerm: new RegExp(`^${TEST_PREFIX}`, 'i') }),
      Reservation.deleteMany({ title: new RegExp(`^${TEST_PREFIX}`, 'i') }),
      AvailabilityRule.deleteMany({ name: new RegExp(`^${TEST_PREFIX}`, 'i') }),
      Resource.deleteMany({ code: new RegExp(`^${TEST_PREFIX}`, 'i') }),
      ResourceType.deleteMany({ code: new RegExp(`^${TEST_PREFIX}`, 'i') }),
      User.deleteMany({ email: new RegExp(`^${TEST_PREFIX}`, 'i') }),
    ]);

    // Create shared resource type
    const resourceType = await ResourceType.create({
      name: `${TEST_PREFIX}Lecture Hall Type`,
      code: `${TEST_PREFIX}LH_TYPE`,
      category: ResourceCategory.ROOM,
      isActive: true,
    });

    // Create shared physical resources
    testResource = await Resource.create({
      name: `${TEST_PREFIX}Lecture Hall 101`,
      code: `${TEST_PREFIX}LH101`,
      resourceType: resourceType._id,
      capacity: 100,
      status: ResourceStatus.ACTIVE,
      isActive: true,
      location: { building: 'Academic Block A', roomNumber: '101' },
    });

    testResource2 = await Resource.create({
      name: `${TEST_PREFIX}Lecture Hall 102`,
      code: `${TEST_PREFIX}LH102`,
      resourceType: resourceType._id,
      capacity: 80,
      status: ResourceStatus.ACTIVE,
      isActive: true,
      location: { building: 'Academic Block A', roomNumber: '102' },
    });

    // Configure AvailabilityRule: Mon-Fri 08:00 - 20:00
    await AvailabilityRule.create({
      resource: testResource._id,
      timezone: defaultTz,
      name: `${TEST_PREFIX}Standard Schedule`,
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
        maxAdvanceBookingDays: 60,
      },
      isActive: true,
    });

    // Create users with distinct roles
    adminUser = await User.create({
      name: `${TEST_PREFIX}Admin User`,
      email: `${TEST_PREFIX}admin@university.edu`,
      roles: [UserRole.ADMIN],
      department: 'Academic Registrar',
      isActive: true,
    });
    adminToken = signAccessToken({
      sub: adminUser._id.toString(),
      email: adminUser.email,
      roles: adminUser.roles,
      isActive: true,
      tokenVersion: adminUser.tokenVersion ?? 0,
    });

    studentUser = await User.create({
      name: `${TEST_PREFIX}Student User`,
      email: `${TEST_PREFIX}student@university.edu`,
      roles: [UserRole.STUDENT],
      department: 'Computer Science',
      isActive: true,
    });
    studentToken = signAccessToken({
      sub: studentUser._id.toString(),
      email: studentUser.email,
      roles: studentUser.roles,
      isActive: true,
      tokenVersion: studentUser.tokenVersion ?? 0,
    });

    facilityManagerUser = await User.create({
      name: `${TEST_PREFIX}Facility Manager`,
      email: `${TEST_PREFIX}fm@university.edu`,
      roles: [UserRole.FACILITY_MANAGER],
      department: 'Campus Operations',
      isActive: true,
    });
    facilityManagerToken = signAccessToken({
      sub: facilityManagerUser._id.toString(),
      email: facilityManagerUser.email,
      roles: facilityManagerUser.roles,
      isActive: true,
      tokenVersion: facilityManagerUser.tokenVersion ?? 0,
    });

    // Start HTTP server for route testing
    await new Promise<void>((resolve) => {
      server = app.listen(0, () => {
        const addr = server.address() as AddressInfo;
        baseUrl = `http://127.0.0.1:${addr.port}`;
        resolve();
      });
    });
  });

  after(async () => {
    if (server) {
      await new Promise<void>((resolve) => server.close(() => resolve()));
    }

    await Promise.all([
      TimetableEntry.deleteMany({ academicTerm: new RegExp(`^${TEST_PREFIX}`, 'i') }),
      Reservation.deleteMany({ title: new RegExp(`^${TEST_PREFIX}`, 'i') }),
      AvailabilityRule.deleteMany({ name: new RegExp(`^${TEST_PREFIX}`, 'i') }),
      Resource.deleteMany({ code: new RegExp(`^${TEST_PREFIX}`, 'i') }),
      ResourceType.deleteMany({ code: new RegExp(`^${TEST_PREFIX}`, 'i') }),
      User.deleteMany({ email: new RegExp(`^${TEST_PREFIX}`, 'i') }),
    ]);

    await disconnectDatabase();
  });

  beforeEach(async () => {
    // Clear timetable entries between individual tests
    await TimetableEntry.deleteMany({ academicTerm: new RegExp(`^${TEST_PREFIX}`, 'i') });
    await Reservation.deleteMany({ title: new RegExp(`^${TEST_PREFIX}`, 'i') });
  });

  // =========================================================================
  // SECTION 1: MODEL VALIDATION & TIME INVARIANTS
  // =========================================================================
  describe('1. Model Validation & Interval Invariants', () => {
    it('TT-01 should successfully create a valid TimetableEntry', async () => {
      const entry = await TimetableEntry.create({
        resource: testResource._id,
        academicTerm: `${TEST_PREFIX}2026-FALL`,
        courseCode: 'CS-301',
        courseTitle: 'Operating Systems',
        instructorName: 'Dr. Turing',
        startAt: new Date('2026-10-05T09:00:00.000Z'),
        endAt: new Date('2026-10-05T10:30:00.000Z'),
        timezone: 'UTC',
        isPublished: true,
        version: 1,
        publicationBatchId: 'batch-001',
      });

      assert.ok(entry._id);
      assert.strictEqual(entry.courseCode, 'CS-301');
      assert.strictEqual(entry.isPublished, true);
      assert.strictEqual(entry.version, 1);
    });

    it('TT-02 should reject endAt earlier than or equal to startAt', async () => {
      await assert.rejects(
        async () => {
          await TimetableEntry.create({
            resource: testResource._id,
            academicTerm: `${TEST_PREFIX}2026-FALL`,
            courseCode: 'CS-301',
            courseTitle: 'Operating Systems',
            startAt: new Date('2026-10-05T10:00:00.000Z'),
            endAt: new Date('2026-10-05T09:00:00.000Z'), // Inverted interval
            timezone: 'UTC',
            version: 1,
            publicationBatchId: 'batch-001',
          });
        },
        /startAt must be earlier than endAt/
      );

      await assert.rejects(
        async () => {
          await TimetableEntry.create({
            resource: testResource._id,
            academicTerm: `${TEST_PREFIX}2026-FALL`,
            courseCode: 'CS-301',
            courseTitle: 'Operating Systems',
            startAt: new Date('2026-10-05T10:00:00.000Z'),
            endAt: new Date('2026-10-05T10:00:00.000Z'), // Zero duration
            timezone: 'UTC',
            version: 1,
            publicationBatchId: 'batch-001',
          });
        },
        /startAt must be earlier than endAt/
      );
    });

    it('TT-03 should reject invalid IANA timezone', async () => {
      await assert.rejects(
        async () => {
          await TimetableEntry.create({
            resource: testResource._id,
            academicTerm: `${TEST_PREFIX}2026-FALL`,
            courseCode: 'CS-301',
            courseTitle: 'Operating Systems',
            startAt: new Date('2026-10-05T09:00:00.000Z'),
            endAt: new Date('2026-10-05T10:00:00.000Z'),
            timezone: 'Invalid/NonExistent_Zone',
            version: 1,
            publicationBatchId: 'batch-001',
          });
        },
        /Invalid IANA timezone identifier/
      );
    });

    it('TT-04 should accept valid non-UTC IANA timezone', async () => {
      const entry = await TimetableEntry.create({
        resource: testResource._id,
        academicTerm: `${TEST_PREFIX}2026-FALL`,
        courseCode: 'CS-301',
        courseTitle: 'Operating Systems',
        startAt: new Date('2026-10-05T09:00:00.000Z'),
        endAt: new Date('2026-10-05T10:00:00.000Z'),
        timezone: 'America/New_York',
        version: 1,
        publicationBatchId: 'batch-001',
      });

      assert.strictEqual(entry.timezone, 'America/New_York');
    });

    it('TT-05 should reject missing required fields', async () => {
      await assert.rejects(
        async () => {
          // @ts-expect-error Missing required fields
          await TimetableEntry.create({
            academicTerm: `${TEST_PREFIX}2026-FALL`,
          });
        },
        /Resource reference is required/
      );
    });
  });

  // =========================================================================
  // SECTION 2: RESOURCE MAPPING & ATOMIC BATCH INGESTION
  // =========================================================================
  describe('2. Resource Mapping & Atomic Synchronization', () => {
    it('TT-06 should reject timetable sync when a resourceCode is unknown (422)', async () => {
      const res = await fetch(`${baseUrl}/api/timetables/sync`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${adminToken}`,
        },
        body: JSON.stringify({
          academicTerm: `${TEST_PREFIX}2026-FALL`,
          version: 1,
          publicationBatchId: 'batch-unmapped',
          entries: [
            {
              resourceCode: 'NON_EXISTENT_ROOM_CODE_999',
              courseCode: 'CS-101',
              courseTitle: 'Intro to CS',
              startAt: '2026-10-05T09:00:00.000Z',
              endAt: '2026-10-05T10:00:00.000Z',
              timezone: 'UTC',
            },
          ],
        }),
      });

      assert.strictEqual(res.status, 422);
      const json = await res.json();
      assert.strictEqual(json.success, false);
      assert.match(json.error.message, /Unknown resource codes: NON_EXISTENT_ROOM_CODE_999/);
    });

    it('TT-07 should reject payload with duplicate identical slots within the same batch (400)', async () => {
      const res = await fetch(`${baseUrl}/api/timetables/sync`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${adminToken}`,
        },
        body: JSON.stringify({
          academicTerm: `${TEST_PREFIX}2026-FALL`,
          version: 1,
          publicationBatchId: 'batch-duplicate',
          entries: [
            {
              resourceCode: testResource.code,
              courseCode: 'CS-101',
              courseTitle: 'Intro to CS',
              startAt: '2026-10-05T09:00:00.000Z',
              endAt: '2026-10-05T10:00:00.000Z',
              timezone: 'UTC',
            },
            {
              resourceCode: testResource.code,
              courseCode: 'CS-102',
              courseTitle: 'Duplicate Slot Course',
              startAt: '2026-10-05T09:00:00.000Z',
              endAt: '2026-10-05T10:00:00.000Z',
              timezone: 'UTC',
            },
          ],
        }),
      });

      assert.strictEqual(res.status, 400);
      const json = await res.json();
      assert.strictEqual(json.success, false);
      assert.match(JSON.stringify(json.error), /Duplicate identical timetable slot/);
    });

    it('TT-08 should successfully sync a valid batch and resolve resource codes', async () => {
      const res = await fetch(`${baseUrl}/api/timetables/sync`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${adminToken}`,
        },
        body: JSON.stringify({
          academicTerm: `${TEST_PREFIX}2026-FALL`,
          version: 1,
          publicationBatchId: 'batch-001',
          entries: [
            {
              resourceCode: testResource.code,
              courseCode: 'CS-101',
              courseTitle: 'Intro to Computer Science',
              instructorName: 'Prof. Hopper',
              startAt: '2026-10-05T09:00:00.000Z',
              endAt: '2026-10-05T10:30:00.000Z',
              timezone: 'UTC',
            },
            {
              resourceCode: testResource2.code,
              courseCode: 'MATH-201',
              courseTitle: 'Linear Algebra',
              instructorName: 'Prof. Gauss',
              startAt: '2026-10-05T11:00:00.000Z',
              endAt: '2026-10-05T12:30:00.000Z',
              timezone: 'UTC',
            },
          ],
        }),
      });

      assert.strictEqual(res.status, 200);
      const json = await res.json();
      assert.strictEqual(json.success, true);
      assert.strictEqual(json.data.insertedCount, 2);
      assert.strictEqual(json.data.version, 1);
      assert.strictEqual(json.data.publicationBatchId, 'batch-001');

      // Verify in MongoDB
      const stored = await TimetableEntry.find({
        academicTerm: `${TEST_PREFIX}2026-FALL`,
        isPublished: true,
      });
      assert.strictEqual(stored.length, 2);
    });

    it('TT-09 should be idempotent when resubmitting the identical batch (zero new inserts)', async () => {
      const payload = {
        academicTerm: `${TEST_PREFIX}2026-FALL`,
        version: 1,
        publicationBatchId: 'batch-idempotent',
        entries: [
          {
            resourceCode: testResource.code,
            courseCode: 'CS-101',
            courseTitle: 'Intro to CS',
            startAt: '2026-10-05T09:00:00.000Z',
            endAt: '2026-10-05T10:00:00.000Z',
            timezone: 'UTC',
          },
        ],
      };

      // First submission
      const res1 = await fetch(`${baseUrl}/api/timetables/sync`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${adminToken}`,
        },
        body: JSON.stringify(payload),
      });
      assert.strictEqual(res1.status, 200);
      const json1 = await res1.json();
      assert.strictEqual(json1.data.insertedCount, 1);

      // Repeated submission with same version & batchId
      const res2 = await fetch(`${baseUrl}/api/timetables/sync`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${adminToken}`,
        },
        body: JSON.stringify(payload),
      });
      assert.strictEqual(res2.status, 200);
      const json2 = await res2.json();
      assert.strictEqual(json2.data.isIdempotentRepeat, true);
      assert.strictEqual(json2.data.insertedCount, 0);

      // Verify DB contains exactly 1 active record, not 2
      const count = await TimetableEntry.countDocuments({
        academicTerm: `${TEST_PREFIX}2026-FALL`,
        isPublished: true,
      });
      assert.strictEqual(count, 1);
    });

    it('TT-10 should reject stale publication versions with 409 Conflict', async () => {
      // Publish version 5
      await TimetableService.syncTimetable(
        {
          academicTerm: `${TEST_PREFIX}2026-FALL`,
          version: 5,
          publicationBatchId: 'batch-v5',
          entries: [
            {
              resourceCode: testResource.code,
              courseCode: 'CS-101',
              courseTitle: 'Intro to CS',
              startAt: '2026-10-05T09:00:00.000Z',
              endAt: '2026-10-05T10:00:00.000Z',
              timezone: 'UTC',
            },
          ],
        },
        adminUser._id
      );

      // Attempt to publish version 4 (stale)
      const res = await fetch(`${baseUrl}/api/timetables/sync`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${adminToken}`,
        },
        body: JSON.stringify({
          academicTerm: `${TEST_PREFIX}2026-FALL`,
          version: 4,
          publicationBatchId: 'batch-v4',
          entries: [
            {
              resourceCode: testResource.code,
              courseCode: 'CS-101',
              courseTitle: 'Intro to CS',
              startAt: '2026-10-05T09:00:00.000Z',
              endAt: '2026-10-05T10:00:00.000Z',
              timezone: 'UTC',
            },
          ],
        }),
      });

      assert.strictEqual(res.status, 409);
      const json = await res.json();
      assert.match(json.error.message, /Stale publication version: incoming version 4 is older than currently published version 5/);
    });

    it('TT-11 should deactivate absent entries from previous version on republication', async () => {
      // Version 1 has Course A and Course B
      await TimetableService.syncTimetable(
        {
          academicTerm: `${TEST_PREFIX}2026-FALL`,
          version: 1,
          publicationBatchId: 'batch-v1',
          entries: [
            {
              resourceCode: testResource.code,
              courseCode: 'COURSE-A',
              courseTitle: 'Course A',
              startAt: '2026-10-05T09:00:00.000Z',
              endAt: '2026-10-05T10:00:00.000Z',
              timezone: 'UTC',
            },
            {
              resourceCode: testResource.code,
              courseCode: 'COURSE-B',
              courseTitle: 'Course B',
              startAt: '2026-10-05T11:00:00.000Z',
              endAt: '2026-10-05T12:00:00.000Z',
              timezone: 'UTC',
            },
          ],
        },
        adminUser._id
      );

      // Version 2 has only Course A (Course B dropped from curriculum)
      const result2 = await TimetableService.syncTimetable(
        {
          academicTerm: `${TEST_PREFIX}2026-FALL`,
          version: 2,
          publicationBatchId: 'batch-v2',
          entries: [
            {
              resourceCode: testResource.code,
              courseCode: 'COURSE-A',
              courseTitle: 'Course A',
              startAt: '2026-10-05T09:00:00.000Z',
              endAt: '2026-10-05T10:00:00.000Z',
              timezone: 'UTC',
            },
          ],
        },
        adminUser._id
      );

      assert.strictEqual(result2.supersededEntriesCount, 2);

      // Verify active published entries for this term: only Course A from batch-v2 is published
      const activeEntries = await TimetableEntry.find({
        academicTerm: `${TEST_PREFIX}2026-FALL`,
        isPublished: true,
      });
      assert.strictEqual(activeEntries.length, 1);
      assert.strictEqual(activeEntries[0].publicationBatchId, 'batch-v2');

      // Verify Course B exists in historical records but isPublished === false
      const courseB = await TimetableEntry.findOne({
        academicTerm: `${TEST_PREFIX}2026-FALL`,
        courseCode: 'COURSE-B',
      });
      assert.ok(courseB);
      assert.strictEqual(courseB.isPublished, false);
    });
  });

  // =========================================================================
  // SECTION 3: HARD AVAILABILITY & PRIVACY ENFORCEMENT
  // =========================================================================
  describe('3. Hard Availability & Privacy Constraints', () => {
    beforeEach(async () => {
      // Stage an active published timetable entry: 2026-10-19 10:00 to 12:00
      await TimetableEntry.create({
        resource: testResource._id,
        academicTerm: `${TEST_PREFIX}2026-FALL`,
        courseCode: 'CS-401',
        courseTitle: 'Advanced Distributed Systems',
        instructorName: 'Dr. Leslie Lamport',
        startAt: zonedTimeToUtc('2026-10-19', '10:00', defaultTz),
        endAt: zonedTimeToUtc('2026-10-19', '12:00', defaultTz),
        timezone: defaultTz,
        isPublished: true,
        version: 1,
        publicationBatchId: 'batch-priv-01',
      });
    });

    it('TT-12 should return available: false with reason TIMETABLE_CONFLICT on overlap', async () => {
      const startAt = zonedTimeToUtc('2026-10-19', '10:30', defaultTz);
      const endAt = zonedTimeToUtc('2026-10-19', '11:30', defaultTz);

      const result = await AvailabilityService.checkAvailability({
        resourceId: testResource._id,
        startAt,
        endAt,
      });

      assert.strictEqual(result.available, false);
      assert.strictEqual(result.reason, 'TIMETABLE_CONFLICT');
    });

    it('TT-13 should NOT expose course details or instructor on public availability queries (Privacy Invariant)', async () => {
      const startAt = zonedTimeToUtc('2026-10-19', '10:30', defaultTz).toISOString();
      const endAt = zonedTimeToUtc('2026-10-19', '11:30', defaultTz).toISOString();

      const res = await fetch(
        `${baseUrl}/api/bookings/availability?resourceId=${testResource._id.toString()}&startAt=${startAt}&endAt=${endAt}`
      );

      assert.strictEqual(res.status, 200);
      const json = await res.json();
      assert.strictEqual(json.data.available, false);
      assert.strictEqual(json.data.reason, 'TIMETABLE_CONFLICT');

      // DECISION 3: Course title, course code, instructor name MUST NOT be leaked publicly
      const stringified = JSON.stringify(json);
      assert.strictEqual(stringified.includes('CS-401'), false, 'Leaked courseCode in public response');
      assert.strictEqual(stringified.includes('Advanced Distributed Systems'), false, 'Leaked courseTitle');
      assert.strictEqual(stringified.includes('Leslie Lamport'), false, 'Leaked instructorName');
    });

    it('TT-14 should allow adjacent interval ending when timetable session begins (No Conflict)', async () => {
      // Touching interval: 09:00 - 10:00 (Timetable begins at 10:00)
      const startAt = zonedTimeToUtc('2026-10-19', '09:00', defaultTz);
      const endAt = zonedTimeToUtc('2026-10-19', '10:00', defaultTz);

      const result = await AvailabilityService.checkAvailability({
        resourceId: testResource._id,
        startAt,
        endAt,
      });

      assert.strictEqual(result.available, true);
    });

    it('TT-15 should allow adjacent interval starting when timetable session ends (No Conflict)', async () => {
      // Touching interval: 12:00 - 13:00 (Timetable ends at 12:00)
      const startAt = zonedTimeToUtc('2026-10-19', '12:00', defaultTz);
      const endAt = zonedTimeToUtc('2026-10-19', '13:00', defaultTz);

      const result = await AvailabilityService.checkAvailability({
        resourceId: testResource._id,
        startAt,
        endAt,
      });

      assert.strictEqual(result.available, true);
    });

    it('TT-16 should NOT block availability when timetable entry is unpublished (isPublished: false)', async () => {
      // Create an unpublished timetable entry
      await TimetableEntry.create({
        resource: testResource._id,
        academicTerm: `${TEST_PREFIX}2026-FALL`,
        courseCode: 'CS-UNPUBLISHED',
        courseTitle: 'Draft Course',
        startAt: zonedTimeToUtc('2026-10-19', '14:00', defaultTz),
        endAt: zonedTimeToUtc('2026-10-19', '16:00', defaultTz),
        timezone: defaultTz,
        isPublished: false, // Unpublished draft!
        version: 1,
        publicationBatchId: 'batch-draft',
      });

      const startAt = zonedTimeToUtc('2026-10-19', '14:00', defaultTz);
      const endAt = zonedTimeToUtc('2026-10-19', '15:00', defaultTz);

      const result = await AvailabilityService.checkAvailability({
        resourceId: testResource._id,
        startAt,
        endAt,
      });

      assert.strictEqual(result.available, true);
    });

    it('TT-17 should mark timetable-occupied intervals as unavailable in calculateSlots', async () => {
      const slots = await AvailabilityService.calculateSlots({
        resourceId: testResource._id,
        date: '2026-10-19',
        slotDurationMinutes: 60,
      });

      assert.ok(slots.length > 0);

      // Slot 10:00 - 11:00 overlaps timetable [10:00, 12:00)
      const slot10 = slots.find((s) => s.startTime === '10:00');
      assert.ok(slot10);
      assert.strictEqual(slot10.available, false);
      assert.strictEqual(slot10.reason, 'TIMETABLE_CONFLICT');

      // Slot 11:00 - 12:00 overlaps timetable [10:00, 12:00)
      const slot11 = slots.find((s) => s.startTime === '11:00');
      assert.ok(slot11);
      assert.strictEqual(slot11.available, false);
      assert.strictEqual(slot11.reason, 'TIMETABLE_CONFLICT');

      // Slot 09:00 - 10:00 is adjacent and must be AVAILABLE
      const slot09 = slots.find((s) => s.startTime === '09:00');
      assert.ok(slot09);
      assert.strictEqual(slot09.available, true);
    });
  });

  // =========================================================================
  // SECTION 4: DIRECT RESERVATION WRITE-PATH PROTECTION
  // =========================================================================
  describe('4. Reservation Write-Path Enforcement', () => {
    beforeEach(async () => {
      // Published lecture: 2026-10-19 14:00 - 16:00
      await TimetableEntry.create({
        resource: testResource._id,
        academicTerm: `${TEST_PREFIX}2026-FALL`,
        courseCode: 'CS-500',
        courseTitle: 'Quantum Algorithms',
        startAt: zonedTimeToUtc('2026-10-19', '14:00', defaultTz),
        endAt: zonedTimeToUtc('2026-10-19', '16:00', defaultTz),
        timezone: defaultTz,
        isPublished: true,
        version: 1,
        publicationBatchId: 'batch-wp-01',
      });
    });

    it('TT-18 should reject direct call to ReservationService.createReservation on timetable overlap (409 Conflict)', async () => {
      const startAt = zonedTimeToUtc('2026-10-19', '14:30', defaultTz);
      const endAt = zonedTimeToUtc('2026-10-19', '15:30', defaultTz);

      await assert.rejects(
        async () => {
          await ReservationService.createReservation({
            resourceId: testResource._id,
            userId: studentUser._id,
            startAt,
            endAt,
            timezone: defaultTz,
            title: `${TEST_PREFIX}Malicious Bypass Attempt`,
          });
        },
        (err: any) => {
          assert.strictEqual(err.statusCode, 409);
          assert.match(err.message, /conflicts with an academic timetable session/);
          return true;
        }
      );

      // Verify transaction committed zero records
      const saved = await Reservation.find({ title: `${TEST_PREFIX}Malicious Bypass Attempt` });
      assert.strictEqual(saved.length, 0);
    });

    it('TT-19 should reject HTTP POST /api/bookings attempting to book timetable interval (409 Conflict)', async () => {
      const startAt = zonedTimeToUtc('2026-10-19', '14:00', defaultTz).toISOString();
      const endAt = zonedTimeToUtc('2026-10-19', '15:00', defaultTz).toISOString();

      const res = await fetch(`${baseUrl}/api/bookings`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${studentToken}`,
        },
        body: JSON.stringify({
          resourceId: testResource._id.toString(),
          startAt,
          endAt,
          timezone: defaultTz,
          title: `${TEST_PREFIX}HTTP Bypass Attempt`,
        }),
      });

      assert.strictEqual(res.status, 409);
      const json = await res.json();
      assert.strictEqual(json.success, false);
      assert.match(json.error.message, /conflicts with an academic timetable session/);
    });
  });

  // =========================================================================
  // SECTION 5: REPUBLICATION SUPERSESSION & RESERVATION CANCELLATION
  // =========================================================================
  describe('5. Republication Supersession & Conflict Policy (Decision 2)', () => {
    it('TT-20 should automatically cancel conflicting active reservation with SUPERSEDED_BY_TIMETABLE_REPUBLICATION', async () => {
      // 1. Create confirmed ad-hoc student booking for 2026-10-20 10:00 - 11:30
      const startAt = zonedTimeToUtc('2026-10-20', '10:00', defaultTz);
      const endAt = zonedTimeToUtc('2026-10-20', '11:30', defaultTz);

      const reservation = await ReservationService.createReservation({
        resourceId: testResource._id,
        userId: studentUser._id,
        startAt,
        endAt,
        timezone: defaultTz,
        title: `${TEST_PREFIX}Active Student Booking`,
      });

      assert.strictEqual(reservation.status, ReservationStatus.CONFIRMED);

      // 2. Academic timetable republishes: Course scheduled in same room 10:30 - 12:00
      const syncResult = await TimetableService.syncTimetable(
        {
          academicTerm: `${TEST_PREFIX}2026-FALL`,
          version: 1,
          publicationBatchId: 'batch-repub-01',
          entries: [
            {
              resourceCode: testResource.code,
              courseCode: 'CS-601',
              courseTitle: 'Compilers',
              startAt: zonedTimeToUtc('2026-10-20', '10:30', defaultTz).toISOString(),
              endAt: zonedTimeToUtc('2026-10-20', '12:00', defaultTz).toISOString(),
              timezone: defaultTz,
            },
          ],
        },
        adminUser._id
      );

      assert.strictEqual(syncResult.cancelledReservationsCount, 1);
      assert.strictEqual(syncResult.conflictsDetected, 1);

      // 3. Inspect reservation state in MongoDB
      const updatedReservation = await Reservation.findById(reservation._id);
      assert.ok(updatedReservation);
      assert.strictEqual(updatedReservation.status, ReservationStatus.CANCELLED);
      assert.strictEqual(
        updatedReservation.cancellationReason,
        'SUPERSEDED_BY_TIMETABLE_REPUBLICATION'
      );
      assert.strictEqual(updatedReservation.cancelledBy?.toString(), adminUser._id.toString());
      assert.ok(updatedReservation.cancelledAt);
      assert.strictEqual(updatedReservation.metadata?.supersededByTimetable, true);
    });

    it('TT-21 should NOT modify already completed or already cancelled reservations', async () => {
      const startAt = zonedTimeToUtc('2026-10-20', '14:00', defaultTz);
      const endAt = zonedTimeToUtc('2026-10-20', '15:00', defaultTz);

      // Create a completed reservation
      const completedRes = await Reservation.create({
        resource: testResource._id,
        user: studentUser._id,
        startAt,
        endAt,
        timezone: defaultTz,
        status: ReservationStatus.COMPLETED,
        title: `${TEST_PREFIX}Completed Booking`,
      });

      // Create an already cancelled reservation
      const cancelledRes = await Reservation.create({
        resource: testResource._id,
        user: studentUser._id,
        startAt,
        endAt,
        timezone: defaultTz,
        status: ReservationStatus.CANCELLED,
        cancellationReason: 'USER_CANCELLED',
        title: `${TEST_PREFIX}Already Cancelled Booking`,
      });

      // Sync timetable overlapping the same period
      await TimetableService.syncTimetable(
        {
          academicTerm: `${TEST_PREFIX}2026-FALL`,
          version: 2,
          publicationBatchId: 'batch-repub-02',
          entries: [
            {
              resourceCode: testResource.code,
              courseCode: 'CS-701',
              courseTitle: 'Security Architecture',
              startAt: startAt.toISOString(),
              endAt: endAt.toISOString(),
              timezone: defaultTz,
            },
          ],
        },
        adminUser._id
      );

      // Verify terminal records were left untouched
      const checkCompleted = await Reservation.findById(completedRes._id);
      assert.strictEqual(checkCompleted?.status, ReservationStatus.COMPLETED);

      const checkCancelled = await Reservation.findById(cancelledRes._id);
      assert.strictEqual(checkCancelled?.status, ReservationStatus.CANCELLED);
      assert.strictEqual(checkCancelled?.cancellationReason, 'USER_CANCELLED');
    });
  });

  // =========================================================================
  // SECTION 6: SECURITY & ROLE-BASED ACCESS CONTROL
  // =========================================================================
  describe('6. Security & Role-Based Access Control', () => {
    it('TT-22 should reject unauthenticated sync requests with 401 Unauthorized', async () => {
      const res = await fetch(`${baseUrl}/api/timetables/sync`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ academicTerm: '2026-FALL', version: 1 }),
      });
      assert.strictEqual(res.status, 401);
    });

    it('TT-23 should reject non-admin users attempting timetable sync with 403 Forbidden', async () => {
      const res = await fetch(`${baseUrl}/api/timetables/sync`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${studentToken}`,
        },
        body: JSON.stringify({
          academicTerm: `${TEST_PREFIX}2026-FALL`,
          version: 1,
          publicationBatchId: 'batch-hack',
          entries: [
            {
              resourceCode: testResource.code,
              courseCode: 'CS-101',
              courseTitle: 'Unauthorized Course',
              startAt: '2026-10-05T09:00:00.000Z',
              endAt: '2026-10-05T10:00:00.000Z',
              timezone: 'UTC',
            },
          ],
        }),
      });
      assert.strictEqual(res.status, 403);
    });

    it('TT-24 should allow authenticated users to view timetable entries via GET /api/timetables', async () => {
      // Stage entry
      await TimetableEntry.create({
        resource: testResource._id,
        academicTerm: `${TEST_PREFIX}2026-FALL`,
        courseCode: 'CS-801',
        courseTitle: 'Robotics',
        startAt: new Date('2026-10-05T09:00:00.000Z'),
        endAt: new Date('2026-10-05T10:00:00.000Z'),
        timezone: 'UTC',
        isPublished: true,
        version: 1,
        publicationBatchId: 'batch-view',
      });

      const res = await fetch(
        `${baseUrl}/api/timetables?academicTerm=${TEST_PREFIX}2026-FALL`,
        {
          headers: { Authorization: `Bearer ${studentToken}` },
        }
      );

      assert.strictEqual(res.status, 200);
      const json = await res.json();
      assert.strictEqual(json.success, true);
      assert.strictEqual(json.data.total, 1);
      assert.strictEqual(json.data.entries[0].courseCode, 'CS-801');
    });

    it('TT-25 should restrict conflict audit GET /api/timetables/conflicts to ADMIN & FACILITY_MANAGER', async () => {
      // Student is forbidden
      const resStudent = await fetch(`${baseUrl}/api/timetables/conflicts`, {
        headers: { Authorization: `Bearer ${studentToken}` },
      });
      assert.strictEqual(resStudent.status, 403);

      // Facility manager is allowed
      const resFM = await fetch(`${baseUrl}/api/timetables/conflicts`, {
        headers: { Authorization: `Bearer ${facilityManagerToken}` },
      });
      assert.strictEqual(resFM.status, 200);

      // Admin is allowed
      const resAdmin = await fetch(`${baseUrl}/api/timetables/conflicts`, {
        headers: { Authorization: `Bearer ${adminToken}` },
      });
      assert.strictEqual(resAdmin.status, 200);
    });
  });

  // =========================================================================
  // SECTION 7: BOOKING VS TIMETABLE SYNC CONCURRENCY
  // =========================================================================
  describe('7. Concurrency & Race Serialization (Real MongoDB Transactions)', () => {
    it('TT-26 Race Case A: Timetable sync commits first -> concurrent booking is rejected', async () => {
      const slotStart = zonedTimeToUtc('2026-10-22', '09:00', defaultTz);
      const slotEnd = zonedTimeToUtc('2026-10-22', '10:30', defaultTz);

      // Thread 1: Sync commits
      await TimetableService.syncTimetable(
        {
          academicTerm: `${TEST_PREFIX}2026-FALL`,
          version: 1,
          publicationBatchId: 'batch-race-a',
          entries: [
            {
              resourceCode: testResource.code,
              courseCode: 'CS-RACE',
              courseTitle: 'Race Condition Class',
              startAt: slotStart.toISOString(),
              endAt: slotEnd.toISOString(),
              timezone: defaultTz,
            },
          ],
        },
        adminUser._id
      );

      // Thread 2: Booking attempts same slot immediately
      const res = await fetch(`${baseUrl}/api/bookings`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${studentToken}`,
        },
        body: JSON.stringify({
          resourceId: testResource._id.toString(),
          startAt: slotStart.toISOString(),
          endAt: slotEnd.toISOString(),
          timezone: defaultTz,
          title: `${TEST_PREFIX}Simultaneous Booking Attempt`,
        }),
      });

      assert.strictEqual(res.status, 409);
    });

    it('TT-27 Race Case B: Booking commits first -> timetable sync supersedes and cancels it', async () => {
      const slotStart = zonedTimeToUtc('2026-10-22', '14:00', defaultTz);
      const slotEnd = zonedTimeToUtc('2026-10-22', '15:30', defaultTz);

      // Thread 1: Booking commits
      const booking = await ReservationService.createReservation({
        resourceId: testResource._id,
        userId: studentUser._id,
        startAt: slotStart,
        endAt: slotEnd,
        timezone: defaultTz,
        title: `${TEST_PREFIX}Pre-existing Booking`,
      });
      assert.strictEqual(booking.status, ReservationStatus.CONFIRMED);

      // Thread 2: Timetable sync publishes over the slot
      const syncResult = await TimetableService.syncTimetable(
        {
          academicTerm: `${TEST_PREFIX}2026-FALL`,
          version: 2,
          publicationBatchId: 'batch-race-b',
          entries: [
            {
              resourceCode: testResource.code,
              courseCode: 'CS-SUPERSEDING',
              courseTitle: 'Superseding Course',
              startAt: slotStart.toISOString(),
              endAt: slotEnd.toISOString(),
              timezone: defaultTz,
            },
          ],
        },
        adminUser._id
      );

      assert.strictEqual(syncResult.cancelledReservationsCount, 1);

      // Booking is now cancelled
      const freshBooking = await Reservation.findById(booking._id);
      assert.strictEqual(freshBooking?.status, ReservationStatus.CANCELLED);
      assert.strictEqual(freshBooking?.cancellationReason, 'SUPERSEDED_BY_TIMETABLE_REPUBLICATION');
    });

    it('TT-28 Concurrency Stress: 5 simultaneous booking attempts on timetable slot -> ALL 5 rejected', async () => {
      const slotStart = zonedTimeToUtc('2026-10-23', '10:00', defaultTz);
      const slotEnd = zonedTimeToUtc('2026-10-23', '11:00', defaultTz);

      // Publish timetable session
      await TimetableEntry.create({
        resource: testResource._id,
        academicTerm: `${TEST_PREFIX}2026-FALL`,
        courseCode: 'CS-STRESS',
        courseTitle: 'Concurrency Testing',
        startAt: slotStart,
        endAt: slotEnd,
        timezone: defaultTz,
        isPublished: true,
        version: 1,
        publicationBatchId: 'batch-stress',
      });

      // Fire 5 simultaneous booking requests for the exact same slot
      const requests = Array.from({ length: 5 }, (_, i) =>
        fetch(`${baseUrl}/api/bookings`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${studentToken}`,
          },
          body: JSON.stringify({
            resourceId: testResource._id.toString(),
            startAt: slotStart.toISOString(),
            endAt: slotEnd.toISOString(),
            timezone: defaultTz,
            title: `${TEST_PREFIX}Stress Race ${i + 1}`,
          }),
        }).then(async (res) => ({ status: res.status, json: await res.json() }))
      );

      const results = await Promise.all(requests);
      const rejectedCount = results.filter((r) => r.status === 409).length;

      // 100% of conflicting bookings must be rejected
      assert.strictEqual(rejectedCount, 5, `All 5 concurrent requests must be rejected with 409, got ${rejectedCount}`);

      // Zero reservations committed to MongoDB
      const inDb = await Reservation.find({ title: new RegExp(`^${TEST_PREFIX}Stress Race`) });
      assert.strictEqual(inDb.length, 0);
    });
  });
});
