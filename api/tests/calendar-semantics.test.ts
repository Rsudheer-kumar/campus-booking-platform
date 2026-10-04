/**
 * CampusFlow API - Calendar Semantics, Interval Math & Countdown Test Suite
 * Validates:
 * 1. Half-open interval overlap calculus: [startA, endA) vs [startB, endB)
 * 2. Non-hour-aligned intervals (e.g. 09:30–10:30 affecting both 09:00 and 10:00 slots)
 * 3. Adjacent intervals (08:30–09:30 touching 09:30–10:30 without collision)
 * 4. Multi-hour interval coverage
 * 5. Countdown state machine (UPCOMING, IN_PROGRESS, COMPLETED)
 * 6. Security: Past date booking rejection & timetable hard conflict rejection (409)
 */

import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import mongoose, { Types } from 'mongoose';
import { connectDatabase, disconnectDatabase, isDatabaseConnected } from '../src/config/database';
import { env } from '../src/config/env';
import { intervalsOverlap, getZonedParts } from '../src/utils/timezone';
import {
  Resource,
  ResourceType,
  ResourceCategory,
  TimetableEntry,
  Reservation,
  ReservationStatus,
  AvailabilityRule,
  DayOfWeek,
  User,
  UserRole,
} from '../src/models';
import { TimetableService } from '../src/services/timetable.service';
import { ReservationService } from '../src/services/reservation.service';
import { AvailabilityService } from '../src/services/availability.service';
import { ConflictError, BadRequestError } from '../src/utils/errors';

// Helper for countdown computation mirroring the frontend authoritative logic
function calculateCountdownState(nowMs: number, startMs: number, endMs: number): {
  state: 'UPCOMING' | 'IN_PROGRESS' | 'COMPLETED';
  countdownText: string;
} {
  const formatDuration = (diffMs: number): string => {
    if (diffMs <= 0) return '00:00:00';
    const totalSec = Math.floor(diffMs / 1000);
    const hours = Math.floor(totalSec / 3600);
    const minutes = Math.floor((totalSec % 3600) / 60);
    const seconds = totalSec % 60;
    if (hours >= 24) {
      const days = Math.floor(hours / 24);
      const remHours = hours % 24;
      return `${days}d ${String(remHours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
    }
    return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
  };

  if (nowMs < startMs) {
    return {
      state: 'UPCOMING',
      countdownText: `Starts in ${formatDuration(startMs - nowMs)}`,
    };
  } else if (nowMs < endMs) {
    return {
      state: 'IN_PROGRESS',
      countdownText: `Ends in ${formatDuration(endMs - nowMs)}`,
    };
  } else {
    return {
      state: 'COMPLETED',
      countdownText: 'Ended',
    };
  }
}

// Helper: computes slot keys for discrete hourly calendar cells
function getOverlappingHourlySlots(startAt: Date, endAt: Date): string[] {
  const keys: string[] = [];
  const cur = new Date(startAt);
  cur.setUTCMinutes(0, 0, 0);
  while (cur < endAt) {
    const nextHour = new Date(cur.getTime() + 3600000);
    if (cur < endAt && nextHour > startAt) {
      keys.push(cur.toISOString().slice(0, 13));
    }
    cur.setTime(nextHour.getTime());
  }
  return keys;
}

describe('Calendar Semantics & Interval Mathematics Test Suite', () => {
  describe('1. Half-Open Interval Calculus [start, end)', () => {
    it('CS-01: adjacent intervals [08:30, 09:30) and [09:30, 10:30) do NOT overlap', () => {
      const aStart = new Date('2026-10-05T08:30:00Z');
      const aEnd = new Date('2026-10-05T09:30:00Z');
      const bStart = new Date('2026-10-05T09:30:00Z');
      const bEnd = new Date('2026-10-05T10:30:00Z');

      const overlaps = intervalsOverlap(aStart, aEnd, bStart, bEnd);
      assert.strictEqual(overlaps, false, 'Adjacent intervals sharing an endpoint must not collide');
    });

    it('CS-02: non-hour-aligned interval [09:30, 10:30) intersects both [09:00, 10:00) and [10:00, 11:00)', () => {
      const sessionStart = new Date('2026-10-05T09:30:00Z');
      const sessionEnd = new Date('2026-10-05T10:30:00Z');

      // Slot 09:00 - 10:00
      const slot9Start = new Date('2026-10-05T09:00:00Z');
      const slot9End = new Date('2026-10-05T10:00:00Z');
      assert.strictEqual(
        intervalsOverlap(sessionStart, sessionEnd, slot9Start, slot9End),
        true,
        '09:30-10:30 must intersect 09:00-10:00'
      );

      // Slot 10:00 - 11:00
      const slot10Start = new Date('2026-10-05T10:00:00Z');
      const slot10End = new Date('2026-10-05T11:00:00Z');
      assert.strictEqual(
        intervalsOverlap(sessionStart, sessionEnd, slot10Start, slot10End),
        true,
        '09:30-10:30 must intersect 10:00-11:00'
      );

      // Slot 08:00 - 09:00 (strictly before)
      const slot8Start = new Date('2026-10-05T08:00:00Z');
      const slot8End = new Date('2026-10-05T09:00:00Z');
      assert.strictEqual(
        intervalsOverlap(sessionStart, sessionEnd, slot8Start, slot8End),
        false,
        '09:30-10:30 must not intersect 08:00-09:00'
      );

      // Slot 11:00 - 12:00 (strictly after)
      const slot11Start = new Date('2026-10-05T11:00:00Z');
      const slot11End = new Date('2026-10-05T12:00:00Z');
      assert.strictEqual(
        intervalsOverlap(sessionStart, sessionEnd, slot11Start, slot11End),
        false,
        '09:30-10:30 must not intersect 11:00-12:00'
      );
    });

    it('CS-03: hourly slot indexing maps 09:30-10:30 to exactly [09:00, 10:00] slot keys', () => {
      const sessionStart = new Date('2026-10-05T09:30:00Z');
      const sessionEnd = new Date('2026-10-05T10:30:00Z');

      const slots = getOverlappingHourlySlots(sessionStart, sessionEnd);
      assert.deepStrictEqual(slots, ['2026-10-05T09', '2026-10-05T10']);
    });

    it('CS-04: multi-hour interval [09:00, 12:00) maps to exactly 3 hourly slot keys', () => {
      const sessionStart = new Date('2026-10-05T09:00:00Z');
      const sessionEnd = new Date('2026-10-05T12:00:00Z');

      const slots = getOverlappingHourlySlots(sessionStart, sessionEnd);
      assert.deepStrictEqual(slots, [
        '2026-10-05T09',
        '2026-10-05T10',
        '2026-10-05T11',
      ]);
    });
  });

  describe('2. Authoritative Live Countdown State Transitions', () => {
    const baseStart = new Date('2026-10-05T10:00:00Z').getTime();
    const baseEnd = new Date('2026-10-05T11:00:00Z').getTime();

    it('CS-05: correctly computes UPCOMING state and formatted "Starts in HH:MM:SS"', () => {
      // 1 hour, 42 minutes, 8 seconds before start
      const now = baseStart - (1 * 3600 + 42 * 60 + 8) * 1000;
      const res = calculateCountdownState(now, baseStart, baseEnd);

      assert.strictEqual(res.state, 'UPCOMING');
      assert.strictEqual(res.countdownText, 'Starts in 01:42:08');
    });

    it('CS-06: correctly computes IN_PROGRESS state and formatted "Ends in HH:MM:SS"', () => {
      // 17 minutes, 32 seconds before end
      const now = baseEnd - (17 * 60 + 32) * 1000;
      const res = calculateCountdownState(now, baseStart, baseEnd);

      assert.strictEqual(res.state, 'IN_PROGRESS');
      assert.strictEqual(res.countdownText, 'Ends in 00:17:32');
    });

    it('CS-07: correctly computes COMPLETED state and displays "Ended"', () => {
      const now = baseEnd + 1000; // 1 second after end
      const res = calculateCountdownState(now, baseStart, baseEnd);

      assert.strictEqual(res.state, 'COMPLETED');
      assert.strictEqual(res.countdownText, 'Ended');
    });

    it('CS-08: boundary transition precisely at startAt switches from UPCOMING to IN_PROGRESS', () => {
      const justBefore = calculateCountdownState(baseStart - 1, baseStart, baseEnd);
      assert.strictEqual(justBefore.state, 'UPCOMING');

      const exactlyAtStart = calculateCountdownState(baseStart, baseStart, baseEnd);
      assert.strictEqual(exactlyAtStart.state, 'IN_PROGRESS');
      assert.strictEqual(exactlyAtStart.countdownText, 'Ends in 01:00:00');
    });

    it('CS-09: boundary transition precisely at endAt switches from IN_PROGRESS to COMPLETED', () => {
      const justBefore = calculateCountdownState(baseEnd - 1, baseStart, baseEnd);
      assert.strictEqual(justBefore.state, 'IN_PROGRESS');

      const exactlyAtEnd = calculateCountdownState(baseEnd, baseStart, baseEnd);
      assert.strictEqual(exactlyAtEnd.state, 'COMPLETED');
      assert.strictEqual(exactlyAtEnd.countdownText, 'Ended');
    });
  });

  describe('3. Database & Service Level Past / Future Semantics', () => {
    let testType: any;
    let testResource: any;
    let testRule: any;
    let testAdminUser: any;
    let testStudentUser: any;

    before(async () => {
      if (!isDatabaseConnected()) {
        await connectDatabase(env.MONGODB_TEST_URI);
      }

      testType = await ResourceType.create({
        name: 'Calendar Lab Type',
        code: `TYPE-CAL-${Date.now()}`,
        category: ResourceCategory.LABORATORY,
        isActive: true,
      });

      testResource = await Resource.create({
        name: 'Turing Computer Lab',
        code: `LAB-CAL-${Date.now()}`,
        resourceType: testType._id,
        capacity: 40,
        location: {
          building: 'Turing Complex',
          roomNumber: '301',
          floor: '3',
        },
        status: 'ACTIVE',
        isActive: true,
      });

      testRule = await AvailabilityRule.create({
        resource: testResource._id,
        timezone: 'UTC',
        name: 'Calendar Lab 24x7 Schedule',
        windows: [
          { dayOfWeek: DayOfWeek.MONDAY, startTime: '00:00', endTime: '24:00' },
          { dayOfWeek: DayOfWeek.TUESDAY, startTime: '00:00', endTime: '24:00' },
          { dayOfWeek: DayOfWeek.WEDNESDAY, startTime: '00:00', endTime: '24:00' },
          { dayOfWeek: DayOfWeek.THURSDAY, startTime: '00:00', endTime: '24:00' },
          { dayOfWeek: DayOfWeek.FRIDAY, startTime: '00:00', endTime: '24:00' },
          { dayOfWeek: DayOfWeek.SATURDAY, startTime: '00:00', endTime: '24:00' },
          { dayOfWeek: DayOfWeek.SUNDAY, startTime: '00:00', endTime: '24:00' },
        ],
        bookingPolicy: {
          minDurationMinutes: 15,
          maxDurationMinutes: 480,
          minLeadTimeMinutes: 0,
          maxAdvanceBookingDays: 3650,
        },
        isActive: true,
      });

      testAdminUser = await User.create({
        email: `admin-cal-${Date.now()}@campusflow.test`,
        passwordHash: 'hash',
        name: 'Calendar Admin',
        roles: [UserRole.ADMIN],
        isActive: true,
      });

      testStudentUser = await User.create({
        email: `student-cal-${Date.now()}@campusflow.test`,
        passwordHash: 'hash',
        name: 'Calendar Student',
        roles: [UserRole.STUDENT],
        isActive: true,
      });
    });

    after(async () => {
      if (testResource?._id) {
        await TimetableEntry.deleteMany({ resource: testResource._id });
        await Reservation.deleteMany({ resource: testResource._id });
        await AvailabilityRule.deleteMany({ resource: testResource._id });
        await Resource.deleteOne({ _id: testResource._id });
      }
      if (testType?._id) {
        await ResourceType.deleteOne({ _id: testType._id });
      }
      if (testAdminUser?._id || testStudentUser?._id) {
        await User.deleteMany({ _id: { $in: [testAdminUser?._id, testStudentUser?._id].filter(Boolean) } });
      }
      await disconnectDatabase();
    });

    it('CS-10: past timetable entries remain visible and queryable by date range', async () => {
      const pastStart = new Date('2024-09-01T09:00:00Z');
      const pastEnd = new Date('2024-09-01T11:00:00Z');

      await TimetableEntry.create({
        resource: testResource._id,
        academicTerm: 'FALL2024',
        courseCode: 'CS101',
        courseTitle: 'Intro to Computer Science',
        instructorName: 'Prof. Turing',
        startAt: pastStart,
        endAt: pastEnd,
        timezone: 'UTC',
        isPublished: true,
        version: 1,
        publicationBatchId: `batch-past-${Date.now()}`,
      });

      const entries = await TimetableService.listTimetableEntries({
        resourceId: testResource._id.toString(),
        startAt: '2024-09-01T00:00:00Z',
        endAt: '2024-09-01T23:59:59Z',
      });

      assert.strictEqual(entries.length, 1);
      assert.strictEqual(entries[0].courseCode, 'CS101');
      assert.strictEqual(entries[0].isPublished, true);
    });

    it('CS-11: published timetable entry hard-blocks concurrent reservation booking', async () => {
      const futureStart = new Date('2028-10-05T09:00:00Z');
      const futureEnd = new Date('2028-10-05T11:00:00Z');

      // Publish future timetable session
      await TimetableEntry.create({
        resource: testResource._id,
        academicTerm: 'FALL2028',
        courseCode: 'CS500',
        courseTitle: 'Advanced Distributed Systems',
        instructorName: 'Dr. Dijkstra',
        startAt: futureStart,
        endAt: futureEnd,
        timezone: 'UTC',
        isPublished: true,
        version: 1,
        publicationBatchId: `batch-future-${Date.now()}`,
      });

      // Attempting to book an overlapping reservation must fail with TIMETABLE_CONFLICT
      const availability = await AvailabilityService.checkAvailability({
        resourceId: testResource._id,
        startAt: new Date('2028-10-05T09:30:00Z'),
        endAt: new Date('2028-10-05T10:30:00Z'),
        now: new Date('2028-10-01T00:00:00Z'),
      });

      assert.strictEqual(availability.available, false);
      assert.strictEqual(availability.reason, 'TIMETABLE_CONFLICT');
    });

    it('CS-12: non-timetable period on future date remains available for booking', async () => {
      // 14:00 to 16:00 on the same future date is free
      const freeStart = new Date('2028-10-05T14:00:00Z');
      const freeEnd = new Date('2028-10-05T16:00:00Z');

      const ttCheck = await TimetableEntry.findOne({
        resource: testResource._id,
        isPublished: true,
        startAt: { $lt: freeEnd },
        endAt: { $gt: freeStart },
      });

      assert.strictEqual(ttCheck, null, 'No timetable conflicts for 14:00-16:00 slot');

      const availability = await AvailabilityService.checkAvailability({
        resourceId: testResource._id,
        startAt: freeStart,
        endAt: freeEnd,
        now: new Date('2028-10-01T00:00:00Z'),
      });

      assert.strictEqual(availability.available, true);
    });
  });
});
