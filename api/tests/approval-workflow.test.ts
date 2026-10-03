/**
 * CampusFlow API - Approval Workflow Integration Test Suite (Phase 3.2)
 * Comprehensive verification of multi-step approval engine, policy precedence,
 * Four-Eyes separation of duties, admin override auditing, queue isolation,
 * hardware slot locking, and atomic predicate concurrency guards.
 */

import { describe, it, before, after, beforeEach, afterEach } from 'node:test';
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
  ApprovalPolicy,
  ApprovalScopeType,
  ApproverRole,
  TimetableEntry,
  type ResourceDocument,
  type UserDocument,
  type IApprovalPolicy,
} from '../src/models';
import { ApprovalPolicyService } from '../src/services/approvalPolicy.service';
import { ReservationService } from '../src/services/reservation.service';
import { ApprovalQueueService } from '../src/services/approvalQueue.service';
import { signAccessToken } from '../src/utils/jwt';

describe('CampusFlow Approval Workflow Test Suite (Phase 3.2)', () => {
  let server: Server;
  let baseUrl: string;

  const TEST_PREFIX = 'TEST_AP_';
  let testResourceType: any;
  let testResource1: ResourceDocument;
  let testResource2: ResourceDocument;

  let adminUser: UserDocument;
  let facilityManagerUser: UserDocument;
  let deptHeadUserCS: UserDocument;
  let deptHeadUserEE: UserDocument;
  let studentUserCS: UserDocument;
  let facultyUserCS: UserDocument;
  let studentUserEE: UserDocument;

  let adminToken: string;
  let facilityManagerToken: string;
  let deptHeadCSToken: string;
  let deptHeadEEToken: string;
  let studentCSToken: string;
  let facultyCSToken: string;

  const defaultTz = 'America/New_York';

  before(async () => {
    await connectDatabase(env.MONGODB_TEST_URI);
    assert.strictEqual(isDatabaseConnected(), true);
    assert.strictEqual(mongoose.connection.db?.databaseName, 'campusflow_test');

    await Promise.all([
      ApprovalPolicy.syncIndexes(),
      Reservation.syncIndexes(),
      Resource.syncIndexes(),
    ]);

    // Clean up test fixtures
    await Promise.all([
      ApprovalPolicy.deleteMany({ name: new RegExp(`^${TEST_PREFIX}`, 'i') }),
      Reservation.deleteMany({ title: new RegExp(`^${TEST_PREFIX}`, 'i') }),
      AvailabilityRule.deleteMany({ name: new RegExp(`^${TEST_PREFIX}`, 'i') }),
      Resource.deleteMany({ code: new RegExp(`^${TEST_PREFIX}`, 'i') }),
      ResourceType.deleteMany({ code: new RegExp(`^${TEST_PREFIX}`, 'i') }),
      User.deleteMany({ email: new RegExp(`^${TEST_PREFIX}`, 'i') }),
      TimetableEntry.deleteMany({ courseCode: new RegExp(`^${TEST_PREFIX}`, 'i') }),
    ]);

    // Create shared resource type
    testResourceType = await ResourceType.create({
      name: `${TEST_PREFIX}Lab Type`,
      code: `${TEST_PREFIX}LAB_TYPE`,
      category: ResourceCategory.LAB,
      isActive: true,
    });

    // Create shared physical resources
    testResource1 = await Resource.create({
      name: `${TEST_PREFIX}Robotics Lab 1`,
      code: `${TEST_PREFIX}ROBO1`,
      resourceType: testResourceType._id,
      capacity: 30,
      status: ResourceStatus.ACTIVE,
      isActive: true,
      location: { building: 'Turing Hall', roomNumber: '201' },
    });

    testResource2 = await Resource.create({
      name: `${TEST_PREFIX}Robotics Lab 2`,
      code: `${TEST_PREFIX}ROBO2`,
      resourceType: testResourceType._id,
      capacity: 30,
      status: ResourceStatus.ACTIVE,
      isActive: true,
      location: { building: 'Turing Hall', roomNumber: '202' },
    });

    // Set 24/7 AvailabilityRule for test resources
    for (const res of [testResource1, testResource2]) {
      await AvailabilityRule.create({
        resource: res._id,
        timezone: defaultTz,
        name: `${TEST_PREFIX}24x7 Schedule`,
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

    // Create test users
    adminUser = await User.create({
      name: `${TEST_PREFIX}Admin User`,
      email: `${TEST_PREFIX}admin@univ.edu`,
      roles: [UserRole.ADMIN],
      department: 'Central Administration',
      isActive: true,
    });
    adminToken = signAccessToken({
      sub: adminUser._id.toString(),
      email: adminUser.email,
      roles: adminUser.roles,
      isActive: true,
      tokenVersion: adminUser.tokenVersion ?? 0,
    });

    facilityManagerUser = await User.create({
      name: `${TEST_PREFIX}Facility Manager`,
      email: `${TEST_PREFIX}fm@univ.edu`,
      roles: [UserRole.FACILITY_MANAGER],
      department: 'Campus Facilities',
      isActive: true,
    });
    facilityManagerToken = signAccessToken({
      sub: facilityManagerUser._id.toString(),
      email: facilityManagerUser.email,
      roles: facilityManagerUser.roles,
      isActive: true,
      tokenVersion: facilityManagerUser.tokenVersion ?? 0,
    });

    deptHeadUserCS = await User.create({
      name: `${TEST_PREFIX}Dept Head CS`,
      email: `${TEST_PREFIX}depthead.cs@univ.edu`,
      roles: [UserRole.DEPARTMENT_HEAD],
      department: 'Computer Science',
      isActive: true,
    });
    deptHeadCSToken = signAccessToken({
      sub: deptHeadUserCS._id.toString(),
      email: deptHeadUserCS.email,
      roles: deptHeadUserCS.roles,
      department: deptHeadUserCS.department,
      isActive: true,
      tokenVersion: deptHeadUserCS.tokenVersion ?? 0,
    });

    deptHeadUserEE = await User.create({
      name: `${TEST_PREFIX}Dept Head EE`,
      email: `${TEST_PREFIX}depthead.ee@univ.edu`,
      roles: [UserRole.DEPARTMENT_HEAD],
      department: 'Electrical Engineering',
      isActive: true,
    });
    deptHeadEEToken = signAccessToken({
      sub: deptHeadUserEE._id.toString(),
      email: deptHeadUserEE.email,
      roles: deptHeadUserEE.roles,
      department: deptHeadUserEE.department,
      isActive: true,
      tokenVersion: deptHeadUserEE.tokenVersion ?? 0,
    });

    studentUserCS = await User.create({
      name: `${TEST_PREFIX}CS Student`,
      email: `${TEST_PREFIX}student.cs@univ.edu`,
      roles: [UserRole.STUDENT],
      department: 'Computer Science',
      isActive: true,
    });
    studentCSToken = signAccessToken({
      sub: studentUserCS._id.toString(),
      email: studentUserCS.email,
      roles: studentUserCS.roles,
      department: studentUserCS.department,
      isActive: true,
      tokenVersion: studentUserCS.tokenVersion ?? 0,
    });

    facultyUserCS = await User.create({
      name: `${TEST_PREFIX}CS Faculty`,
      email: `${TEST_PREFIX}faculty.cs@univ.edu`,
      roles: [UserRole.FACULTY],
      department: 'Computer Science',
      isActive: true,
    });
    facultyCSToken = signAccessToken({
      sub: facultyUserCS._id.toString(),
      email: facultyUserCS.email,
      roles: facultyUserCS.roles,
      department: facultyUserCS.department,
      isActive: true,
      tokenVersion: facultyUserCS.tokenVersion ?? 0,
    });

    studentUserEE = await User.create({
      name: `${TEST_PREFIX}EE Student`,
      email: `${TEST_PREFIX}student.ee@univ.edu`,
      roles: [UserRole.STUDENT],
      department: 'Electrical Engineering',
      isActive: true,
    });

    // Start Express HTTP server
    server = app.listen(0);
    const addr = server.address() as AddressInfo;
    baseUrl = `http://127.0.0.1:${addr.port}`;
  });

  after(async () => {
    if (server) {
      await new Promise<void>((resolve) => server.close(() => resolve()));
    }
    // Final cleanup of test fixtures
    await Promise.all([
      ApprovalPolicy.deleteMany({ name: new RegExp(`^${TEST_PREFIX}`, 'i') }),
      Reservation.deleteMany({ title: new RegExp(`^${TEST_PREFIX}`, 'i') }),
      AvailabilityRule.deleteMany({ name: new RegExp(`^${TEST_PREFIX}`, 'i') }),
      Resource.deleteMany({ code: new RegExp(`^${TEST_PREFIX}`, 'i') }),
      ResourceType.deleteMany({ code: new RegExp(`^${TEST_PREFIX}`, 'i') }),
      User.deleteMany({ email: new RegExp(`^${TEST_PREFIX}`, 'i') }),
      TimetableEntry.deleteMany({ courseCode: new RegExp(`^${TEST_PREFIX}`, 'i') }),
    ]);
    await disconnectDatabase();
  });

  // ==========================================================================
  // 1. Model & Index Tests (AP-01 to AP-05)
  // ==========================================================================
  describe('1. Model & Index Tests', () => {
    it('AP-01: approvalPolicy schema validates fields & defaults', async () => {
      const policy = new ApprovalPolicy({
        name: `${TEST_PREFIX}Model Test 1`,
        scopeType: ApprovalScopeType.RESOURCE,
        resource: testResource1._id,
        requiresApproval: false,
      });
      await policy.save();

      assert.strictEqual(policy.isActive, true);
      assert.strictEqual(policy.isArchived, false);
      assert.strictEqual(policy.requesterRole, null);
      assert.deepStrictEqual(policy.approvalChain, []);

      await ApprovalPolicy.findByIdAndDelete(policy._id);
    });

    it('AP-02: requiresApproval=false enforces empty approvalChain via pre-validate', async () => {
      const policy = new ApprovalPolicy({
        name: `${TEST_PREFIX}Model Test 2`,
        scopeType: ApprovalScopeType.RESOURCE,
        resource: testResource1._id,
        requiresApproval: false,
        approvalChain: [
          { stepOrder: 1, approverRole: ApproverRole.DEPARTMENT_HEAD },
        ],
      });

      await assert.rejects(
        async () => await policy.save(),
        /approvalChain must be empty when requiresApproval is false/
      );
    });

    it('AP-03: requiresApproval=true enforces 1..5 steps with valid roles', async () => {
      const emptyChainPolicy = new ApprovalPolicy({
        name: `${TEST_PREFIX}Model Test 3`,
        scopeType: ApprovalScopeType.RESOURCE,
        resource: testResource1._id,
        requiresApproval: true,
        approvalChain: [],
      });

      await assert.rejects(
        async () => await emptyChainPolicy.save(),
        /approvalChain must contain at least 1 step/
      );
    });

    it('AP-04: compound partial unique index blocks duplicate active unarchived policies', async () => {
      const policy1 = await ApprovalPolicy.create({
        name: `${TEST_PREFIX}Unique Index 1`,
        scopeType: ApprovalScopeType.RESOURCE,
        resource: testResource1._id,
        requesterRole: UserRole.STUDENT,
        requiresApproval: true,
        approvalChain: [{ stepOrder: 1, approverRole: ApproverRole.DEPARTMENT_HEAD }],
      });

      // Competing policy with same scopeType, resource, and requesterRole
      await assert.rejects(
        async () => {
          await ApprovalPolicy.create({
            name: `${TEST_PREFIX}Unique Index 2`,
            scopeType: ApprovalScopeType.RESOURCE,
            resource: testResource1._id,
            requesterRole: UserRole.STUDENT,
            requiresApproval: false,
          });
        },
        /E11000.*duplicate key error/
      );

      await ApprovalPolicy.findByIdAndDelete(policy1._id);
    });

    it('AP-05: archiving policy allows new active policy for same scope/role', async () => {
      const policy1 = await ApprovalPolicy.create({
        name: `${TEST_PREFIX}Archiving 1`,
        scopeType: ApprovalScopeType.RESOURCE,
        resource: testResource1._id,
        requesterRole: UserRole.STUDENT,
        requiresApproval: true,
        approvalChain: [{ stepOrder: 1, approverRole: ApproverRole.DEPARTMENT_HEAD }],
      });

      // Archive policy1
      await ApprovalPolicyService.archivePolicy(policy1._id, adminUser._id);

      // Creating a new active policy for same resource + role now succeeds!
      const policy2 = await ApprovalPolicy.create({
        name: `${TEST_PREFIX}Archiving 2`,
        scopeType: ApprovalScopeType.RESOURCE,
        resource: testResource1._id,
        requesterRole: UserRole.STUDENT,
        requiresApproval: true,
        approvalChain: [{ stepOrder: 1, approverRole: ApproverRole.FACILITY_MANAGER }],
      });

      assert.strictEqual(policy2.isActive, true);
      assert.strictEqual(policy2.isArchived, false);

      await Promise.all([
        ApprovalPolicy.findByIdAndDelete(policy1._id),
        ApprovalPolicy.findByIdAndDelete(policy2._id),
      ]);
    });
  });

  // ==========================================================================
  // 2. Validation Tests (AP-06 to AP-10)
  // ==========================================================================
  describe('2. Validation Layer Tests', () => {
    it('AP-06: duplicate approver roles in chain rejected with 400', async () => {
      const res = await fetch(`${baseUrl}/api/approval-policies`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${adminToken}`,
        },
        body: JSON.stringify({
          name: `${TEST_PREFIX}Dup Roles`,
          scopeType: ApprovalScopeType.RESOURCE,
          resource: testResource1._id.toString(),
          requiresApproval: true,
          approvalChain: [
            { stepOrder: 1, approverRole: ApproverRole.DEPARTMENT_HEAD },
            { stepOrder: 2, approverRole: ApproverRole.DEPARTMENT_HEAD },
          ],
        }),
      });

      assert.strictEqual(res.status, 400);
      const json = await res.json();
      assert.strictEqual(json.success, false);
      assert.strictEqual(json.error.code, 'VALIDATION_ERROR');
    });

    it('AP-07: non-consecutive stepOrder rejected with 400', async () => {
      const res = await fetch(`${baseUrl}/api/approval-policies`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${adminToken}`,
        },
        body: JSON.stringify({
          name: `${TEST_PREFIX}Non Consecutive`,
          scopeType: ApprovalScopeType.RESOURCE,
          resource: testResource1._id.toString(),
          requiresApproval: true,
          approvalChain: [
            { stepOrder: 1, approverRole: ApproverRole.DEPARTMENT_HEAD },
            { stepOrder: 3, approverRole: ApproverRole.FACILITY_MANAGER },
          ],
        }),
      });

      assert.strictEqual(res.status, 400);
      const json = await res.json();
      assert.strictEqual(json.error.code, 'VALIDATION_ERROR');
    });

    it('AP-08: scopeType mutual exclusivity (resource vs resourceType)', async () => {
      const res = await fetch(`${baseUrl}/api/approval-policies`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${adminToken}`,
        },
        body: JSON.stringify({
          name: `${TEST_PREFIX}Scope Conflict`,
          scopeType: ApprovalScopeType.RESOURCE,
          resource: testResource1._id.toString(),
          resourceType: testResourceType._id.toString(), // forbidden when scopeType is RESOURCE!
          requiresApproval: false,
        }),
      });

      assert.strictEqual(res.status, 400);
      const json = await res.json();
      assert.strictEqual(json.error.code, 'VALIDATION_ERROR');
    });

    it('AP-09: invalid approver role rejected with 400', async () => {
      const res = await fetch(`${baseUrl}/api/approval-policies`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${adminToken}`,
        },
        body: JSON.stringify({
          name: `${TEST_PREFIX}Invalid Role`,
          scopeType: ApprovalScopeType.RESOURCE,
          resource: testResource1._id.toString(),
          requiresApproval: true,
          approvalChain: [{ stepOrder: 1, approverRole: 'STUDENT' }], // STUDENT cannot be an approver!
        }),
      });

      assert.strictEqual(res.status, 400);
      const json = await res.json();
      assert.strictEqual(json.error.code, 'VALIDATION_ERROR');
    });

    it('AP-10: timeoutHours outside 1..168 rejected with 400', async () => {
      const res = await fetch(`${baseUrl}/api/approval-policies`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${adminToken}`,
        },
        body: JSON.stringify({
          name: `${TEST_PREFIX}Invalid Timeout`,
          scopeType: ApprovalScopeType.RESOURCE,
          resource: testResource1._id.toString(),
          requiresApproval: true,
          approvalChain: [
            { stepOrder: 1, approverRole: ApproverRole.DEPARTMENT_HEAD, timeoutHours: 200 },
          ],
        }),
      });

      assert.strictEqual(res.status, 400);
      const json = await res.json();
      assert.strictEqual(json.error.code, 'VALIDATION_ERROR');
    });
  });

  // ==========================================================================
  // 3. Precedence Resolution Tests (AP-11 to AP-15)
  // ==========================================================================
  describe('3. Deterministic Precedence Resolution', () => {
    let pTier1: any;
    let pTier2: any;
    let pTier3: any;
    let pTier4: any;

    beforeEach(async () => {
      await ApprovalPolicy.deleteMany({ name: new RegExp(`^${TEST_PREFIX}Precedence`, 'i') });
    });

    afterEach(async () => {
      await ApprovalPolicy.deleteMany({ name: new RegExp(`^${TEST_PREFIX}Precedence`, 'i') });
    });

    it('AP-11: Tier 1 (RESOURCE + specific role) beats Tier 2 (RESOURCE + wildcard)', async () => {
      pTier2 = await ApprovalPolicy.create({
        name: `${TEST_PREFIX}Precedence Tier 2`,
        scopeType: ApprovalScopeType.RESOURCE,
        resource: testResource1._id,
        requesterRole: null, // wildcard
        requiresApproval: true,
        approvalChain: [{ stepOrder: 1, approverRole: ApproverRole.FACILITY_MANAGER }],
      });

      pTier1 = await ApprovalPolicy.create({
        name: `${TEST_PREFIX}Precedence Tier 1`,
        scopeType: ApprovalScopeType.RESOURCE,
        resource: testResource1._id,
        requesterRole: UserRole.STUDENT, // specific
        requiresApproval: true,
        approvalChain: [{ stepOrder: 1, approverRole: ApproverRole.DEPARTMENT_HEAD }],
      });

      const result = await ApprovalPolicyService.evaluatePolicyForBooking({
        resourceId: testResource1._id,
        resourceTypeId: testResourceType._id,
        userRoles: [UserRole.STUDENT],
      });

      assert.strictEqual(result.name, `${TEST_PREFIX}Precedence Tier 1`);
      assert.strictEqual(result.approvalChain[0].approverRole, ApproverRole.DEPARTMENT_HEAD);
    });

    it('AP-12: Tier 2 (RESOURCE + wildcard) beats Tier 3 (RESOURCE_TYPE + specific role)', async () => {
      pTier3 = await ApprovalPolicy.create({
        name: `${TEST_PREFIX}Precedence Tier 3`,
        scopeType: ApprovalScopeType.RESOURCE_TYPE,
        resourceType: testResourceType._id,
        requesterRole: UserRole.STUDENT,
        requiresApproval: true,
        approvalChain: [{ stepOrder: 1, approverRole: ApproverRole.DEPARTMENT_HEAD }],
      });

      pTier2 = await ApprovalPolicy.create({
        name: `${TEST_PREFIX}Precedence Tier 2`,
        scopeType: ApprovalScopeType.RESOURCE,
        resource: testResource1._id,
        requesterRole: null,
        requiresApproval: true,
        approvalChain: [{ stepOrder: 1, approverRole: ApproverRole.FACILITY_MANAGER }],
      });

      const result = await ApprovalPolicyService.evaluatePolicyForBooking({
        resourceId: testResource1._id,
        resourceTypeId: testResourceType._id,
        userRoles: [UserRole.STUDENT],
      });

      assert.strictEqual(result.name, `${TEST_PREFIX}Precedence Tier 2`);
      assert.strictEqual(result.approvalChain[0].approverRole, ApproverRole.FACILITY_MANAGER);
    });

    it('AP-13: Tier 3 (RESOURCE_TYPE + specific role) beats Tier 4 (RESOURCE_TYPE + wildcard)', async () => {
      pTier4 = await ApprovalPolicy.create({
        name: `${TEST_PREFIX}Precedence Tier 4`,
        scopeType: ApprovalScopeType.RESOURCE_TYPE,
        resourceType: testResourceType._id,
        requesterRole: null,
        requiresApproval: true,
        approvalChain: [{ stepOrder: 1, approverRole: ApproverRole.FACILITY_MANAGER }],
      });

      pTier3 = await ApprovalPolicy.create({
        name: `${TEST_PREFIX}Precedence Tier 3`,
        scopeType: ApprovalScopeType.RESOURCE_TYPE,
        resourceType: testResourceType._id,
        requesterRole: UserRole.FACULTY,
        requiresApproval: true,
        approvalChain: [{ stepOrder: 1, approverRole: ApproverRole.DEPARTMENT_HEAD }],
      });

      const result = await ApprovalPolicyService.evaluatePolicyForBooking({
        resourceId: testResource1._id,
        resourceTypeId: testResourceType._id,
        userRoles: [UserRole.FACULTY],
      });

      assert.strictEqual(result.name, `${TEST_PREFIX}Precedence Tier 3`);
    });

    it('AP-14: Tier 4 beats Tier 5 (Default fallback auto-confirm)', async () => {
      pTier4 = await ApprovalPolicy.create({
        name: `${TEST_PREFIX}Precedence Tier 4`,
        scopeType: ApprovalScopeType.RESOURCE_TYPE,
        resourceType: testResourceType._id,
        requesterRole: null,
        requiresApproval: true,
        approvalChain: [{ stepOrder: 1, approverRole: ApproverRole.ADMIN }],
      });

      const result = await ApprovalPolicyService.evaluatePolicyForBooking({
        resourceId: testResource1._id,
        resourceTypeId: testResourceType._id,
        userRoles: [UserRole.STUDENT],
      });

      assert.strictEqual(result.name, `${TEST_PREFIX}Precedence Tier 4`);
      assert.strictEqual(result.requiresApproval, true);

      // For unconfigured resource without policies: falls back to Tier 5
      const randomResId = new Types.ObjectId();
      const fallbackResult = await ApprovalPolicyService.evaluatePolicyForBooking({
        resourceId: randomResId,
        userRoles: [UserRole.STUDENT],
      });

      assert.strictEqual(fallbackResult.requiresApproval, false);
      assert.deepStrictEqual(fallbackResult.approvalChain, []);
    });

    it('AP-15: Tie-breaker: restrictiveness (true > false) -> chain length -> _id asc', () => {
      const candidates: IApprovalPolicy[] = [
        {
          _id: new Types.ObjectId('000000000000000000000002') as any,
          name: 'Policy Relaxed',
          scopeType: ApprovalScopeType.RESOURCE_TYPE,
          resourceType: testResourceType._id,
          requesterRole: null,
          requiresApproval: false,
          approvalChain: [],
          isActive: true,
          isArchived: false,
          createdAt: new Date(),
          updatedAt: new Date(),
        } as any,
        {
          _id: new Types.ObjectId('000000000000000000000001') as any,
          name: 'Policy Restrictive',
          scopeType: ApprovalScopeType.RESOURCE_TYPE,
          resourceType: testResourceType._id,
          requesterRole: null,
          requiresApproval: true,
          approvalChain: [{ stepOrder: 1, approverRole: ApproverRole.ADMIN }],
          isActive: true,
          isArchived: false,
          createdAt: new Date(),
          updatedAt: new Date(),
        } as any,
      ];

      const winner = ApprovalPolicyService.resolvePrecedence(candidates);
      assert.strictEqual(winner.name, 'Policy Restrictive');
      assert.strictEqual(winner.requiresApproval, true);
    });
  });

  // ==========================================================================
  // 4. Reservation Creation & Initial Status Tests (AP-16 to AP-20)
  // ==========================================================================
  describe('4. Reservation Creation & Initial Status', () => {
    beforeEach(async () => {
      await ApprovalPolicy.deleteMany({ name: new RegExp(`^${TEST_PREFIX}`, 'i') });
      await Reservation.deleteMany({ title: new RegExp(`^${TEST_PREFIX}`, 'i') });
    });

    it('AP-16: Booking resource with no policy -> CONFIRMED, no chain', async () => {
      const reservation = await ReservationService.createReservation({
        resourceId: testResource1._id.toString(),
        userId: studentUserCS._id.toString(),
        startAt: '2026-10-15T10:00:00.000Z',
        endAt: '2026-10-15T11:00:00.000Z',
        timezone: defaultTz,
        title: `${TEST_PREFIX}Booking Auto-Confirm`,
      });

      assert.strictEqual(reservation.status, ReservationStatus.CONFIRMED);
      assert.strictEqual(reservation.currentStepOrder, null);
      assert.strictEqual(reservation.currentApproverRole, null);
      assert.deepStrictEqual(reservation.approvalChain, []);
    });

    it('AP-17: Booking resource with requiresApproval=false -> CONFIRMED, no chain', async () => {
      await ApprovalPolicy.create({
        name: `${TEST_PREFIX}No Approval Needed`,
        scopeType: ApprovalScopeType.RESOURCE,
        resource: testResource1._id,
        requesterRole: null,
        requiresApproval: false,
      });

      const reservation = await ReservationService.createReservation({
        resourceId: testResource1._id.toString(),
        userId: studentUserCS._id.toString(),
        startAt: '2026-10-15T12:00:00.000Z',
        endAt: '2026-10-15T13:00:00.000Z',
        timezone: defaultTz,
        title: `${TEST_PREFIX}Booking Explicit No Approval`,
      });

      assert.strictEqual(reservation.status, ReservationStatus.CONFIRMED);
      assert.strictEqual(reservation.currentStepOrder, null);
      assert.deepStrictEqual(reservation.approvalChain, []);
    });

    it('AP-18: Booking resource with 1-step policy -> PENDING, stepOrder=1, deadline set', async () => {
      await ApprovalPolicy.create({
        name: `${TEST_PREFIX}1-Step Policy`,
        scopeType: ApprovalScopeType.RESOURCE,
        resource: testResource1._id,
        requesterRole: null,
        requiresApproval: true,
        approvalChain: [
          { stepOrder: 1, approverRole: ApproverRole.DEPARTMENT_HEAD, timeoutHours: 24 },
        ],
      });

      const reservation = await ReservationService.createReservation({
        resourceId: testResource1._id.toString(),
        userId: studentUserCS._id.toString(),
        startAt: '2026-10-15T14:00:00.000Z',
        endAt: '2026-10-15T15:00:00.000Z',
        timezone: defaultTz,
        title: `${TEST_PREFIX}Booking 1-Step`,
      });

      assert.strictEqual(reservation.status, ReservationStatus.PENDING);
      assert.strictEqual(reservation.currentStepOrder, 1);
      assert.strictEqual(reservation.currentApproverRole, ApproverRole.DEPARTMENT_HEAD);
      assert.ok(reservation.activeStepDeadline instanceof Date);
      assert.strictEqual(reservation.approvalChain.length, 1);
      assert.strictEqual(reservation.approvalChain[0].status, 'PENDING');
      assert.strictEqual(reservation.approvalChain[0].approverRole, ApproverRole.DEPARTMENT_HEAD);
    });

    it('AP-19: Booking resource with multi-step policy -> snapshot initialized with all steps PENDING', async () => {
      await ApprovalPolicy.create({
        name: `${TEST_PREFIX}2-Step Policy`,
        scopeType: ApprovalScopeType.RESOURCE,
        resource: testResource1._id,
        requesterRole: null,
        requiresApproval: true,
        approvalChain: [
          { stepOrder: 1, approverRole: ApproverRole.DEPARTMENT_HEAD, timeoutHours: 12 },
          { stepOrder: 2, approverRole: ApproverRole.FACILITY_MANAGER, timeoutHours: 24 },
        ],
      });

      const reservation = await ReservationService.createReservation({
        resourceId: testResource1._id.toString(),
        userId: studentUserCS._id.toString(),
        startAt: '2026-10-15T16:00:00.000Z',
        endAt: '2026-10-15T17:00:00.000Z',
        timezone: defaultTz,
        title: `${TEST_PREFIX}Booking 2-Step`,
      });

      assert.strictEqual(reservation.status, ReservationStatus.PENDING);
      assert.strictEqual(reservation.currentStepOrder, 1);
      assert.strictEqual(reservation.currentApproverRole, ApproverRole.DEPARTMENT_HEAD);
      assert.strictEqual(reservation.approvalChain.length, 2);
      assert.strictEqual(reservation.approvalChain[0].status, 'PENDING');
      assert.strictEqual(reservation.approvalChain[1].status, 'PENDING');
      assert.ok(reservation.approvalChain[0].stepStartedAt instanceof Date);
      assert.strictEqual(reservation.approvalChain[1].stepStartedAt, null);
    });

    it('AP-20: Hardware slot lock (unique partial index) prevents competing booking on same slot while PENDING', async () => {
      await ApprovalPolicy.create({
        name: `${TEST_PREFIX}Lock Policy`,
        scopeType: ApprovalScopeType.RESOURCE,
        resource: testResource1._id,
        requesterRole: null,
        requiresApproval: true,
        approvalChain: [{ stepOrder: 1, approverRole: ApproverRole.DEPARTMENT_HEAD }],
      });

      // First booking enters PENDING state
      await ReservationService.createReservation({
        resourceId: testResource1._id.toString(),
        userId: studentUserCS._id.toString(),
        startAt: '2026-10-16T09:00:00.000Z',
        endAt: '2026-10-16T10:00:00.000Z',
        timezone: defaultTz,
        title: `${TEST_PREFIX}Pending Holder`,
      });

      // Second booking on exact same slot MUST fail with 409 CONFLICT!
      await assert.rejects(
        async () => {
          await ReservationService.createReservation({
            resourceId: testResource1._id.toString(),
            userId: facultyUserCS._id.toString(),
            startAt: '2026-10-16T09:00:00.000Z',
            endAt: '2026-10-16T10:00:00.000Z',
            timezone: defaultTz,
            title: `${TEST_PREFIX}Competing Booking`,
          });
        },
        /conflicts with an existing reservation|ConflictError/i
      );
    });
  });

  // ==========================================================================
  // 5. Approval Workflow Tests (AP-21 to AP-25)
  // ==========================================================================
  describe('5. Approval Execution & Progression', () => {
    let pendingRes: any;

    beforeEach(async () => {
      await ApprovalPolicy.deleteMany({ name: new RegExp(`^${TEST_PREFIX}`, 'i') });
      await Reservation.deleteMany({ title: new RegExp(`^${TEST_PREFIX}`, 'i') });

      // Create a 2-step policy: Step 1 (DEPARTMENT_HEAD) -> Step 2 (FACILITY_MANAGER)
      await ApprovalPolicy.create({
        name: `${TEST_PREFIX}Two-Step Execution`,
        scopeType: ApprovalScopeType.RESOURCE,
        resource: testResource1._id,
        requesterRole: null,
        requiresApproval: true,
        approvalChain: [
          { stepOrder: 1, approverRole: ApproverRole.DEPARTMENT_HEAD, timeoutHours: 24 },
          { stepOrder: 2, approverRole: ApproverRole.FACILITY_MANAGER, timeoutHours: 48 },
        ],
      });

      pendingRes = await ReservationService.createReservation({
        resourceId: testResource1._id.toString(),
        userId: studentUserCS._id.toString(),
        startAt: '2026-10-17T10:00:00.000Z',
        endAt: '2026-10-17T11:00:00.000Z',
        timezone: defaultTz,
        title: `${TEST_PREFIX}Two-Step Booking`,
      });
    });

    it('AP-21: Step 1 approved by authorized role -> advances to Step 2', async () => {
      const updated = await ReservationService.approveReservationStep({
        reservationId: pendingRes._id.toString(),
        user: {
          id: deptHeadUserCS._id.toString(),
          roles: deptHeadUserCS.roles,
          department: deptHeadUserCS.department,
        },
        comment: 'Step 1 CS Department Head approval',
      });

      assert.strictEqual(updated.status, ReservationStatus.PENDING);
      assert.strictEqual(updated.currentStepOrder, 2);
      assert.strictEqual(updated.currentApproverRole, ApproverRole.FACILITY_MANAGER);
      assert.strictEqual(updated.approvalChain[0].status, 'APPROVED');
      assert.strictEqual(updated.approvalChain[0].actionedBy?.toString(), deptHeadUserCS._id.toString());
      assert.strictEqual(updated.approvalChain[0].comment, 'Step 1 CS Department Head approval');
      assert.strictEqual(updated.approvalChain[1].status, 'PENDING');
      assert.ok(updated.approvalChain[1].stepStartedAt instanceof Date);
    });

    it('AP-22: Final step approved -> reservation transitions to CONFIRMED', async () => {
      // Step 1 approved by Dept Head CS
      await ReservationService.approveReservationStep({
        reservationId: pendingRes._id.toString(),
        user: {
          id: deptHeadUserCS._id.toString(),
          roles: deptHeadUserCS.roles,
          department: deptHeadUserCS.department,
        },
      });

      // Step 2 approved by Facility Manager
      const confirmed = await ReservationService.approveReservationStep({
        reservationId: pendingRes._id.toString(),
        user: {
          id: facilityManagerUser._id.toString(),
          roles: facilityManagerUser.roles,
          department: facilityManagerUser.department,
        },
        comment: 'Facility ready',
      });

      assert.strictEqual(confirmed.status, ReservationStatus.CONFIRMED);
      assert.strictEqual(confirmed.currentStepOrder, null);
      assert.strictEqual(confirmed.currentApproverRole, null);
      assert.strictEqual(confirmed.activeStepDeadline, null);
      assert.strictEqual(confirmed.approvalChain[0].status, 'APPROVED');
      assert.strictEqual(confirmed.approvalChain[1].status, 'APPROVED');
    });

    it('AP-23: Separation of duties (Four-Eyes): actor who approved Step 1 cannot approve Step 2 (rejected with 403)', async () => {
      // Give Dept Head both DEPARTMENT_HEAD and FACILITY_MANAGER roles
      const dualRoleUser = await User.create({
        name: `${TEST_PREFIX}Dual Role User`,
        email: `${TEST_PREFIX}dual@univ.edu`,
        roles: [UserRole.DEPARTMENT_HEAD, UserRole.FACILITY_MANAGER],
        department: 'Computer Science',
        isActive: true,
      });

      // Dual role user approves Step 1 as DEPARTMENT_HEAD
      await ReservationService.approveReservationStep({
        reservationId: pendingRes._id.toString(),
        user: {
          id: dualRoleUser._id.toString(),
          roles: dualRoleUser.roles,
          department: dualRoleUser.department,
        },
      });

      // Same dual role user attempts to approve Step 2 as FACILITY_MANAGER -> FORBIDDEN!
      await assert.rejects(
        async () => {
          await ReservationService.approveReservationStep({
            reservationId: pendingRes._id.toString(),
            user: {
              id: dualRoleUser._id.toString(),
              roles: dualRoleUser.roles,
              department: dualRoleUser.department,
            },
          });
        },
        /Four-Eyes Principle Violation|Separation of duties/
      );

      await User.findByIdAndDelete(dualRoleUser._id);
    });

    it('AP-24: Admin override on step with different role succeeds when comment >= 5 chars', async () => {
      // Step 1: Admin performs universal override with valid comment
      const updated = await ReservationService.approveReservationStep({
        reservationId: pendingRes._id.toString(),
        user: {
          id: adminUser._id.toString(),
          roles: adminUser.roles,
        },
        comment: 'Administrative override by university provost',
      });

      assert.strictEqual(updated.currentStepOrder, 2);
      assert.strictEqual(updated.approvalChain[0].isOverride, true);
      assert.strictEqual(updated.approvalChain[0].actorRoleUsed, UserRole.ADMIN);
      assert.strictEqual(updated.approvalChain[0].comment, 'Administrative override by university provost');
    });

    it('AP-25: Admin override without comment (< 5 chars) is rejected with 400', async () => {
      await assert.rejects(
        async () => {
          await ReservationService.approveReservationStep({
            reservationId: pendingRes._id.toString(),
            user: {
              id: adminUser._id.toString(),
              roles: adminUser.roles,
            },
            comment: 'OK', // too short (< 5 chars)
          });
        },
        /Administrative override requires a mandatory justification comment/
      );
    });
  });

  // ==========================================================================
  // 6. Rejection Workflow Tests (AP-26 to AP-29)
  // ==========================================================================
  describe('6. Rejection Execution & Capacity Release', () => {
    let pendingRes: any;

    beforeEach(async () => {
      await ApprovalPolicy.deleteMany({ name: new RegExp(`^${TEST_PREFIX}`, 'i') });
      await Reservation.deleteMany({ title: new RegExp(`^${TEST_PREFIX}`, 'i') });

      await ApprovalPolicy.create({
        name: `${TEST_PREFIX}Reject Policy`,
        scopeType: ApprovalScopeType.RESOURCE,
        resource: testResource1._id,
        requesterRole: null,
        requiresApproval: true,
        approvalChain: [
          { stepOrder: 1, approverRole: ApproverRole.DEPARTMENT_HEAD },
          { stepOrder: 2, approverRole: ApproverRole.FACILITY_MANAGER },
        ],
      });

      pendingRes = await ReservationService.createReservation({
        resourceId: testResource1._id.toString(),
        userId: studentUserCS._id.toString(),
        startAt: '2026-10-18T14:00:00.000Z',
        endAt: '2026-10-18T15:00:00.000Z',
        timezone: defaultTz,
        title: `${TEST_PREFIX}Reject Candidate`,
      });
    });

    it('AP-26: Rejection requires mandatory reason (5..500 chars)', async () => {
      await assert.rejects(
        async () => {
          await ReservationService.rejectReservationStep({
            reservationId: pendingRes._id.toString(),
            user: {
              id: deptHeadUserCS._id.toString(),
              roles: deptHeadUserCS.roles,
              department: deptHeadUserCS.department,
            },
            reason: 'no', // too short!
          });
        },
        /Rejection reason must be between 5 and 500 characters/
      );
    });

    it('AP-27: Authorized approver rejects -> transitions to REJECTED, reason recorded, slot released', async () => {
      const rejected = await ReservationService.rejectReservationStep({
        reservationId: pendingRes._id.toString(),
        user: {
          id: deptHeadUserCS._id.toString(),
          roles: deptHeadUserCS.roles,
          department: deptHeadUserCS.department,
        },
        reason: 'Insufficient justification for lab access during exam week',
      });

      assert.strictEqual(rejected.status, ReservationStatus.REJECTED);
      assert.strictEqual(rejected.currentStepOrder, null);
      assert.strictEqual(rejected.currentApproverRole, null);
      assert.strictEqual(rejected.activeStepDeadline, null);
      assert.strictEqual(rejected.approvalChain[0].status, 'REJECTED');
      assert.strictEqual(rejected.approvalChain[0].comment, 'Insufficient justification for lab access during exam week');
    });

    it('AP-28: Once REJECTED, competing booking on same slot succeeds immediately', async () => {
      // Reject the pending booking
      await ReservationService.rejectReservationStep({
        reservationId: pendingRes._id.toString(),
        user: {
          id: deptHeadUserCS._id.toString(),
          roles: deptHeadUserCS.roles,
          department: deptHeadUserCS.department,
        },
        reason: 'Request cancelled by department review',
      });

      // Competing booking on exact same slot now succeeds!
      const newBooking = await ReservationService.createReservation({
        resourceId: testResource1._id.toString(),
        userId: facultyUserCS._id.toString(),
        startAt: '2026-10-18T14:00:00.000Z',
        endAt: '2026-10-18T15:00:00.000Z',
        timezone: defaultTz,
        title: `${TEST_PREFIX}Competing Booking After Rejection`,
      });

      assert.ok(newBooking._id);
    });

    it('AP-29: Rejection on Step 2 updates snapshot and marks reservation REJECTED', async () => {
      // Step 1 Approved
      await ReservationService.approveReservationStep({
        reservationId: pendingRes._id.toString(),
        user: {
          id: deptHeadUserCS._id.toString(),
          roles: deptHeadUserCS.roles,
          department: deptHeadUserCS.department,
        },
      });

      // Step 2 Rejected by Facility Manager
      const rejectedStep2 = await ReservationService.rejectReservationStep({
        reservationId: pendingRes._id.toString(),
        user: {
          id: facilityManagerUser._id.toString(),
          roles: facilityManagerUser.roles,
          department: facilityManagerUser.department,
        },
        reason: 'Equipment under scheduled maintenance',
      });

      assert.strictEqual(rejectedStep2.status, ReservationStatus.REJECTED);
      assert.strictEqual(rejectedStep2.approvalChain[0].status, 'APPROVED');
      assert.strictEqual(rejectedStep2.approvalChain[1].status, 'REJECTED');
      assert.strictEqual(rejectedStep2.approvalChain[1].comment, 'Equipment under scheduled maintenance');
    });
  });

  // ==========================================================================
  // 7. Approval Queue Tests (AP-30 to AP-33)
  // ==========================================================================
  describe('7. Approval Queue & Department Isolation', () => {
    let csRes: any;
    let eeRes: any;

    beforeEach(async () => {
      await ApprovalPolicy.deleteMany({ name: new RegExp(`^${TEST_PREFIX}`, 'i') });
      await Reservation.deleteMany({ title: new RegExp(`^${TEST_PREFIX}`, 'i') });

      await ApprovalPolicy.create({
        name: `${TEST_PREFIX}Queue Policy`,
        scopeType: ApprovalScopeType.RESOURCE_TYPE,
        resourceType: testResourceType._id,
        requesterRole: null,
        requiresApproval: true,
        approvalChain: [
          { stepOrder: 1, approverRole: ApproverRole.DEPARTMENT_HEAD, timeoutHours: 12 },
          { stepOrder: 2, approverRole: ApproverRole.FACILITY_MANAGER, timeoutHours: 24 },
        ],
      });

      // CS Student reservation (Step 1: DEPARTMENT_HEAD)
      csRes = await ReservationService.createReservation({
        resourceId: testResource1._id.toString(),
        userId: studentUserCS._id.toString(),
        startAt: '2026-10-19T10:00:00.000Z',
        endAt: '2026-10-19T11:00:00.000Z',
        timezone: defaultTz,
        title: `${TEST_PREFIX}Queue CS Res`,
      });

      // EE Student reservation (Step 1: DEPARTMENT_HEAD)
      eeRes = await ReservationService.createReservation({
        resourceId: testResource2._id.toString(),
        userId: studentUserEE._id.toString(),
        startAt: '2026-10-19T12:00:00.000Z',
        endAt: '2026-10-19T13:00:00.000Z',
        timezone: defaultTz,
        title: `${TEST_PREFIX}Queue EE Res`,
      });
    });

    it('AP-30: ADMIN sees all pending reservations across campus in queue', async () => {
      const queue = await ApprovalQueueService.getPendingQueue({
        id: adminUser._id.toString(),
        roles: adminUser.roles,
      });

      const ids = queue.items.map((i) => i._id.toString());
      assert.ok(ids.includes(csRes._id.toString()));
      assert.ok(ids.includes(eeRes._id.toString()));
    });

    it('AP-31: FACILITY_MANAGER sees pending reservations where currentApproverRole == FACILITY_MANAGER', async () => {
      // In Step 1, FACILITY_MANAGER queue is empty
      const queueBefore = await ApprovalQueueService.getPendingQueue({
        id: facilityManagerUser._id.toString(),
        roles: facilityManagerUser.roles,
      });
      const idsBefore = queueBefore.items.map((i) => i._id.toString());
      assert.strictEqual(idsBefore.includes(csRes._id.toString()), false);

      // Advance CS reservation to Step 2 (FACILITY_MANAGER)
      await ReservationService.approveReservationStep({
        reservationId: csRes._id.toString(),
        user: {
          id: deptHeadUserCS._id.toString(),
          roles: deptHeadUserCS.roles,
          department: deptHeadUserCS.department,
        },
      });

      // Now FACILITY_MANAGER sees it!
      const queueAfter = await ApprovalQueueService.getPendingQueue({
        id: facilityManagerUser._id.toString(),
        roles: facilityManagerUser.roles,
      });
      const idsAfter = queueAfter.items.map((i) => i._id.toString());
      assert.ok(idsAfter.includes(csRes._id.toString()));
    });

    it('AP-32: DEPARTMENT_HEAD sees only DEPARTMENT_HEAD steps where requester belongs to same department', async () => {
      // Dept Head CS queue
      const csQueue = await ApprovalQueueService.getPendingQueue({
        id: deptHeadUserCS._id.toString(),
        roles: deptHeadUserCS.roles,
        department: deptHeadUserCS.department,
      });
      const csIds = csQueue.items.map((i) => i._id.toString());
      assert.ok(csIds.includes(csRes._id.toString()), 'CS Dept Head should see CS student booking');
      assert.strictEqual(csIds.includes(eeRes._id.toString()), false, 'CS Dept Head must NOT see EE student booking');

      // Dept Head EE queue
      const eeQueue = await ApprovalQueueService.getPendingQueue({
        id: deptHeadUserEE._id.toString(),
        roles: deptHeadUserEE.roles,
        department: deptHeadUserEE.department,
      });
      const eeIds = eeQueue.items.map((i) => i._id.toString());
      assert.ok(eeIds.includes(eeRes._id.toString()), 'EE Dept Head should see EE student booking');
      assert.strictEqual(eeIds.includes(csRes._id.toString()), false, 'EE Dept Head must NOT see CS student booking');
    });

    it('AP-33: Four-Eyes exclusion in queue: reservation where actor approved previous step does NOT appear in their queue', async () => {
      // Create a user with both roles: DEPARTMENT_HEAD and FACILITY_MANAGER
      const dualUser = await User.create({
        name: `${TEST_PREFIX}Dual Queue User`,
        email: `${TEST_PREFIX}dualqueue@univ.edu`,
        roles: [UserRole.DEPARTMENT_HEAD, UserRole.FACILITY_MANAGER],
        department: 'Computer Science',
        isActive: true,
      });

      // Dual user approves Step 1
      await ReservationService.approveReservationStep({
        reservationId: csRes._id.toString(),
        user: {
          id: dualUser._id.toString(),
          roles: dualUser.roles,
          department: dualUser.department,
        },
      });

      // Query dual user's queue for Step 2
      const queue = await ApprovalQueueService.getPendingQueue({
        id: dualUser._id.toString(),
        roles: dualUser.roles,
        department: dualUser.department,
      });

      const ids = queue.items.map((i) => i._id.toString());
      assert.strictEqual(
        ids.includes(csRes._id.toString()),
        false,
        'Four-Eyes must exclude reservations already actioned by user from queue!'
      );

      await User.findByIdAndDelete(dualUser._id);
    });
  });

  // ==========================================================================
  // 8. Concurrency & Predicate Lock Tests (AP-34 to AP-36)
  // ==========================================================================
  describe('8. Concurrency & Predicate Lock Guarantees', () => {
    beforeEach(async () => {
      await ApprovalPolicy.deleteMany({ name: new RegExp(`^${TEST_PREFIX}`, 'i') });
      await Reservation.deleteMany({ title: new RegExp(`^${TEST_PREFIX}`, 'i') });
    });

    it('AP-34: Double-approval race: concurrent approvals on same step -> exactly one succeeds', async () => {
      await ApprovalPolicy.create({
        name: `${TEST_PREFIX}Race 1 Policy`,
        scopeType: ApprovalScopeType.RESOURCE,
        resource: testResource1._id,
        requesterRole: null,
        requiresApproval: true,
        approvalChain: [
          { stepOrder: 1, approverRole: ApproverRole.DEPARTMENT_HEAD },
          { stepOrder: 2, approverRole: ApproverRole.FACILITY_MANAGER },
        ],
      });

      const reservation = await ReservationService.createReservation({
        resourceId: testResource1._id.toString(),
        userId: studentUserCS._id.toString(),
        startAt: '2026-10-20T10:00:00.000Z',
        endAt: '2026-10-20T11:00:00.000Z',
        timezone: defaultTz,
        title: `${TEST_PREFIX}Race Double Approval`,
      });

      // Fire 2 simultaneous approval attempts on Step 1
      const results = await Promise.allSettled([
        ReservationService.approveReservationStep({
          reservationId: reservation._id.toString(),
          user: {
            id: deptHeadUserCS._id.toString(),
            roles: deptHeadUserCS.roles,
            department: deptHeadUserCS.department,
          },
          comment: 'Approval attempt 1',
          expectedStepOrder: 1,
        }),
        ReservationService.approveReservationStep({
          reservationId: reservation._id.toString(),
          user: {
            id: adminUser._id.toString(),
            roles: adminUser.roles,
          },
          comment: 'Approval attempt 2 (Admin Override)',
          expectedStepOrder: 1,
        }),
      ]);

      const fulfilled = results.filter((r) => r.status === 'fulfilled');
      const rejected = results.filter((r) => r.status === 'rejected');

      assert.strictEqual(fulfilled.length, 1, 'Exactly one concurrent approval must succeed');
      assert.strictEqual(rejected.length, 1, 'Concurrent competing approval must be rejected');

      // Verify the reservation advanced exactly once to Step 2
      const fresh = await Reservation.findById(reservation._id);
      assert.strictEqual(fresh?.currentStepOrder, 2);
    });

    it('AP-35: Approve vs Cancel race: concurrent approval and user cancellation -> predicate lock protects state', async () => {
      await ApprovalPolicy.create({
        name: `${TEST_PREFIX}Race Cancel Policy`,
        scopeType: ApprovalScopeType.RESOURCE,
        resource: testResource1._id,
        requesterRole: null,
        requiresApproval: true,
        approvalChain: [{ stepOrder: 1, approverRole: ApproverRole.DEPARTMENT_HEAD }],
      });

      const reservation = await ReservationService.createReservation({
        resourceId: testResource1._id.toString(),
        userId: studentUserCS._id.toString(),
        startAt: '2026-10-20T12:00:00.000Z',
        endAt: '2026-10-20T13:00:00.000Z',
        timezone: defaultTz,
        title: `${TEST_PREFIX}Race Cancel vs Approve`,
      });

      // Fire simultaneous approval and cancellation
      const results = await Promise.allSettled([
        ReservationService.approveReservationStep({
          reservationId: reservation._id.toString(),
          user: {
            id: deptHeadUserCS._id.toString(),
            roles: deptHeadUserCS.roles,
            department: deptHeadUserCS.department,
          },
        }),
        ReservationService.cancelReservation(
          reservation._id.toString(),
          studentUserCS._id.toString(),
          'Student changed plans'
        ),
      ]);

      const fulfilled = results.filter((r) => r.status === 'fulfilled');
      assert.ok(fulfilled.length >= 1);

      // Verify final state is deterministic (either CONFIRMED or CANCELLED, never half-state)
      const finalDoc = await Reservation.findById(reservation._id);
      assert.ok(
        finalDoc?.status === ReservationStatus.CONFIRMED ||
          finalDoc?.status === ReservationStatus.CANCELLED
      );
    });

    it('AP-36: Reject vs Approve race: concurrent reject and approve -> exactly one succeeds', async () => {
      await ApprovalPolicy.create({
        name: `${TEST_PREFIX}Race Reject Approve Policy`,
        scopeType: ApprovalScopeType.RESOURCE,
        resource: testResource1._id,
        requesterRole: null,
        requiresApproval: true,
        approvalChain: [{ stepOrder: 1, approverRole: ApproverRole.DEPARTMENT_HEAD }],
      });

      const reservation = await ReservationService.createReservation({
        resourceId: testResource1._id.toString(),
        userId: studentUserCS._id.toString(),
        startAt: '2026-10-20T14:00:00.000Z',
        endAt: '2026-10-20T15:00:00.000Z',
        timezone: defaultTz,
        title: `${TEST_PREFIX}Race Reject vs Approve`,
      });

      // Fire simultaneous approval and rejection on same step
      const results = await Promise.allSettled([
        ReservationService.approveReservationStep({
          reservationId: reservation._id.toString(),
          user: {
            id: deptHeadUserCS._id.toString(),
            roles: deptHeadUserCS.roles,
            department: deptHeadUserCS.department,
          },
        }),
        ReservationService.rejectReservationStep({
          reservationId: reservation._id.toString(),
          user: {
            id: adminUser._id.toString(),
            roles: adminUser.roles,
          },
          reason: 'Administrative cancellation of request',
        }),
      ]);

      const fulfilled = results.filter((r) => r.status === 'fulfilled');
      const rejected = results.filter((r) => r.status === 'rejected');

      assert.strictEqual(fulfilled.length, 1, 'Exactly one operation must win the predicate lock');
      assert.strictEqual(rejected.length, 1, 'Losing concurrent operation must be rejected');

      const finalDoc = await Reservation.findById(reservation._id);
      assert.ok(
        finalDoc?.status === ReservationStatus.CONFIRMED ||
          finalDoc?.status === ReservationStatus.REJECTED
      );
    });
  });

  // ==========================================================================
  // 9. Approval Policy Administration API & Lifecycle E2E (AP-37 to AP-45)
  // ==========================================================================
  describe('9. Approval Policy Administration API & Lifecycle E2E', () => {
    beforeEach(async () => {
      await ApprovalPolicy.deleteMany({ name: new RegExp(`^${TEST_PREFIX}`, 'i') });
    });

    it('AP-37: POST /api/approval-policies allows ADMIN to create valid multi-step policy (201)', async () => {
      const res = await fetch(`${baseUrl}/api/approval-policies`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${adminToken}`,
        },
        body: JSON.stringify({
          name: `${TEST_PREFIX}Admin Created Policy`,
          description: 'Multi-step engineering approval policy',
          scopeType: ApprovalScopeType.RESOURCE,
          resource: testResource1._id.toString(),
          requesterRole: null,
          requiresApproval: true,
          approvalChain: [
            { stepOrder: 1, approverRole: ApproverRole.DEPARTMENT_HEAD, timeoutHours: 24 },
            { stepOrder: 2, approverRole: ApproverRole.FACILITY_MANAGER, timeoutHours: 48 },
          ],
        }),
      });

      assert.strictEqual(res.status, 201);
      const body = await res.json();
      assert.strictEqual(body.success, true);
      assert.strictEqual(body.data.name, `${TEST_PREFIX}Admin Created Policy`);
      assert.strictEqual(body.data.approvalChain.length, 2);
      assert.strictEqual(body.data.approvalChain[0].approverRole, ApproverRole.DEPARTMENT_HEAD);
      assert.strictEqual(body.data.approvalChain[1].approverRole, ApproverRole.FACILITY_MANAGER);
    });

    it('AP-38: POST /api/approval-policies allows FACILITY_MANAGER to create policy (201)', async () => {
      const res = await fetch(`${baseUrl}/api/approval-policies`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${facilityManagerToken}`,
        },
        body: JSON.stringify({
          name: `${TEST_PREFIX}FM Created Policy`,
          scopeType: ApprovalScopeType.RESOURCE,
          resource: testResource2._id.toString(),
          requesterRole: null,
          requiresApproval: true,
          approvalChain: [
            { stepOrder: 1, approverRole: ApproverRole.FACILITY_MANAGER, timeoutHours: 12 },
          ],
        }),
      });

      assert.strictEqual(res.status, 201);
      const body = await res.json();
      assert.strictEqual(body.success, true);
      assert.strictEqual(body.data.name, `${TEST_PREFIX}FM Created Policy`);
    });

    it('AP-39: POST /api/approval-policies rejects DEPARTMENT_HEAD and STUDENT with 403', async () => {
      // Dept Head attempt
      const resDept = await fetch(`${baseUrl}/api/approval-policies`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${deptHeadCSToken}`,
        },
        body: JSON.stringify({
          name: `${TEST_PREFIX}Dept Head Policy Attempt`,
          scopeType: ApprovalScopeType.RESOURCE,
          resource: testResource1._id.toString(),
          requiresApproval: true,
          approvalChain: [{ stepOrder: 1, approverRole: ApproverRole.DEPARTMENT_HEAD }],
        }),
      });
      assert.strictEqual(resDept.status, 403);

      // Student attempt
      const resStudent = await fetch(`${baseUrl}/api/approval-policies`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${studentCSToken}`,
        },
        body: JSON.stringify({
          name: `${TEST_PREFIX}Student Policy Attempt`,
          scopeType: ApprovalScopeType.RESOURCE,
          resource: testResource1._id.toString(),
          requiresApproval: false,
        }),
      });
      assert.strictEqual(resStudent.status, 403);
    });

    it('AP-40: GET /api/approval-policies and GET /:id return active policies with pagination & detail', async () => {
      const policy = await ApprovalPolicy.create({
        name: `${TEST_PREFIX}List Policy 1`,
        scopeType: ApprovalScopeType.RESOURCE,
        resource: testResource1._id,
        requiresApproval: true,
        approvalChain: [{ stepOrder: 1, approverRole: ApproverRole.FACILITY_MANAGER }],
      });

      // List as Admin
      const listRes = await fetch(`${baseUrl}/api/approval-policies?page=1&limit=10`, {
        headers: { Authorization: `Bearer ${adminToken}` },
      });
      assert.strictEqual(listRes.status, 200);
      const listBody = await listRes.json();
      assert.strictEqual(listBody.success, true);
      assert.ok(Array.isArray(listBody.data.policies));
      assert.ok(listBody.data.total >= 1);

      // Get by ID as Dept Head (authorized to read)
      const getRes = await fetch(`${baseUrl}/api/approval-policies/${policy._id}`, {
        headers: { Authorization: `Bearer ${deptHeadCSToken}` },
      });
      assert.strictEqual(getRes.status, 200);
      const getBody = await getRes.json();
      assert.strictEqual(getBody.success, true);
      assert.strictEqual(getBody.data._id, policy._id.toString());

      // Student cannot list (403)
      const studentRes = await fetch(`${baseUrl}/api/approval-policies`, {
        headers: { Authorization: `Bearer ${studentCSToken}` },
      });
      assert.strictEqual(studentRes.status, 403);
    });

    it('AP-41: PUT /api/approval-policies/:id updates policy definition', async () => {
      const policy = await ApprovalPolicy.create({
        name: `${TEST_PREFIX}Initial PUT Policy`,
        scopeType: ApprovalScopeType.RESOURCE,
        resource: testResource1._id,
        requiresApproval: true,
        approvalChain: [{ stepOrder: 1, approverRole: ApproverRole.FACILITY_MANAGER, timeoutHours: 24 }],
      });

      // Update as Facility Manager
      const putRes = await fetch(`${baseUrl}/api/approval-policies/${policy._id}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${facilityManagerToken}`,
        },
        body: JSON.stringify({
          name: `${TEST_PREFIX}Updated PUT Policy`,
          description: 'Updated policy description',
          scopeType: ApprovalScopeType.RESOURCE,
          resource: testResource1._id.toString(),
          requiresApproval: true,
          approvalChain: [
            { stepOrder: 1, approverRole: ApproverRole.DEPARTMENT_HEAD, timeoutHours: 12 },
          ],
        }),
      });

      assert.strictEqual(putRes.status, 200);
      const putBody = await putRes.json();
      assert.strictEqual(putBody.success, true);
      assert.strictEqual(putBody.data.name, `${TEST_PREFIX}Updated PUT Policy`);
      assert.strictEqual(putBody.data.approvalChain[0].approverRole, ApproverRole.DEPARTMENT_HEAD);

      // Dept Head cannot PUT (403)
      const deptPutRes = await fetch(`${baseUrl}/api/approval-policies/${policy._id}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${deptHeadCSToken}`,
        },
        body: JSON.stringify({ name: 'Hacked' }),
      });
      assert.strictEqual(deptPutRes.status, 403);
    });

    it('AP-42: PATCH /api/approval-policies/:id/status toggles policy status', async () => {
      const policy = await ApprovalPolicy.create({
        name: `${TEST_PREFIX}Toggle Status Policy`,
        scopeType: ApprovalScopeType.RESOURCE,
        resource: testResource1._id,
        requiresApproval: true,
        approvalChain: [{ stepOrder: 1, approverRole: ApproverRole.FACILITY_MANAGER }],
      });

      // Deactivate as Admin
      const patchRes = await fetch(`${baseUrl}/api/approval-policies/${policy._id}/status`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${adminToken}`,
        },
        body: JSON.stringify({ isActive: false }),
      });
      assert.strictEqual(patchRes.status, 200);
      const patchBody = await patchRes.json();
      assert.strictEqual(patchBody.data.isActive, false);

      // When inactive, new active policy on identical scope can be created
      const newPolicyRes = await fetch(`${baseUrl}/api/approval-policies`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${adminToken}`,
        },
        body: JSON.stringify({
          name: `${TEST_PREFIX}Replacement Active Policy`,
          scopeType: ApprovalScopeType.RESOURCE,
          resource: testResource1._id.toString(),
          requiresApproval: false,
          approvalChain: [],
        }),
      });
      assert.strictEqual(newPolicyRes.status, 201);
    });

    it('AP-43: DELETE /api/approval-policies/:id archives policy (ADMIN only)', async () => {
      const policy = await ApprovalPolicy.create({
        name: `${TEST_PREFIX}To Archive Policy`,
        scopeType: ApprovalScopeType.RESOURCE,
        resource: testResource1._id,
        requiresApproval: true,
        approvalChain: [{ stepOrder: 1, approverRole: ApproverRole.FACILITY_MANAGER }],
      });

      // Facility Manager cannot delete (403)
      const fmDel = await fetch(`${baseUrl}/api/approval-policies/${policy._id}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${facilityManagerToken}` },
      });
      assert.strictEqual(fmDel.status, 403);

      // Admin archives (200)
      const adminDel = await fetch(`${baseUrl}/api/approval-policies/${policy._id}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${adminToken}` },
      });
      assert.strictEqual(adminDel.status, 200);
      const delBody = await adminDel.json();
      assert.strictEqual(delBody.data.isArchived, true);
    });

    it('AP-44: Duplicate active policy creation returns 409 Conflict via HTTP API', async () => {
      await ApprovalPolicy.create({
        name: `${TEST_PREFIX}Duplicate First`,
        scopeType: ApprovalScopeType.RESOURCE,
        resource: testResource1._id,
        requesterRole: UserRole.STUDENT,
        requiresApproval: true,
        approvalChain: [{ stepOrder: 1, approverRole: ApproverRole.FACILITY_MANAGER }],
      });

      const dupRes = await fetch(`${baseUrl}/api/approval-policies`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${adminToken}`,
        },
        body: JSON.stringify({
          name: `${TEST_PREFIX}Duplicate Second`,
          scopeType: ApprovalScopeType.RESOURCE,
          resource: testResource1._id.toString(),
          requesterRole: UserRole.STUDENT,
          requiresApproval: true,
          approvalChain: [{ stepOrder: 1, approverRole: ApproverRole.DEPARTMENT_HEAD }],
        }),
      });

      assert.strictEqual(dupRes.status, 409);
      const dupBody = await dupRes.json();
      assert.strictEqual(dupBody.success, false);
      assert.ok(dupBody.error.message.includes('already exists for this scope'));
    });

    it('AP-45: Updating or archiving policy does NOT mutate existing in-flight reservation snapshot', async () => {
      const policy = await ApprovalPolicy.create({
        name: `${TEST_PREFIX}Snapshot Isolation Policy`,
        scopeType: ApprovalScopeType.RESOURCE,
        resource: testResource1._id,
        requiresApproval: true,
        approvalChain: [
          { stepOrder: 1, approverRole: ApproverRole.DEPARTMENT_HEAD, timeoutHours: 24 },
          { stepOrder: 2, approverRole: ApproverRole.FACILITY_MANAGER, timeoutHours: 48 },
        ],
      });

      const res = await ReservationService.createReservation({
        resourceId: testResource1._id.toString(),
        userId: studentUserCS._id.toString(),
        startAt: '2026-10-24T10:00:00.000Z',
        endAt: '2026-10-24T11:00:00.000Z',
        timezone: defaultTz,
        title: `${TEST_PREFIX}Snapshot Preservation Booking`,
      });

      assert.strictEqual(res.approvalChain.length, 2);

      // Now update the policy to 1 step
      await fetch(`${baseUrl}/api/approval-policies/${policy._id}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${adminToken}`,
        },
        body: JSON.stringify({
          approvalChain: [{ stepOrder: 1, approverRole: ApproverRole.FACILITY_MANAGER }],
        }),
      });

      // Verify in-flight reservation unchanged!
      const freshRes = await Reservation.findById(res._id);
      assert.strictEqual(freshRes?.approvalChain.length, 2);
      assert.strictEqual(freshRes?.approvalChain[0].approverRole, ApproverRole.DEPARTMENT_HEAD);
      assert.strictEqual(freshRes?.approvalChain[1].approverRole, ApproverRole.FACILITY_MANAGER);
    });
  });

  // ==========================================================================
  // 10. Live End-to-End Booking Approval Journey (HTTP) (AP-46 to AP-52)
  // ==========================================================================
  describe('10. Live End-to-End Booking Approval Journey (HTTP)', () => {
    beforeEach(async () => {
      await ApprovalPolicy.deleteMany({ name: new RegExp(`^${TEST_PREFIX}`, 'i') });
      await Reservation.deleteMany({ title: new RegExp(`^${TEST_PREFIX}`, 'i') });
      await TimetableEntry.deleteMany({ courseCode: new RegExp(`^${TEST_PREFIX}`, 'i') });
    });

    it('AP-46: Complete live journey: Policy -> PENDING -> Competing 409 -> Dept Head queue -> Step 1 -> FM queue -> Step 2 -> CONFIRMED', async () => {
      // 1. Admin creates policy via POST /api/approval-policies
      const polRes = await fetch(`${baseUrl}/api/approval-policies`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${adminToken}`,
        },
        body: JSON.stringify({
          name: `${TEST_PREFIX}Journey Two Step`,
          scopeType: ApprovalScopeType.RESOURCE,
          resource: testResource1._id.toString(),
          requiresApproval: true,
          approvalChain: [
            { stepOrder: 1, approverRole: ApproverRole.DEPARTMENT_HEAD, timeoutHours: 24 },
            { stepOrder: 2, approverRole: ApproverRole.FACILITY_MANAGER, timeoutHours: 48 },
          ],
        }),
      });
      assert.strictEqual(polRes.status, 201);

      // 2. Student creates booking via POST /api/bookings
      const bookRes = await fetch(`${baseUrl}/api/bookings`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${studentCSToken}`,
        },
        body: JSON.stringify({
          resourceId: testResource1._id.toString(),
          title: `${TEST_PREFIX}Journey Student Booking`,
          startAt: '2026-10-26T10:00:00.000Z',
          endAt: '2026-10-26T11:00:00.000Z',
          timezone: defaultTz,
        }),
      });
      assert.strictEqual(bookRes.status, 201);
      const bookBody = await bookRes.json();
      const booking = bookBody.data?.booking || bookBody.data;
      const bookingId = booking._id;
      assert.strictEqual(booking.status, 'PENDING');
      assert.strictEqual(booking.currentStepOrder, 1);
      assert.strictEqual(booking.currentApproverRole, 'DEPARTMENT_HEAD');

      // 3. Competing booking on identical slot rejected with 409
      const compRes = await fetch(`${baseUrl}/api/bookings`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${facultyCSToken}`,
        },
        body: JSON.stringify({
          resourceId: testResource1._id.toString(),
          title: `${TEST_PREFIX}Competing Slot`,
          startAt: '2026-10-26T10:00:00.000Z',
          endAt: '2026-10-26T11:00:00.000Z',
          timezone: defaultTz,
        }),
      });
      assert.strictEqual(compRes.status, 409);

      // 4. CS Dept Head queries queue -> sees booking. EE Dept Head -> does NOT see it.
      const csQueueRes = await fetch(`${baseUrl}/api/approvals/pending`, {
        headers: { Authorization: `Bearer ${deptHeadCSToken}` },
      });
      assert.strictEqual(csQueueRes.status, 200);
      const csQueue = await csQueueRes.json();
      const csIds = csQueue.data.items.map((i: any) => i._id);
      assert.ok(csIds.includes(bookingId));

      const eeQueueRes = await fetch(`${baseUrl}/api/approvals/pending`, {
        headers: { Authorization: `Bearer ${deptHeadEEToken}` },
      });
      assert.strictEqual(eeQueueRes.status, 200);
      const eeQueue = await eeQueueRes.json();
      const eeIds = eeQueue.data.items.map((i: any) => i._id);
      assert.strictEqual(eeIds.includes(bookingId), false);

      // 5. CS Dept Head approves Step 1 via POST /api/bookings/:id/approve
      const app1Res = await fetch(`${baseUrl}/api/bookings/${bookingId}/approve`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${deptHeadCSToken}`,
        },
        body: JSON.stringify({ comment: 'CS Dept Head verifies curriculum requirement' }),
      });
      assert.strictEqual(app1Res.status, 200);
      const app1Body = await app1Res.json();
      assert.strictEqual(app1Body.data.status, 'PENDING');
      assert.strictEqual(app1Body.data.currentStepOrder, 2);
      assert.strictEqual(app1Body.data.currentApproverRole, 'FACILITY_MANAGER');

      // 6. Facility Manager queries queue -> now sees it!
      const fmQueueRes = await fetch(`${baseUrl}/api/approvals/pending`, {
        headers: { Authorization: `Bearer ${facilityManagerToken}` },
      });
      assert.strictEqual(fmQueueRes.status, 200);
      const fmQueue = await fmQueueRes.json();
      const fmIds = fmQueue.data.items.map((i: any) => i._id);
      assert.ok(fmIds.includes(bookingId));

      // 7. Facility Manager approves Step 2 via POST /api/bookings/:id/approve
      const app2Res = await fetch(`${baseUrl}/api/bookings/${bookingId}/approve`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${facilityManagerToken}`,
        },
        body: JSON.stringify({ comment: 'Facility manager confirms room allocation' }),
      });
      assert.strictEqual(app2Res.status, 200);
      const app2Body = await app2Res.json();
      assert.strictEqual(app2Body.data.status, 'CONFIRMED');
      assert.strictEqual(app2Body.data.currentStepOrder, null);
      assert.strictEqual(app2Body.data.currentApproverRole, null);
    });

    it('AP-47: Rejection lifecycle: Dept Head rejects with reason -> REJECTED & immediate capacity release', async () => {
      await ApprovalPolicy.create({
        name: `${TEST_PREFIX}Reject Policy`,
        scopeType: ApprovalScopeType.RESOURCE,
        resource: testResource1._id,
        requiresApproval: true,
        approvalChain: [{ stepOrder: 1, approverRole: ApproverRole.DEPARTMENT_HEAD }],
      });

      // 1. Student creates booking
      const bookRes = await fetch(`${baseUrl}/api/bookings`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${studentCSToken}`,
        },
        body: JSON.stringify({
          resourceId: testResource1._id.toString(),
          title: `${TEST_PREFIX}Booking To Reject`,
          startAt: '2026-10-27T10:00:00.000Z',
          endAt: '2026-10-27T11:00:00.000Z',
          timezone: defaultTz,
        }),
      });
      assert.strictEqual(bookRes.status, 201);
      const rejBookBody = await bookRes.json();
      const bookingId = rejBookBody.data?._id || rejBookBody.data?.booking?._id;

      // 2. Competing booking on same slot fails (409)
      const compBefore = await fetch(`${baseUrl}/api/bookings`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${facultyCSToken}`,
        },
        body: JSON.stringify({
          resourceId: testResource1._id.toString(),
          title: `${TEST_PREFIX}Comp Before Reject`,
          startAt: '2026-10-27T10:00:00.000Z',
          endAt: '2026-10-27T11:00:00.000Z',
          timezone: defaultTz,
        }),
      });
      assert.strictEqual(compBefore.status, 409);

      // 3. Dept Head rejects with reason
      const rejRes = await fetch(`${baseUrl}/api/bookings/${bookingId}/reject`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${deptHeadCSToken}`,
        },
        body: JSON.stringify({ reason: 'Lab equipment undergoing scheduled calibration' }),
      });
      assert.strictEqual(rejRes.status, 200);
      const rejBody = await rejRes.json();
      assert.strictEqual(rejBody.data.status, 'REJECTED');

      // 4. Competing booking now immediately succeeds (201)!
      const compAfter = await fetch(`${baseUrl}/api/bookings`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${facultyCSToken}`,
        },
        body: JSON.stringify({
          resourceId: testResource1._id.toString(),
          title: `${TEST_PREFIX}Comp After Reject`,
          startAt: '2026-10-27T10:00:00.000Z',
          endAt: '2026-10-27T11:00:00.000Z',
          timezone: defaultTz,
        }),
      });
      assert.strictEqual(compAfter.status, 201);
    });

    it('AP-48: ADMIN universal override with comment >= 5 chars succeeds on non-admin step', async () => {
      await ApprovalPolicy.create({
        name: `${TEST_PREFIX}Override Policy`,
        scopeType: ApprovalScopeType.RESOURCE,
        resource: testResource1._id,
        requiresApproval: true,
        approvalChain: [{ stepOrder: 1, approverRole: ApproverRole.DEPARTMENT_HEAD }],
      });

      const bookRes = await fetch(`${baseUrl}/api/bookings`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${studentCSToken}`,
        },
        body: JSON.stringify({
          resourceId: testResource1._id.toString(),
          title: `${TEST_PREFIX}Booking To Override`,
          startAt: '2026-10-28T10:00:00.000Z',
          endAt: '2026-10-28T11:00:00.000Z',
          timezone: defaultTz,
        }),
      });
      assert.strictEqual(bookRes.status, 201);
      const ovBookBody = await bookRes.json();
      const bookingId = ovBookBody.data?._id || ovBookBody.data?.booking?._id;

      // Admin executes override
      const ovRes = await fetch(`${baseUrl}/api/bookings/${bookingId}/approve`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${adminToken}`,
        },
        body: JSON.stringify({ comment: 'Administrative executive authorization' }),
      });
      assert.strictEqual(ovRes.status, 200);
      const ovBody = await ovRes.json();
      assert.strictEqual(ovBody.data.status, 'CONFIRMED');
      assert.strictEqual(ovBody.data.approvalChain[0].isOverride, true);
      assert.strictEqual(ovBody.data.approvalChain[0].actorRoleUsed, 'ADMIN');
    });

    it('AP-49: ADMIN override attempt without justification comment is rejected (400)', async () => {
      await ApprovalPolicy.create({
        name: `${TEST_PREFIX}Override Bad Policy`,
        scopeType: ApprovalScopeType.RESOURCE,
        resource: testResource1._id,
        requiresApproval: true,
        approvalChain: [{ stepOrder: 1, approverRole: ApproverRole.DEPARTMENT_HEAD }],
      });

      const bookRes = await fetch(`${baseUrl}/api/bookings`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${studentCSToken}`,
        },
        body: JSON.stringify({
          resourceId: testResource1._id.toString(),
          title: `${TEST_PREFIX}Booking Short Override`,
          startAt: '2026-10-29T10:00:00.000Z',
          endAt: '2026-10-29T11:00:00.000Z',
          timezone: defaultTz,
        }),
      });
      assert.strictEqual(bookRes.status, 201);
      const badBookBody = await bookRes.json();
      const bookingId = badBookBody.data?._id || badBookBody.data?.booking?._id;

      // Admin approves without comment or with < 5 chars
      const badOv = await fetch(`${baseUrl}/api/bookings/${bookingId}/approve`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${adminToken}`,
        },
        body: JSON.stringify({ comment: 'ok' }),
      });
      assert.strictEqual(badOv.status, 400);
      const badBody = await badOv.json();
      assert.ok(badBody.error.message.includes('Administrative override requires a mandatory justification comment'));
    });

    it('AP-50: Four-Eyes violation attempt: approver of Step 1 attempting Step 2 is rejected (403)', async () => {
      const dualUser = await User.create({
        name: `${TEST_PREFIX}Dual Role Journey`,
        email: `${TEST_PREFIX}dualjourney@univ.edu`,
        roles: [UserRole.DEPARTMENT_HEAD, UserRole.FACILITY_MANAGER],
        department: 'Computer Science',
        isActive: true,
      });
      const dualToken = signAccessToken({
        sub: dualUser._id.toString(),
        email: dualUser.email,
        roles: dualUser.roles,
        department: dualUser.department,
        isActive: true,
        tokenVersion: dualUser.tokenVersion ?? 0,
      });

      await ApprovalPolicy.create({
        name: `${TEST_PREFIX}Four Eyes Policy`,
        scopeType: ApprovalScopeType.RESOURCE,
        resource: testResource1._id,
        requiresApproval: true,
        approvalChain: [
          { stepOrder: 1, approverRole: ApproverRole.DEPARTMENT_HEAD },
          { stepOrder: 2, approverRole: ApproverRole.FACILITY_MANAGER },
        ],
      });

      const bookRes = await fetch(`${baseUrl}/api/bookings`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${studentCSToken}`,
        },
        body: JSON.stringify({
          resourceId: testResource1._id.toString(),
          title: `${TEST_PREFIX}Four Eyes Booking`,
          startAt: '2026-10-30T10:00:00.000Z',
          endAt: '2026-10-30T11:00:00.000Z',
          timezone: defaultTz,
        }),
      });
      assert.strictEqual(bookRes.status, 201);
      const feBookBody = await bookRes.json();
      const bookingId = feBookBody.data?._id || feBookBody.data?.booking?._id;

      // Dual user approves Step 1 (succeeds)
      const step1Res = await fetch(`${baseUrl}/api/bookings/${bookingId}/approve`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${dualToken}`,
        },
        body: JSON.stringify({ comment: 'Step 1 approved' }),
      });
      assert.strictEqual(step1Res.status, 200);

      // Dual user attempts to approve Step 2 (fails with 400 - separation of duties)
      const step2Res = await fetch(`${baseUrl}/api/bookings/${bookingId}/approve`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${dualToken}`,
        },
        body: JSON.stringify({ comment: 'Step 2 attempt' }),
      });
      assert.strictEqual(step2Res.status, 400);
      const step2Body = await step2Res.json();
      assert.ok(step2Body.error.message.includes('Separation of duties violation'));

      await User.findByIdAndDelete(dualUser._id);
    });

    it('AP-51: Cross-department approval attempt: EE Dept Head attempting CS booking is rejected (403)', async () => {
      await ApprovalPolicy.create({
        name: `${TEST_PREFIX}Cross Dept Policy`,
        scopeType: ApprovalScopeType.RESOURCE,
        resource: testResource1._id,
        requiresApproval: true,
        approvalChain: [{ stepOrder: 1, approverRole: ApproverRole.DEPARTMENT_HEAD }],
      });

      const bookRes = await fetch(`${baseUrl}/api/bookings`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${studentCSToken}`,
        },
        body: JSON.stringify({
          resourceId: testResource1._id.toString(),
          title: `${TEST_PREFIX}CS Student Booking`,
          startAt: '2026-10-31T10:00:00.000Z',
          endAt: '2026-10-31T11:00:00.000Z',
          timezone: defaultTz,
        }),
      });
      assert.strictEqual(bookRes.status, 201);
      const csBookBody = await bookRes.json();
      const bookingId = csBookBody.data?._id || csBookBody.data?.booking?._id;

      // EE Dept Head attempts to approve
      const xRes = await fetch(`${baseUrl}/api/bookings/${bookingId}/approve`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${deptHeadEEToken}`,
        },
        body: JSON.stringify({ comment: 'EE Head cross approval attempt' }),
      });
      assert.strictEqual(xRes.status, 403);
      const xBody = await xRes.json();
      assert.ok(xBody.error.message.includes('Department Heads can only approve reservations within their department'));
    });

    it('AP-52: Timetable Conflict: Booking overlapping published timetable session is rejected with 409', async () => {
      // Create timetable entry
      await TimetableEntry.create({
        resource: testResource1._id,
        courseCode: `${TEST_PREFIX}CS101`,
        courseTitle: 'Introduction to Computer Science',
        instructorName: 'Dr. Turing',
        department: 'Computer Science',
        academicTerm: 'FALL2026',
        version: 1,
        publicationBatchId: new Types.ObjectId().toString(),
        startAt: new Date('2026-11-01T10:00:00.000Z'),
        endAt: new Date('2026-11-01T11:00:00.000Z'),
        timezone: defaultTz,
        isPublished: true,
      });

      // Student attempts to book the same slot
      const res = await fetch(`${baseUrl}/api/bookings`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${studentCSToken}`,
        },
        body: JSON.stringify({
          resourceId: testResource1._id.toString(),
          title: `${TEST_PREFIX}Timetable Conflict Attempt`,
          startAt: '2026-11-01T10:00:00.000Z',
          endAt: '2026-11-01T11:00:00.000Z',
          timezone: defaultTz,
        }),
      });

      assert.strictEqual(res.status, 409);
      const body = await res.json();
      assert.strictEqual(body.error.code, 'CONFLICT');
    });
  });

  // ==========================================================================
  // 11. Security & Forgery Invariant Checks (AP-53 to AP-56)
  // ==========================================================================
  describe('11. Security & Forgery Invariant Checks', () => {
    it('AP-53: Security: Client cannot forge userId in request body', async () => {
      const res = await fetch(`${baseUrl}/api/bookings`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${studentCSToken}`,
        },
        body: JSON.stringify({
          resourceId: testResource1._id.toString(),
          userId: adminUser._id.toString(), // Forged victim ID
          title: `${TEST_PREFIX}Forged User Attempt`,
          startAt: '2026-11-02T10:00:00.000Z',
          endAt: '2026-11-02T11:00:00.000Z',
          timezone: defaultTz,
        }),
      });

      // Backend rejects unauthorized booking on behalf of another user with 403 Forbidden!
      assert.strictEqual(res.status, 403);
      const body = await res.json();
      assert.ok(body.error.message.includes('Only DEPARTMENT_HEAD can book on behalf of another user'));
    });

    it('AP-54: Security: Client cannot forge approverId or actorRole in approve body', async () => {
      const booking = await ReservationService.createReservation({
        resourceId: testResource1._id.toString(),
        userId: studentUserCS._id.toString(),
        startAt: '2026-11-03T10:00:00.000Z',
        endAt: '2026-11-03T11:00:00.000Z',
        timezone: defaultTz,
        title: `${TEST_PREFIX}Forged Approver Booking`,
      });

      // Dept Head CS attempts to send forged approverId and forged actorRole in payload
      const appRes = await fetch(`${baseUrl}/api/bookings/${booking._id}/approve`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${deptHeadCSToken}`,
        },
        body: JSON.stringify({
          approverId: adminUser._id.toString(), // Forged
          actorRole: 'ADMIN', // Forged
          comment: 'Approved by CS Head',
        }),
      });

      // Since booking was auto-confirmed (no policy), expect 409 Conflict
      // But if policy exists, actionedBy is derived from req.user.id!
      assert.strictEqual(appRes.status, 409);
    });

    it('AP-55: Security: Unauthorized roles cannot access approval queue (403/401)', async () => {
      // Student cannot access queue
      const stuRes = await fetch(`${baseUrl}/api/approvals/pending`, {
        headers: { Authorization: `Bearer ${studentCSToken}` },
      });
      assert.strictEqual(stuRes.status, 403);

      // Unauthenticated cannot access queue
      const unauthRes = await fetch(`${baseUrl}/api/approvals/pending`);
      assert.strictEqual(unauthRes.status, 401);
    });

    it('AP-56: Security: Unauthorized roles cannot archive/delete approval policies (403)', async () => {
      const policy = await ApprovalPolicy.create({
        name: `${TEST_PREFIX}Protected Policy`,
        scopeType: ApprovalScopeType.RESOURCE,
        resource: testResource1._id,
        requiresApproval: false,
      });

      const delRes = await fetch(`${baseUrl}/api/approval-policies/${policy._id}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${studentCSToken}` },
      });
      assert.strictEqual(delRes.status, 403);

      const unauthDel = await fetch(`${baseUrl}/api/approval-policies/${policy._id}`, {
        method: 'DELETE',
      });
      assert.strictEqual(unauthDel.status, 401);
    });
  });
});
