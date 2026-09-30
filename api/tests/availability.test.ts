/**
 * CampusFlow API - AvailabilityRule, Blackout & Quota Domain Models Integration Tests
 * Validates AvailabilityRule (windows, required booking policy, 24:00 midnight semantics),
 * Blackout (UTC instants, 8-case half-open overlap semantics),
 * Quota (scope/subject matrix, deterministic IANA timezone, positive integer limits),
 * and Department Canonicalization & Collation.
 *
 * TEST ISOLATION:
 * Operates strictly on the dedicated, isolated test database (`campusflow_test`),
 * leaving the primary developer database (`campusflow`) completely untouched.
 */

import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import mongoose, { Types } from 'mongoose';
import { connectDatabase, disconnectDatabase, isDatabaseConnected } from '../src/config/database';
import { env } from '../src/config/env';
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
  isValidCalendarDate,
  timeStringToMinutes,
  normalizeDepartmentName,
} from '../src/models';

describe('CampusFlow Availability, Blackout & Quota Integration Tests (Phase 2.4B Corrected)', () => {
  const TEST_PREFIX = 'test_phase24b_';
  let sharedResourceId: Types.ObjectId;
  let sharedResourceTypeId: Types.ObjectId;
  let sharedUserId: Types.ObjectId;

  const defaultBookingPolicy = {
    minDurationMinutes: 30,
    maxDurationMinutes: 120,
  };

  const createdRuleIds: string[] = [];
  const createdBlackoutIds: string[] = [];
  const createdQuotaIds: string[] = [];
  const createdResourceIds: string[] = [];
  const createdResourceTypeIds: string[] = [];
  const createdUserIds: string[] = [];

  before(async () => {
    // 1. Strictly connect to the isolated test database
    await connectDatabase(env.MONGODB_TEST_URI);
    assert.strictEqual(isDatabaseConnected(), true, 'Database must be connected for integration tests');

    const connectedDb = mongoose.connection.db?.databaseName;
    assert.strictEqual(
      connectedDb,
      'campusflow_test',
      `Integration tests must run exclusively on isolated test database (connected to: "${connectedDb}")`
    );

    // 2. Synchronize indexes exclusively on the test database
    await Promise.all([
      AvailabilityRule.syncIndexes(),
      Blackout.syncIndexes(),
      Quota.syncIndexes(),
      Resource.syncIndexes(),
      ResourceType.syncIndexes(),
      User.syncIndexes(),
    ]);

    // 3. Create shared base fixture documents for referential integrity
    const user = await User.create({
      name: 'Fixture User',
      email: `${TEST_PREFIX}user_${Date.now()}@campusflow.edu`,
      roles: [UserRole.FACULTY],
      department: 'Computer Science',
    });
    sharedUserId = user._id;
    createdUserIds.push(user._id.toString());

    const resourceType = await ResourceType.create({
      name: 'Fixture Lab Type',
      code: `FIXTURE_RT_${Date.now()}`,
      category: ResourceCategory.LABORATORY,
    });
    sharedResourceTypeId = resourceType._id;
    createdResourceTypeIds.push(resourceType._id.toString());

    const resource = await Resource.create({
      name: 'Fixture Lab Room 101',
      code: `FIXTURE_RES_${Date.now()}`,
      resourceType: sharedResourceTypeId,
      capacity: 35,
      location: { building: 'Science Hall', roomNumber: '101' },
      status: ResourceStatus.ACTIVE,
    });
    sharedResourceId = resource._id;
    createdResourceIds.push(resource._id.toString());
  });

  after(async () => {
    // Clean up all created test records strictly inside the test database
    if (isDatabaseConnected()) {
      const currentDb = mongoose.connection.db?.databaseName;
      assert.strictEqual(
        currentDb,
        'campusflow_test',
        'Cleanup must only occur on the isolated test database'
      );

      if (createdRuleIds.length > 0) {
        await AvailabilityRule.deleteMany({ _id: { $in: createdRuleIds } });
      }
      if (createdBlackoutIds.length > 0) {
        await Blackout.deleteMany({ _id: { $in: createdBlackoutIds } });
      }
      if (createdQuotaIds.length > 0) {
        await Quota.deleteMany({ _id: { $in: createdQuotaIds } });
      }
      if (createdResourceIds.length > 0) {
        await Resource.deleteMany({ _id: { $in: createdResourceIds } });
      }
      if (createdResourceTypeIds.length > 0) {
        await ResourceType.deleteMany({ _id: { $in: createdResourceTypeIds } });
      }
      if (createdUserIds.length > 0) {
        await User.deleteMany({ _id: { $in: createdUserIds } });
      }
    }

    await disconnectDatabase();
  });

  // ==========================================
  // MODEL 1: AVAILABILITY RULE - OPERATING WINDOWS & TIMEZONE
  // ==========================================
  describe('AvailabilityRule Model - Operating Windows & Timezone', () => {
    it('should create a valid AvailabilityRule with a single window and valid IANA timezone', async () => {
      const rule = await AvailabilityRule.create({
        resource: sharedResourceId,
        name: 'Standard Working Hours',
        timezone: 'Asia/Kolkata',
        windows: [
          {
            dayOfWeek: DayOfWeek.MONDAY,
            startTime: '09:00',
            endTime: '17:00',
          },
        ],
        bookingPolicy: defaultBookingPolicy,
        effectiveFrom: '2026-08-01',
        effectiveTo: '2026-12-31',
        isActive: true,
      });
      createdRuleIds.push(rule._id.toString());

      assert.ok(rule._id);
      assert.strictEqual(rule.resource.toString(), sharedResourceId.toString());
      assert.strictEqual(rule.name, 'Standard Working Hours');
      assert.strictEqual(rule.timezone, 'Asia/Kolkata');
      assert.strictEqual(rule.windows.length, 1);
      assert.strictEqual(rule.windows[0].dayOfWeek, 'MONDAY');
      assert.strictEqual(rule.windows[0].startTime, '09:00');
      assert.strictEqual(rule.windows[0].endTime, '17:00');
      assert.strictEqual(rule.effectiveFrom, '2026-08-01');
      assert.strictEqual(rule.effectiveTo, '2026-12-31');
      assert.strictEqual(rule.isActive, true);
    });

    it('should support multiple weekly windows across all days of the week', async () => {
      const allDays = Object.values(DayOfWeek);
      const windows = allDays.map((day) => ({
        dayOfWeek: day,
        startTime: '08:00',
        endTime: '20:00',
      }));

      const rule = await AvailabilityRule.create({
        resource: sharedResourceId,
        name: 'Full Week Operational Hours',
        timezone: 'America/New_York',
        windows,
        bookingPolicy: defaultBookingPolicy,
      });
      createdRuleIds.push(rule._id.toString());

      assert.strictEqual(rule.windows.length, 7);
      assert.deepStrictEqual(
        rule.windows.map((w) => w.dayOfWeek),
        allDays
      );
    });

    it('should reject invalid IANA timezones (e.g., IST, EST, invalid string)', async () => {
      await assert.rejects(
        async () => {
          await AvailabilityRule.create({
            resource: sharedResourceId,
            name: 'Invalid Timezone Rule',
            timezone: 'IST',
            windows: [{ dayOfWeek: DayOfWeek.MONDAY, startTime: '09:00', endTime: '12:00' }],
            bookingPolicy: defaultBookingPolicy,
          });
        },
        /Invalid IANA timezone identifier/
      );

      await assert.rejects(
        async () => {
          await AvailabilityRule.create({
            resource: sharedResourceId,
            name: 'Gibberish Timezone Rule',
            timezone: 'Invalid/NonExistent_Zone',
            windows: [{ dayOfWeek: DayOfWeek.MONDAY, startTime: '09:00', endTime: '12:00' }],
            bookingPolicy: defaultBookingPolicy,
          });
        },
        /Invalid IANA timezone identifier/
      );
    });

    it('should reject invalid HH:mm formats (9:00, 25:00, 12:99)', async () => {
      await assert.rejects(
        async () => {
          await AvailabilityRule.create({
            resource: sharedResourceId,
            name: 'Bad Time Format Rule 1',
            timezone: 'UTC',
            windows: [{ dayOfWeek: DayOfWeek.MONDAY, startTime: '9:00', endTime: '17:00' }],
            bookingPolicy: defaultBookingPolicy,
          });
        },
        /startTime must be in strict 24-hour HH:mm format/
      );

      await assert.rejects(
        async () => {
          await AvailabilityRule.create({
            resource: sharedResourceId,
            name: 'Bad Time Format Rule 2',
            timezone: 'UTC',
            windows: [{ dayOfWeek: DayOfWeek.MONDAY, startTime: '09:00', endTime: '25:00' }],
            bookingPolicy: defaultBookingPolicy,
          });
        },
        /endTime must be in strict 24-hour HH:mm format/
      );

      await assert.rejects(
        async () => {
          await AvailabilityRule.create({
            resource: sharedResourceId,
            name: 'Bad Time Format Rule 3',
            timezone: 'UTC',
            windows: [{ dayOfWeek: DayOfWeek.MONDAY, startTime: '09:00', endTime: '12:99' }],
            bookingPolicy: defaultBookingPolicy,
          });
        },
        /endTime must be in strict 24-hour HH:mm format/
      );
    });

    it('should reject exact duplicate windows within the same rule', async () => {
      await assert.rejects(
        async () => {
          await AvailabilityRule.create({
            resource: sharedResourceId,
            name: 'Duplicate Windows Rule',
            timezone: 'UTC',
            windows: [
              { dayOfWeek: DayOfWeek.TUESDAY, startTime: '09:00', endTime: '12:00' },
              { dayOfWeek: DayOfWeek.TUESDAY, startTime: '09:00', endTime: '12:00' },
            ],
            bookingPolicy: defaultBookingPolicy,
          });
        },
        /Duplicate availability window detected: TUESDAY 09:00-12:00/
      );
    });

    it('should reject missing required resource reference', async () => {
      await assert.rejects(
        async () => {
          // @ts-expect-error Missing resource
          await AvailabilityRule.create({
            name: 'No Resource Rule',
            timezone: 'UTC',
            bookingPolicy: defaultBookingPolicy,
          });
        },
        /Resource reference is required for availability rule/
      );
    });

    it('should support valid inactive availability rule', async () => {
      const inactiveRule = await AvailabilityRule.create({
        resource: sharedResourceId,
        name: 'Archived Summer Schedule',
        timezone: 'UTC',
        isActive: false,
        windows: [{ dayOfWeek: DayOfWeek.SATURDAY, startTime: '10:00', endTime: '14:00' }],
        bookingPolicy: defaultBookingPolicy,
      });
      createdRuleIds.push(inactiveRule._id.toString());
      assert.strictEqual(inactiveRule.isActive, false);
    });
  });

  // ==========================================
  // ITEM 1: BOOKING POLICY SUBDOCUMENT TESTS & PARENT REQUIRED ENFORCEMENT
  // ==========================================
  describe('AvailabilityRule Model - Booking Policy Subdocument', () => {
    it('should reject AvailabilityRule when bookingPolicy is missing at the parent schema level', async () => {
      await assert.rejects(
        async () => {
          // @ts-expect-error Missing required bookingPolicy
          await AvailabilityRule.create({
            resource: sharedResourceId,
            name: 'Missing Booking Policy Rule',
            timezone: 'UTC',
            windows: [{ dayOfWeek: DayOfWeek.MONDAY, startTime: '09:00', endTime: '17:00' }],
          });
        },
        /bookingPolicy is required for availability rule/
      );
    });

    it('should create an AvailabilityRule with a valid bookingPolicy subdocument', async () => {
      const rule = await AvailabilityRule.create({
        resource: sharedResourceId,
        name: 'Rules with Policy',
        timezone: 'Europe/London',
        windows: [{ dayOfWeek: DayOfWeek.WEDNESDAY, startTime: '09:00', endTime: '18:00' }],
        bookingPolicy: {
          minDurationMinutes: 30,
          maxDurationMinutes: 180,
          minLeadTimeMinutes: 60,
          maxAdvanceBookingDays: 14,
        },
      });
      createdRuleIds.push(rule._id.toString());

      assert.ok(rule.bookingPolicy);
      assert.strictEqual(rule.bookingPolicy.minDurationMinutes, 30);
      assert.strictEqual(rule.bookingPolicy.maxDurationMinutes, 180);
      assert.strictEqual(rule.bookingPolicy.minLeadTimeMinutes, 60);
      assert.strictEqual(rule.bookingPolicy.maxAdvanceBookingDays, 14);
    });

    it('should apply defaults for optional bookingPolicy fields', async () => {
      const rule = await AvailabilityRule.create({
        resource: sharedResourceId,
        name: 'Rules with Partial Policy',
        timezone: 'Europe/London',
        windows: [{ dayOfWeek: DayOfWeek.THURSDAY, startTime: '09:00', endTime: '17:00' }],
        bookingPolicy: {
          minDurationMinutes: 15,
          maxDurationMinutes: 120,
        },
      });
      createdRuleIds.push(rule._id.toString());

      assert.ok(rule.bookingPolicy);
      assert.strictEqual(rule.bookingPolicy.minLeadTimeMinutes, 0);
      assert.strictEqual(rule.bookingPolicy.maxAdvanceBookingDays, 30);
    });

    it('should reject bookingPolicy when minDurationMinutes > maxDurationMinutes', async () => {
      await assert.rejects(
        async () => {
          await AvailabilityRule.create({
            resource: sharedResourceId,
            name: 'Inverted Duration Policy Rule',
            timezone: 'UTC',
            windows: [{ dayOfWeek: DayOfWeek.MONDAY, startTime: '09:00', endTime: '17:00' }],
            bookingPolicy: {
              minDurationMinutes: 120,
              maxDurationMinutes: 60,
            },
          });
        },
        /minDurationMinutes \(120\) cannot exceed maxDurationMinutes \(60\)/
      );
    });

    it('should reject bookingPolicy with non-positive duration values', async () => {
      await assert.rejects(
        async () => {
          await AvailabilityRule.create({
            resource: sharedResourceId,
            name: 'Zero Min Duration Rule',
            timezone: 'UTC',
            windows: [{ dayOfWeek: DayOfWeek.MONDAY, startTime: '09:00', endTime: '17:00' }],
            bookingPolicy: {
              minDurationMinutes: 0,
              maxDurationMinutes: 60,
            },
          });
        },
        /minDurationMinutes must be a positive integer/
      );

      await assert.rejects(
        async () => {
          await AvailabilityRule.create({
            resource: sharedResourceId,
            name: 'Negative Max Duration Rule',
            timezone: 'UTC',
            windows: [{ dayOfWeek: DayOfWeek.MONDAY, startTime: '09:00', endTime: '17:00' }],
            bookingPolicy: {
              minDurationMinutes: 15,
              maxDurationMinutes: -30,
            },
          });
        },
        /maxDurationMinutes must be a positive integer/
      );
    });

    it('should reject negative minLeadTimeMinutes or negative maxAdvanceBookingDays', async () => {
      await assert.rejects(
        async () => {
          await AvailabilityRule.create({
            resource: sharedResourceId,
            name: 'Negative Lead Time Rule',
            timezone: 'UTC',
            windows: [{ dayOfWeek: DayOfWeek.MONDAY, startTime: '09:00', endTime: '17:00' }],
            bookingPolicy: {
              minDurationMinutes: 30,
              maxDurationMinutes: 60,
              minLeadTimeMinutes: -10,
            },
          });
        },
        /minLeadTimeMinutes must be a non-negative integer/
      );

      await assert.rejects(
        async () => {
          await AvailabilityRule.create({
            resource: sharedResourceId,
            name: 'Negative Advance Days Rule',
            timezone: 'UTC',
            windows: [{ dayOfWeek: DayOfWeek.MONDAY, startTime: '09:00', endTime: '17:00' }],
            bookingPolicy: {
              minDurationMinutes: 30,
              maxDurationMinutes: 60,
              maxAdvanceBookingDays: -1,
            },
          });
        },
        /maxAdvanceBookingDays must be a non-negative integer/
      );
    });
  });

  // ==========================================
  // CORRECTION 2: MIDNIGHT / 24:00 SEMANTICS TESTS
  // ==========================================
  describe('AvailabilityRule Model - Midnight / 24:00 Semantics', () => {
    it('should accept 22:00 -> 24:00 as a valid end-of-day boundary window', async () => {
      const rule = await AvailabilityRule.create({
        resource: sharedResourceId,
        name: 'Late Night Window',
        timezone: 'Asia/Kolkata',
        windows: [{ dayOfWeek: DayOfWeek.FRIDAY, startTime: '22:00', endTime: '24:00' }],
        bookingPolicy: defaultBookingPolicy,
      });
      createdRuleIds.push(rule._id.toString());

      assert.strictEqual(rule.windows[0].startTime, '22:00');
      assert.strictEqual(rule.windows[0].endTime, '24:00');
      assert.strictEqual(timeStringToMinutes('24:00'), 1440);
    });

    it('should accept 00:00 -> 24:00 as a full 24-hour operational window', async () => {
      const rule = await AvailabilityRule.create({
        resource: sharedResourceId,
        name: 'Round the Clock Operations',
        timezone: 'UTC',
        windows: [{ dayOfWeek: DayOfWeek.MONDAY, startTime: '00:00', endTime: '24:00' }],
        bookingPolicy: defaultBookingPolicy,
      });
      createdRuleIds.push(rule._id.toString());

      assert.strictEqual(rule.windows[0].startTime, '00:00');
      assert.strictEqual(rule.windows[0].endTime, '24:00');
    });

    it('should accept 23:59 -> 24:00 as a valid 1-minute window', async () => {
      const rule = await AvailabilityRule.create({
        resource: sharedResourceId,
        name: 'Final Minute Window',
        timezone: 'UTC',
        windows: [{ dayOfWeek: DayOfWeek.SUNDAY, startTime: '23:59', endTime: '24:00' }],
        bookingPolicy: defaultBookingPolicy,
      });
      createdRuleIds.push(rule._id.toString());

      assert.strictEqual(rule.windows[0].startTime, '23:59');
      assert.strictEqual(rule.windows[0].endTime, '24:00');
    });

    it('should reject 24:00 as a startTime (24:00 -> 24:00 and 24:00 -> 02:00)', async () => {
      await assert.rejects(
        async () => {
          await AvailabilityRule.create({
            resource: sharedResourceId,
            name: '24:00 Start Boundary Rule',
            timezone: 'UTC',
            windows: [{ dayOfWeek: DayOfWeek.SATURDAY, startTime: '24:00', endTime: '24:00' }],
            bookingPolicy: defaultBookingPolicy,
          });
        },
        /startTime must be in strict 24-hour HH:mm format between 00:00 and 23:59/
      );

      await assert.rejects(
        async () => {
          await AvailabilityRule.create({
            resource: sharedResourceId,
            name: '24:00 Rollover Window Rule',
            timezone: 'UTC',
            windows: [{ dayOfWeek: DayOfWeek.SATURDAY, startTime: '24:00', endTime: '02:00' }],
            bookingPolicy: defaultBookingPolicy,
          });
        },
        /startTime must be in strict 24-hour HH:mm format between 00:00 and 23:59/
      );
    });

    it('should reject window when startTime >= endTime (e.g., 17:00 -> 09:00 or 10:00 -> 10:00)', async () => {
      await assert.rejects(
        async () => {
          await AvailabilityRule.create({
            resource: sharedResourceId,
            name: 'Inverted Times Rule',
            timezone: 'UTC',
            windows: [{ dayOfWeek: DayOfWeek.FRIDAY, startTime: '17:00', endTime: '09:00' }],
            bookingPolicy: defaultBookingPolicy,
          });
        },
        /Availability window startTime \(17:00\) must be earlier than endTime \(09:00\)/
      );

      await assert.rejects(
        async () => {
          await AvailabilityRule.create({
            resource: sharedResourceId,
            name: 'Zero Length Window Rule',
            timezone: 'UTC',
            windows: [{ dayOfWeek: DayOfWeek.FRIDAY, startTime: '10:00', endTime: '10:00' }],
            bookingPolicy: defaultBookingPolicy,
          });
        },
        /Availability window startTime \(10:00\) must be earlier than endTime \(10:00\)/
      );
    });
  });

  // ==========================================
  // ITEM 3: REAL CALENDAR DATE VALIDATION & 0000-0099 FOUR-DIGIT YEARS
  // ==========================================
  describe('AvailabilityRule & Quota Models - Real Calendar Date Validation', () => {
    it('should validate calendar dates using helper with leap year support and 0000-0099 years', () => {
      assert.strictEqual(isValidCalendarDate('2026-02-28'), true);
      assert.strictEqual(isValidCalendarDate('2028-02-29'), true); // 2028 is a leap year
      assert.strictEqual(isValidCalendarDate('2026-02-29'), false); // 2026 is NOT a leap year
      assert.strictEqual(isValidCalendarDate('2026-02-31'), false); // Feb never has 31 days
      assert.strictEqual(isValidCalendarDate('2026-04-31'), false); // April has 30 days
      assert.strictEqual(isValidCalendarDate('2026-13-01'), false); // Month 13 does not exist
      assert.strictEqual(isValidCalendarDate('2026-00-10'), false); // Month 00 does not exist
      assert.strictEqual(isValidCalendarDate('2026-12-31'), true);

      // Explicit verification for four-digit years 0000-0099
      assert.strictEqual(isValidCalendarDate('0050-01-01'), true);
      assert.strictEqual(isValidCalendarDate('0004-02-29'), true); // 0004 is a proleptic Gregorian leap year
      assert.strictEqual(isValidCalendarDate('0001-02-29'), false); // 0001 is NOT a leap year
      assert.strictEqual(isValidCalendarDate('0000-01-01'), true); // Year 0000 exists in ISO/astronomical numbering
    });

    it('should accept valid leap year effective dates on AvailabilityRule', async () => {
      const rule = await AvailabilityRule.create({
        resource: sharedResourceId,
        name: 'Leap Year Rule',
        timezone: 'UTC',
        windows: [{ dayOfWeek: DayOfWeek.MONDAY, startTime: '09:00', endTime: '17:00' }],
        bookingPolicy: defaultBookingPolicy,
        effectiveFrom: '2028-02-01',
        effectiveTo: '2028-02-29',
      });
      createdRuleIds.push(rule._id.toString());

      assert.strictEqual(rule.effectiveFrom, '2028-02-01');
      assert.strictEqual(rule.effectiveTo, '2028-02-29');
    });

    it('should reject nonexistent calendar dates on AvailabilityRule (e.g., 2026-02-31)', async () => {
      await assert.rejects(
        async () => {
          await AvailabilityRule.create({
            resource: sharedResourceId,
            name: 'Invalid Feb Date Rule',
            timezone: 'UTC',
            windows: [{ dayOfWeek: DayOfWeek.MONDAY, startTime: '09:00', endTime: '17:00' }],
            bookingPolicy: defaultBookingPolicy,
            effectiveFrom: '2026-02-31',
          });
        },
        /effectiveFrom must be a valid real calendar date in YYYY-MM-DD format/
      );

      await assert.rejects(
        async () => {
          await AvailabilityRule.create({
            resource: sharedResourceId,
            name: 'Invalid April Date Rule',
            timezone: 'UTC',
            windows: [{ dayOfWeek: DayOfWeek.MONDAY, startTime: '09:00', endTime: '17:00' }],
            bookingPolicy: defaultBookingPolicy,
            effectiveTo: '2026-04-31',
          });
        },
        /effectiveTo must be a valid real calendar date in YYYY-MM-DD format/
      );
    });

    it('should reject nonexistent calendar dates on Quota', async () => {
      await assert.rejects(
        async () => {
          await Quota.create({
            name: 'Bad Date Quota',
            scopeType: QuotaScopeType.RESOURCE,
            resource: sharedResourceId,
            subjectType: QuotaSubjectType.USER,
            user: sharedUserId,
            metric: QuotaMetric.BOOKING_COUNT,
            period: QuotaPeriod.DAILY,
            timezone: 'Asia/Kolkata',
            limit: 5,
            effectiveFrom: '2026-02-31',
          });
        },
        /effectiveFrom must be a valid real calendar date in YYYY-MM-DD format/
      );
    });

    it('should reject reversed effective date ranges where effectiveFrom > effectiveTo', async () => {
      await assert.rejects(
        async () => {
          await AvailabilityRule.create({
            resource: sharedResourceId,
            name: 'Reversed Dates Rule',
            timezone: 'Europe/London',
            effectiveFrom: '2026-12-31',
            effectiveTo: '2026-01-01',
            windows: [{ dayOfWeek: DayOfWeek.MONDAY, startTime: '09:00', endTime: '17:00' }],
            bookingPolicy: defaultBookingPolicy,
          });
        },
        /effectiveFrom \(2026-12-31\) cannot be later than effectiveTo \(2026-01-01\)/
      );
    });
  });

  // ==========================================
  // MODEL 2 & CORRECTION 4: BLACKOUT & 8-CASE HALF-OPEN OVERLAP SEMANTICS
  // ==========================================
  describe('Blackout Model - Half-Open Interval Overlap Semantics (8 Cases)', () => {
    it('should create a valid Blackout with UTC dates and category', async () => {
      const startAt = new Date('2026-10-02T00:00:00.000Z');
      const endAt = new Date('2026-10-02T23:59:59.999Z');

      const blackout = await Blackout.create({
        resource: sharedResourceId,
        startAt,
        endAt,
        reason: 'Gandhi Jayanti Public Holiday Closure',
        category: BlackoutCategory.HOLIDAY,
        description: 'Campus facility closed for national holiday observation',
        isActive: true,
      });
      createdBlackoutIds.push(blackout._id.toString());

      assert.ok(blackout._id);
      assert.strictEqual(blackout.resource.toString(), sharedResourceId.toString());
      assert.strictEqual(blackout.startAt.toISOString(), startAt.toISOString());
      assert.strictEqual(blackout.endAt.toISOString(), endAt.toISOString());
      assert.strictEqual(blackout.reason, 'Gandhi Jayanti Public Holiday Closure');
      assert.strictEqual(blackout.category, BlackoutCategory.HOLIDAY);
      assert.strictEqual(blackout.isActive, true);
    });

    it('should reject blackout where startAt == endAt or startAt > endAt', async () => {
      const timestamp = new Date('2026-11-15T10:00:00.000Z');

      await assert.rejects(
        async () => {
          await Blackout.create({
            resource: sharedResourceId,
            startAt: timestamp,
            endAt: timestamp,
            reason: 'Zero-duration blackout',
            category: BlackoutCategory.ADMINISTRATIVE,
          });
        },
        /Blackout startAt must be earlier than endAt/
      );

      await assert.rejects(
        async () => {
          await Blackout.create({
            resource: sharedResourceId,
            startAt: new Date('2026-11-15T12:00:00.000Z'),
            endAt: new Date('2026-11-15T10:00:00.000Z'),
            reason: 'Reversed time blackout',
            category: BlackoutCategory.ADMINISTRATIVE,
          });
        },
        /Blackout startAt must be earlier than endAt/
      );
    });

    it('should reject invalid blackout category values', async () => {
      await assert.rejects(
        async () => {
          // @ts-expect-error Testing invalid runtime enum input
          await Blackout.create({
            resource: sharedResourceId,
            startAt: new Date('2026-12-01T08:00:00.000Z'),
            endAt: new Date('2026-12-01T12:00:00.000Z'),
            reason: 'Invalid category blackout',
            category: 'MAINTENANCE_INVALID',
          });
        },
        /Invalid blackout category/
      );
    });

    /**
     * Correction 4: 8-Case Half-Open Interval Overlap Semantics
     * Target Query Window: Q = [10:00, 12:00)
     * Mathematical Overlap Invariant: candidate.startAt < Q_end AND candidate.endAt > Q_start
     */
    it('should verify all 8 half-open interval overlap permutations deterministically', async () => {
      const queryStart = new Date('2026-11-20T10:00:00.000Z');
      const queryEnd = new Date('2026-11-20T12:00:00.000Z');

      // Helper to query overlapping records using half-open condition
      const findOverlapping = async (blackoutId: Types.ObjectId) => {
        return Blackout.findOne({
          _id: blackoutId,
          startAt: { $lt: queryEnd },
          endAt: { $gt: queryStart },
        });
      };

      // Case 1: Exact Overlap [10:00, 12:00) -> OVERLAPS
      const c1 = await Blackout.create({
        resource: sharedResourceId,
        startAt: new Date('2026-11-20T10:00:00.000Z'),
        endAt: new Date('2026-11-20T12:00:00.000Z'),
        reason: 'Case 1: Exact overlap',
      });
      createdBlackoutIds.push(c1._id.toString());
      assert.ok(await findOverlapping(c1._id), 'Case 1 must overlap');

      // Case 2: Partial Overlap at Start [09:00, 11:00) -> OVERLAPS
      const c2 = await Blackout.create({
        resource: sharedResourceId,
        startAt: new Date('2026-11-20T09:00:00.000Z'),
        endAt: new Date('2026-11-20T11:00:00.000Z'),
        reason: 'Case 2: Partial overlap at start',
      });
      createdBlackoutIds.push(c2._id.toString());
      assert.ok(await findOverlapping(c2._id), 'Case 2 must overlap');

      // Case 3: Partial Overlap at End [11:00, 13:00) -> OVERLAPS
      const c3 = await Blackout.create({
        resource: sharedResourceId,
        startAt: new Date('2026-11-20T11:00:00.000Z'),
        endAt: new Date('2026-11-20T13:00:00.000Z'),
        reason: 'Case 3: Partial overlap at end',
      });
      createdBlackoutIds.push(c3._id.toString());
      assert.ok(await findOverlapping(c3._id), 'Case 3 must overlap');

      // Case 4: Contained Interval [10:30, 11:30) -> OVERLAPS
      const c4 = await Blackout.create({
        resource: sharedResourceId,
        startAt: new Date('2026-11-20T10:30:00.000Z'),
        endAt: new Date('2026-11-20T11:30:00.000Z'),
        reason: 'Case 4: Contained interval',
      });
      createdBlackoutIds.push(c4._id.toString());
      assert.ok(await findOverlapping(c4._id), 'Case 4 must overlap');

      // Case 5: Containing Interval [09:00, 13:00) -> OVERLAPS
      const c5 = await Blackout.create({
        resource: sharedResourceId,
        startAt: new Date('2026-11-20T09:00:00.000Z'),
        endAt: new Date('2026-11-20T13:00:00.000Z'),
        reason: 'Case 5: Containing interval',
      });
      createdBlackoutIds.push(c5._id.toString());
      assert.ok(await findOverlapping(c5._id), 'Case 5 must overlap');

      // Case 6: Touching at Start Boundary [08:00, 10:00) -> DOES NOT OVERLAP
      const c6 = await Blackout.create({
        resource: sharedResourceId,
        startAt: new Date('2026-11-20T08:00:00.000Z'),
        endAt: new Date('2026-11-20T10:00:00.000Z'),
        reason: 'Case 6: Touching at start boundary',
      });
      createdBlackoutIds.push(c6._id.toString());
      assert.strictEqual(
        await findOverlapping(c6._id),
        null,
        'Case 6 touching at start boundary must NOT overlap'
      );

      // Case 7: Touching at End Boundary [12:00, 14:00) -> DOES NOT OVERLAP
      const c7 = await Blackout.create({
        resource: sharedResourceId,
        startAt: new Date('2026-11-20T12:00:00.000Z'),
        endAt: new Date('2026-11-20T14:00:00.000Z'),
        reason: 'Case 7: Touching at end boundary',
      });
      createdBlackoutIds.push(c7._id.toString());
      assert.strictEqual(
        await findOverlapping(c7._id),
        null,
        'Case 7 touching at end boundary must NOT overlap'
      );

      // Case 8: Completely Separate Interval [15:00, 17:00) -> DOES NOT OVERLAP
      const c8 = await Blackout.create({
        resource: sharedResourceId,
        startAt: new Date('2026-11-20T15:00:00.000Z'),
        endAt: new Date('2026-11-20T17:00:00.000Z'),
        reason: 'Case 8: Completely separate interval',
      });
      createdBlackoutIds.push(c8._id.toString());
      assert.strictEqual(
        await findOverlapping(c8._id),
        null,
        'Case 8 completely separate interval must NOT overlap'
      );
    });
  });

  // ==========================================
  // MODEL 3 & CORRECTION 6: QUOTA MODEL & MANDATORY TIMEZONE
  // ==========================================
  describe('Quota Model - Scope, Subject & Mandatory Timezone', () => {
    it('should create a valid RESOURCE scope quota for a USER subject with timezone', async () => {
      const quota = await Quota.create({
        name: 'Student Lab Booking Limit',
        scopeType: QuotaScopeType.RESOURCE,
        resource: sharedResourceId,
        subjectType: QuotaSubjectType.USER,
        user: sharedUserId,
        metric: QuotaMetric.BOOKING_COUNT,
        period: QuotaPeriod.WEEKLY,
        timezone: 'Asia/Kolkata',
        limit: 3,
        effectiveFrom: '2026-08-01',
        effectiveTo: '2026-12-31',
        isActive: true,
      });
      createdQuotaIds.push(quota._id.toString());

      assert.ok(quota._id);
      assert.strictEqual(quota.scopeType, QuotaScopeType.RESOURCE);
      assert.strictEqual(quota.resource?.toString(), sharedResourceId.toString());
      assert.strictEqual(quota.subjectType, QuotaSubjectType.USER);
      assert.strictEqual(quota.user?.toString(), sharedUserId.toString());
      assert.strictEqual(quota.metric, QuotaMetric.BOOKING_COUNT);
      assert.strictEqual(quota.period, QuotaPeriod.WEEKLY);
      assert.strictEqual(quota.timezone, 'Asia/Kolkata');
      assert.strictEqual(quota.limit, 3);
    });

    it('should create a valid RESOURCE_TYPE scope quota for a ROLE subject with timezone', async () => {
      const quota = await Quota.create({
        name: 'Faculty Duration Quota Across Laboratories',
        scopeType: QuotaScopeType.RESOURCE_TYPE,
        resourceType: sharedResourceTypeId,
        subjectType: QuotaSubjectType.ROLE,
        role: UserRole.FACULTY,
        metric: QuotaMetric.DURATION_MINUTES,
        period: QuotaPeriod.MONTHLY,
        timezone: 'America/New_York',
        limit: 2400,
        isActive: true,
      });
      createdQuotaIds.push(quota._id.toString());

      assert.strictEqual(quota.scopeType, QuotaScopeType.RESOURCE_TYPE);
      assert.strictEqual(quota.resourceType?.toString(), sharedResourceTypeId.toString());
      assert.strictEqual(quota.subjectType, QuotaSubjectType.ROLE);
      assert.strictEqual(quota.role, UserRole.FACULTY);
      assert.strictEqual(quota.metric, QuotaMetric.DURATION_MINUTES);
      assert.strictEqual(quota.timezone, 'America/New_York');
      assert.strictEqual(quota.limit, 2400);
    });

    it('should reject Quota without timezone or with invalid IANA timezone', async () => {
      await assert.rejects(
        async () => {
          // @ts-expect-error Missing required timezone
          await Quota.create({
            name: 'No Timezone Quota',
            scopeType: QuotaScopeType.RESOURCE,
            resource: sharedResourceId,
            subjectType: QuotaSubjectType.USER,
            user: sharedUserId,
            metric: QuotaMetric.BOOKING_COUNT,
            period: QuotaPeriod.DAILY,
            limit: 5,
          });
        },
        /Quota timezone is required to establish deterministic period boundaries/
      );

      await assert.rejects(
        async () => {
          await Quota.create({
            name: 'IST Timezone Quota',
            scopeType: QuotaScopeType.RESOURCE,
            resource: sharedResourceId,
            subjectType: QuotaSubjectType.USER,
            user: sharedUserId,
            metric: QuotaMetric.BOOKING_COUNT,
            period: QuotaPeriod.DAILY,
            timezone: 'IST', // Rejected informal abbreviation
            limit: 5,
          });
        },
        /Invalid IANA timezone identifier/
      );
    });

    it('should reject scopeType RESOURCE when resource is missing or resourceType is provided', async () => {
      await assert.rejects(
        async () => {
          await Quota.create({
            name: 'Missing Resource Reference',
            scopeType: QuotaScopeType.RESOURCE,
            subjectType: QuotaSubjectType.USER,
            user: sharedUserId,
            metric: QuotaMetric.BOOKING_COUNT,
            period: QuotaPeriod.WEEKLY,
            timezone: 'UTC',
            limit: 5,
          });
        },
        /Quota scopeType RESOURCE requires resource reference/
      );

      await assert.rejects(
        async () => {
          await Quota.create({
            name: 'Contradictory Scope References',
            scopeType: QuotaScopeType.RESOURCE,
            resource: sharedResourceId,
            resourceType: sharedResourceTypeId,
            subjectType: QuotaSubjectType.USER,
            user: sharedUserId,
            metric: QuotaMetric.BOOKING_COUNT,
            period: QuotaPeriod.WEEKLY,
            timezone: 'UTC',
            limit: 5,
          });
        },
        /Quota scopeType RESOURCE must not provide resourceType reference/
      );
    });

    it('should reject subjectType mismatches and contradictory subject fields', async () => {
      await assert.rejects(
        async () => {
          await Quota.create({
            name: 'Missing User Reference',
            scopeType: QuotaScopeType.RESOURCE,
            resource: sharedResourceId,
            subjectType: QuotaSubjectType.USER,
            metric: QuotaMetric.BOOKING_COUNT,
            period: QuotaPeriod.WEEKLY,
            timezone: 'UTC',
            limit: 5,
          });
        },
        /Quota subjectType USER requires user reference/
      );

      await assert.rejects(
        async () => {
          await Quota.create({
            name: 'Contradictory User and Role',
            scopeType: QuotaScopeType.RESOURCE,
            resource: sharedResourceId,
            subjectType: QuotaSubjectType.USER,
            user: sharedUserId,
            role: UserRole.STUDENT,
            metric: QuotaMetric.BOOKING_COUNT,
            period: QuotaPeriod.WEEKLY,
            timezone: 'UTC',
            limit: 5,
          });
        },
        /Quota subjectType USER must not provide role or department/
      );
    });

    it('should reject invalid metrics or periods', async () => {
      await assert.rejects(
        async () => {
          // @ts-expect-error Invalid metric enum
          await Quota.create({
            name: 'Invalid Metric Quota',
            scopeType: QuotaScopeType.RESOURCE,
            resource: sharedResourceId,
            subjectType: QuotaSubjectType.USER,
            user: sharedUserId,
            metric: 'INVALID_METRIC',
            period: QuotaPeriod.WEEKLY,
            timezone: 'UTC',
            limit: 5,
          });
        },
        /Invalid quota metric/
      );

      await assert.rejects(
        async () => {
          // @ts-expect-error Invalid period enum
          await Quota.create({
            name: 'Invalid Period Quota',
            scopeType: QuotaScopeType.RESOURCE,
            resource: sharedResourceId,
            subjectType: QuotaSubjectType.USER,
            user: sharedUserId,
            metric: QuotaMetric.BOOKING_COUNT,
            period: 'SEMESTER_INVALID',
            timezone: 'UTC',
            limit: 5,
          });
        },
        /Invalid quota period/
      );
    });

    it('should reject non-positive integer limits (0, negative, decimals)', async () => {
      await assert.rejects(
        async () => {
          await Quota.create({
            name: 'Zero Limit Quota',
            scopeType: QuotaScopeType.RESOURCE,
            resource: sharedResourceId,
            subjectType: QuotaSubjectType.USER,
            user: sharedUserId,
            metric: QuotaMetric.BOOKING_COUNT,
            period: QuotaPeriod.WEEKLY,
            timezone: 'UTC',
            limit: 0,
          });
        },
        /Quota limit must be a positive integer/
      );

      await assert.rejects(
        async () => {
          await Quota.create({
            name: 'Negative Limit Quota',
            scopeType: QuotaScopeType.RESOURCE,
            resource: sharedResourceId,
            subjectType: QuotaSubjectType.USER,
            user: sharedUserId,
            metric: QuotaMetric.BOOKING_COUNT,
            period: QuotaPeriod.WEEKLY,
            timezone: 'UTC',
            limit: -5,
          });
        },
        /Quota limit must be a positive integer/
      );

      await assert.rejects(
        async () => {
          await Quota.create({
            name: 'Decimal Limit Quota',
            scopeType: QuotaScopeType.RESOURCE,
            resource: sharedResourceId,
            subjectType: QuotaSubjectType.USER,
            user: sharedUserId,
            metric: QuotaMetric.DURATION_MINUTES,
            period: QuotaPeriod.WEEKLY,
            timezone: 'UTC',
            limit: 120.5,
          });
        },
        /Quota limit must be a positive integer/
      );
    });
  });

  // ==========================================
  // ITEM 2: DEPARTMENT CANONICALIZATION & COLLATION TESTS
  // ==========================================
  describe('Quota & User Models - Department Canonicalization & Collation', () => {
    it('should canonicalize department whitespace on User and Quota while preserving casing', async () => {
      assert.strictEqual(
        normalizeDepartmentName('  Computer   Science  &   Engineering  '),
        'Computer Science & Engineering'
      );

      const deptUser = await User.create({
        name: 'Dept Test User',
        email: `${TEST_PREFIX}deptuser_${Date.now()}@campusflow.edu`,
        roles: [UserRole.FACULTY],
        department: '  Computer   Science  &   Engineering  ',
      });
      createdUserIds.push(deptUser._id.toString());
      assert.strictEqual(deptUser.department, 'Computer Science & Engineering');

      const deptQuota = await Quota.create({
        name: 'CS Department Daily Quota',
        scopeType: QuotaScopeType.RESOURCE,
        resource: sharedResourceId,
        subjectType: QuotaSubjectType.DEPARTMENT,
        department: '  Computer   Science  &   Engineering  ',
        metric: QuotaMetric.BOOKING_COUNT,
        period: QuotaPeriod.DAILY,
        timezone: 'Asia/Kolkata',
        limit: 10,
        isActive: true,
      });
      createdQuotaIds.push(deptQuota._id.toString());
      assert.strictEqual(deptQuota.department, 'Computer Science & Engineering');
    });

    it('should prevent case-variant duplicate quota definitions via unique index collation', async () => {
      const quota1 = await Quota.create({
        name: 'Mechanical Engineering Quota',
        scopeType: QuotaScopeType.RESOURCE,
        resource: sharedResourceId,
        subjectType: QuotaSubjectType.DEPARTMENT,
        department: 'Mechanical Engineering',
        metric: QuotaMetric.BOOKING_COUNT,
        period: QuotaPeriod.WEEKLY,
        timezone: 'UTC',
        limit: 5,
      });
      createdQuotaIds.push(quota1._id.toString());

      // Attempt creating identical quota policy differing only by department casing
      await assert.rejects(
        async () => {
          await Quota.create({
            name: 'mechanical engineering quota duplicate',
            scopeType: QuotaScopeType.RESOURCE,
            resource: sharedResourceId,
            subjectType: QuotaSubjectType.DEPARTMENT,
            department: 'mechanical engineering', // Lowercase variant
            metric: QuotaMetric.BOOKING_COUNT,
            period: QuotaPeriod.WEEKLY,
            timezone: 'UTC',
            limit: 8,
          });
        },
        (err: unknown) => {
          const mongoErr = err as { code?: number };
          return mongoErr.code === 11000;
        }
      );
    });

    it('should verify collation behavior: uncollated queries are case-sensitive while collated queries match case-insensitively', async () => {
      // 1. Un-collated query uses default MongoDB binary matching (does NOT match uppercase variant)
      const uncollatedFound = await Quota.findOne({
        subjectType: QuotaSubjectType.DEPARTMENT,
        department: 'MECHANICAL ENGINEERING',
      });
      assert.strictEqual(
        uncollatedFound,
        null,
        'Standard un-collated lookup is case-sensitive and must not match different casing'
      );

      // 2. Query with explicit collation matches case-insensitively using the collation index
      const collatedFound = await Quota.findOne({
        subjectType: QuotaSubjectType.DEPARTMENT,
        department: 'MECHANICAL ENGINEERING',
      }).collation({ locale: 'en', strength: 2 });

      assert.ok(collatedFound, 'Collated query matches case-insensitively');
      assert.strictEqual(collatedFound.department, 'Mechanical Engineering');
    });
  });
});
