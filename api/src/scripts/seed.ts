/**
 * CampusFlow API - Seed Script
 * Idempotently populates MongoDB with demo users, resource types, facilities,
 * availability rules, published academic timetable sessions (Phase 3.1),
 * and sample active reservations.
 */

import { connectDatabase, disconnectDatabase } from '../config/database';
import { env } from '../config/env';
import {
  User,
  UserRole,
  ResourceType,
  ResourceCategory,
  Resource,
  ResourceStatus,
  AvailabilityRule,
  DayOfWeek,
  type DayOfWeekType,
  TimetableEntry,
  Reservation,
  ReservationStatus,
  ApprovalPolicy,
  ApprovalScopeType,
  ApproverRole,
} from '../models';
import { hashPassword } from '../utils/password';
import { logger } from '../utils/logger';

async function seedDatabase(): Promise<void> {
  logger.info('Starting CampusFlow database seed...');
  await connectDatabase(env.MONGODB_URI);

  try {
    // 1. Seed Demo Users
    logger.info('Seeding demo users...');
    const defaultPassword = 'CampusFlow@2026!';
    const passwordHash = await hashPassword(defaultPassword);

    const usersData = [
      {
        email: 'student@campusflow.edu',
        name: 'Alex Chen',
        roles: [UserRole.STUDENT],
        department: 'Computer Science',
        identifier: 'STU-2026-081',
        isActive: true,
        passwordHash,
      },
      {
        email: 'faculty@campusflow.edu',
        name: 'Dr. Sarah Connor',
        roles: [UserRole.FACULTY, UserRole.DEPARTMENT_HEAD],
        department: 'Computer Science',
        identifier: 'FAC-2024-019',
        isActive: true,
        passwordHash,
      },
      {
        email: 'admin@campusflow.edu',
        name: 'System Administrator',
        roles: [UserRole.ADMIN, UserRole.FACILITY_MANAGER],
        department: 'Campus Facilities IT',
        identifier: 'ADM-001',
        isActive: true,
        passwordHash,
      },
    ];

    const userMap: Record<string, string> = {};
    for (const u of usersData) {
      const user = await User.findOneAndUpdate(
        { email: u.email },
        { $set: u },
        { upsert: true, new: true, setDefaultsOnInsert: true }
      );
      userMap[u.email] = user._id.toString();
      logger.info(`User ready: ${u.email} (${u.roles.join(', ')})`);
    }

    // 2. Seed Resource Types
    logger.info('Seeding resource types...');
    const typesData = [
      {
        name: 'Lecture Hall',
        code: 'LH',
        category: ResourceCategory.CLASSROOM,
        description: 'Large tiered lecture theaters equipped with AV and projector systems.',
      },
      {
        name: 'Computer Laboratory',
        code: 'LAB',
        category: ResourceCategory.LABORATORY,
        description: 'Specialized computing laboratories with high-performance workstations.',
      },
      {
        name: 'Seminar Room',
        code: 'SEM',
        category: ResourceCategory.MEETING_ROOM,
        description: 'Collaborative meeting and presentation rooms for interactive groups.',
      },
      {
        name: 'Auditorium',
        code: 'AUD',
        category: ResourceCategory.AUDITORIUM,
        description: 'Grand campus hall for university symposia and academic conferences.',
      },
    ];

    const typeMap: Record<string, string> = {};
    for (const t of typesData) {
      const rt = await ResourceType.findOneAndUpdate(
        { code: t.code },
        { $set: t },
        { upsert: true, new: true, setDefaultsOnInsert: true }
      );
      typeMap[t.code] = rt._id.toString();
    }

    // 3. Seed Campus Facilities & Physical Resources
    logger.info('Seeding campus physical resources...');
    const resourcesData = [
      {
        name: 'Turing Lecture Hall',
        code: 'LH-101',
        resourceType: typeMap['LH'],
        description: 'Flagship tiered lecture hall with 4K laser projection and dual podiums.',
        capacity: 120,
        status: ResourceStatus.ACTIVE,
        isActive: true,
        location: {
          building: 'Turing Science Center',
          floor: '1',
          roomNumber: '101',
          campus: 'North Campus',
        },
        attributes: [],
      },
      {
        name: 'Hopper Lecture Hall',
        code: 'LH-102',
        resourceType: typeMap['LH'],
        description: 'Tiered academic lecture theater with audio recording facilities.',
        capacity: 80,
        status: ResourceStatus.ACTIVE,
        isActive: true,
        location: {
          building: 'Hopper Engineering Complex',
          floor: '1',
          roomNumber: '102',
          campus: 'North Campus',
        },
        attributes: [],
      },
      {
        name: 'AI & Robotics Laboratory',
        code: 'LAB-301',
        resourceType: typeMap['LAB'],
        description: 'Research computing laboratory with 45 GPU-accelerated workstations.',
        capacity: 45,
        status: ResourceStatus.ACTIVE,
        isActive: true,
        location: {
          building: 'Turing Science Center',
          floor: '3',
          roomNumber: '301',
          campus: 'North Campus',
        },
        attributes: [],
      },
      {
        name: 'Systems & Networks Laboratory',
        code: 'LAB-302',
        resourceType: typeMap['LAB'],
        description: 'Hardware testbed and network security experimental laboratory.',
        capacity: 40,
        status: ResourceStatus.ACTIVE,
        isActive: true,
        location: {
          building: 'Turing Science Center',
          floor: '3',
          roomNumber: '302',
          campus: 'North Campus',
        },
        attributes: [],
      },
      {
        name: 'Executive Seminar Room',
        code: 'SEM-204',
        resourceType: typeMap['SEM'],
        description: 'Modern conference room equipped for hybrid videoconferencing.',
        capacity: 25,
        status: ResourceStatus.ACTIVE,
        isActive: true,
        location: {
          building: 'Innovation Center',
          floor: '2',
          roomNumber: '204',
          campus: 'Central Campus',
        },
        attributes: [],
      },
      {
        name: 'Main Campus Auditorium',
        code: 'AUD-MAIN',
        resourceType: typeMap['AUD'],
        description: 'University grand auditorium with acoustic dampening and theater seating.',
        capacity: 500,
        status: ResourceStatus.ACTIVE,
        isActive: true,
        location: {
          building: 'Central Campus Center',
          floor: '1',
          roomNumber: 'AUD-1',
          campus: 'Central Campus',
        },
        attributes: [],
      },
    ];

    const resourceMap: Record<string, string> = {};
    for (const r of resourcesData) {
      const resDoc = await Resource.findOneAndUpdate(
        { code: r.code },
        { $set: r },
        { upsert: true, new: true, setDefaultsOnInsert: true }
      );
      resourceMap[r.code] = resDoc._id.toString();
      logger.info(`Resource ready: ${r.code} - ${r.name}`);
    }

    // 4. Seed Standard Availability Rules
    logger.info('Seeding availability rules...');
    const allDays: DayOfWeekType[] = [
      DayOfWeek.MONDAY,
      DayOfWeek.TUESDAY,
      DayOfWeek.WEDNESDAY,
      DayOfWeek.THURSDAY,
      DayOfWeek.FRIDAY,
      DayOfWeek.SATURDAY,
      DayOfWeek.SUNDAY,
    ];

    for (const [code, resId] of Object.entries(resourceMap)) {
      const windows = allDays.map((day) => ({
        dayOfWeek: day,
        startTime: '00:00',
        endTime: '24:00',
      }));

      await AvailabilityRule.findOneAndUpdate(
        { resource: resId, name: 'Standard Campus Hours' },
        {
          $set: {
            resource: resId,
            name: 'Standard Campus Hours',
            timezone: 'UTC',
            windows,
            bookingPolicy: {
              minDurationMinutes: 30,
              maxDurationMinutes: 240,
              minLeadTimeMinutes: 0,
              maxAdvanceBookingDays: 60,
            },
            isActive: true,
          },
        },
        { upsert: true, setDefaultsOnInsert: true }
      );
    }

    // 5. Seed Published Academic Timetable Sessions (Phase 3.1)
    logger.info('Seeding published academic timetable sessions...');
    const now = new Date();
    // Calculate current week Monday at 00:00:00 UTC
    const currentDayOfWeek = now.getUTCDay(); // 0 = Sun, 1 = Mon...
    const diffToMonday = currentDayOfWeek === 0 ? -6 : 1 - currentDayOfWeek;
    const monday = new Date(now);
    monday.setUTCDate(now.getUTCDate() + diffToMonday);
    monday.setUTCHours(0, 0, 0, 0);

    // Helper to generate dates relative to monday: dayOffset (0 = Mon, 1 = Tue, etc.)
    function makeSessionUtc(dayOffset: number, startH: number, startM: number, endH: number, endM: number): { start: Date; end: Date } {
      const start = new Date(monday);
      start.setUTCDate(monday.getUTCDate() + dayOffset);
      start.setUTCHours(startH, startM, 0, 0);

      const end = new Date(monday);
      end.setUTCDate(monday.getUTCDate() + dayOffset);
      end.setUTCHours(endH, endM, 0, 0);

      return { start, end };
    }

    // Generate timetable sessions for previous week, current week, and next week
    const weekOffsets = [-7, 0, 7];
    const timetableEntriesToInsert = [];

    for (const wOffset of weekOffsets) {
      // LH-101: CS101 Mon/Wed/Fri 09:00 - 10:30 UTC
      for (const d of [0, 2, 4]) {
        const { start, end } = makeSessionUtc(d + wOffset, 9, 0, 10, 30);
        timetableEntriesToInsert.push({
          resource: resourceMap['LH-101'],
          academicTerm: 'FALL-2026',
          courseCode: 'CS101',
          courseTitle: 'Introduction to Algorithms',
          instructorName: 'Dr. Ada Lovelace',
          startAt: start,
          endAt: end,
          timezone: 'America/New_York',
          isPublished: true,
          version: 1,
          publicationBatchId: `BATCH-FALL2026-W${wOffset}`,
        });
      }

      // LH-101: CS201 Tue/Thu 11:00 - 12:30 UTC
      for (const d of [1, 3]) {
        const { start, end } = makeSessionUtc(d + wOffset, 11, 0, 12, 30);
        timetableEntriesToInsert.push({
          resource: resourceMap['LH-101'],
          academicTerm: 'FALL-2026',
          courseCode: 'CS201',
          courseTitle: 'Data Structures & Systems',
          instructorName: 'Prof. Alan Turing',
          startAt: start,
          endAt: end,
          timezone: 'America/New_York',
          isPublished: true,
          version: 1,
          publicationBatchId: `BATCH-FALL2026-W${wOffset}`,
        });
      }

      // LAB-301: AI401 Mon/Wed 14:00 - 16:00 UTC
      for (const d of [0, 2]) {
        const { start, end } = makeSessionUtc(d + wOffset, 14, 0, 16, 0);
        timetableEntriesToInsert.push({
          resource: resourceMap['LAB-301'],
          academicTerm: 'FALL-2026',
          courseCode: 'AI401',
          courseTitle: 'Deep Learning Studio & Practicum',
          instructorName: 'Dr. Geoffrey Hinton',
          startAt: start,
          endAt: end,
          timezone: 'America/New_York',
          isPublished: true,
          version: 1,
          publicationBatchId: `BATCH-FALL2026-W${wOffset}`,
        });
      }

      // SEM-204: SE305 Tue/Thu 14:00 - 15:30 UTC
      for (const d of [1, 3]) {
        const { start, end } = makeSessionUtc(d + wOffset, 14, 0, 15, 30);
        timetableEntriesToInsert.push({
          resource: resourceMap['SEM-204'],
          academicTerm: 'FALL-2026',
          courseCode: 'SE305',
          courseTitle: 'Software Architecture Seminar',
          instructorName: 'Dr. Grace Hopper',
          startAt: start,
          endAt: end,
          timezone: 'America/New_York',
          isPublished: true,
          version: 1,
          publicationBatchId: `BATCH-FALL2026-W${wOffset}`,
        });
      }
    }

    // Clean existing seed timetable entries and insert fresh
    await TimetableEntry.deleteMany({ publicationBatchId: { $regex: /^BATCH-FALL2026/ } });
    await TimetableEntry.insertMany(timetableEntriesToInsert);
    logger.info(`Inserted ${timetableEntriesToInsert.length} academic timetable sessions across 3 weeks.`);

    // 6. Seed Sample User Bookings
    logger.info('Seeding sample user bookings...');
    // Clean existing reservations to ensure a clean development baseline without stale test/QA contamination
    await Reservation.deleteMany({});
    const studentId = userMap['student@campusflow.edu'];

    // Booking 1: On LH-102 (Hopper Lecture Hall) Thursday 14:00 - 15:00 UTC
    const b1Times = makeSessionUtc(3, 14, 0, 15, 0);
    // Booking 2: On SEM-204 (Seminar Room) Friday 10:00 - 11:30 UTC
    const b2Times = makeSessionUtc(4, 10, 0, 11, 30);

    const sampleBookings = [
      {
        resource: resourceMap['LH-102'],
        user: studentId,
        title: 'Study Group: Distributed Systems Design',
        description: 'Weekly peer review and assignment collaboration group.',
        startAt: b1Times.start,
        endAt: b1Times.end,
        timezone: 'America/New_York',
        status: ReservationStatus.CONFIRMED,
      },
      {
        resource: resourceMap['SEM-204'],
        user: studentId,
        title: 'Student Association Committee Meeting',
        description: 'Bi-weekly agenda planning and student feedback review.',
        startAt: b2Times.start,
        endAt: b2Times.end,
        timezone: 'America/New_York',
        status: ReservationStatus.CONFIRMED,
      },
    ];

    for (const b of sampleBookings) {
      await Reservation.findOneAndUpdate(
        { resource: b.resource, user: b.user, startAt: b.startAt },
        { $set: b },
        { upsert: true, setDefaultsOnInsert: true }
      );
    }
    logger.info(`Sample reservations seeded for Alex Chen (student@campusflow.edu).`);

    // 7. Seed Demo Approval Policy (Phase 3.2)
    logger.info('Seeding demo approval policy...');
    const labResourceId = resourceMap['LAB-301'];
    await ApprovalPolicy.findOneAndUpdate(
      { name: 'AI & Robotics Lab Student Approval Policy' },
      {
        $set: {
          name: 'AI & Robotics Lab Student Approval Policy',
          description: 'Requires Department Head approval for student access to AI & Robotics Laboratory.',
          scopeType: ApprovalScopeType.RESOURCE,
          resource: labResourceId,
          resourceType: null,
          requesterRole: UserRole.STUDENT,
          requiresApproval: true,
          approvalChain: [
            {
              stepOrder: 1,
              approverRole: ApproverRole.DEPARTMENT_HEAD,
              timeoutHours: 24,
            },
          ],
          isActive: true,
          isArchived: false,
        },
      },
      { upsert: true, setDefaultsOnInsert: true }
    );
    logger.info('Demo approval policy seeded for LAB-301.');

    logger.info('Database seeding completed successfully!');
  } catch (err) {
    logger.error('Failed to seed database:', err instanceof Error ? err.message : err);
    throw err;
  } finally {
    await disconnectDatabase();
  }
}

// Self-invoking execution when called directly via CLI
if (require.main === module) {
  seedDatabase()
    .then(() => {
      process.exit(0);
    })
    .catch(() => {
      process.exit(1);
    });
}

export { seedDatabase };
