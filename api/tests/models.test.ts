/**
 * CampusFlow API - Domain Models & Database Integration Tests
 * Validates User, ResourceType, Resource, ResourceAttribute, and Custodian schemas,
 * enums, validations, relationships, embedding vs referencing, and MongoDB unique constraints.
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
  AttributeDataType,
  Custodian,
} from '../src/models';

describe('CampusFlow Domain Models & Database Integration Tests', () => {
  const TEST_PREFIX = 'test_model_';
  const createdUserIds: string[] = [];
  const createdResourceTypeIds: string[] = [];
  const createdResourceIds: string[] = [];
  const createdCustodianIds: string[] = [];

  before(async () => {
    // 1. Strictly connect to the isolated test database
    await connectDatabase(env.MONGODB_TEST_URI);
    assert.strictEqual(isDatabaseConnected(), true, 'Database must be connected for domain model tests');

    const connectedDb = mongoose.connection.db?.databaseName;
    assert.strictEqual(
      connectedDb,
      'campusflow_test',
      `Model integration tests must run exclusively on isolated test database (connected to: "${connectedDb}")`
    );

    // 2. Synchronize indexes exclusively on the isolated test database
    await Promise.all([
      User.syncIndexes(),
      ResourceType.syncIndexes(),
      Resource.syncIndexes(),
      Custodian.syncIndexes(),
    ]);
  });

  after(async () => {
    // Clean up all test records created during test run strictly inside the test database
    if (isDatabaseConnected()) {
      const currentDb = mongoose.connection.db?.databaseName;
      assert.strictEqual(
        currentDb,
        'campusflow_test',
        'Cleanup must only occur on the isolated test database'
      );

      if (createdResourceIds.length > 0) {
        await Resource.deleteMany({ _id: { $in: createdResourceIds } });
      }
      if (createdCustodianIds.length > 0) {
        await Custodian.deleteMany({ _id: { $in: createdCustodianIds } });
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
  // MODEL 1: USER TESTS
  // ==========================================
  describe('User Model', () => {
    it('should create a valid user with default STUDENT role and active state', async () => {
      const email = `${TEST_PREFIX}student_${Date.now()}@campusflow.edu`;
      const user = await User.create({
        name: 'Alex Student',
        email,
        department: 'Computer Science',
        identifier: `STU_${Date.now()}`,
      });

      createdUserIds.push(user._id.toString());

      assert.ok(user._id);
      assert.strictEqual(user.name, 'Alex Student');
      assert.strictEqual(user.email, email.toLowerCase());
      assert.deepStrictEqual(user.roles, [UserRole.STUDENT]);
      assert.strictEqual(user.isActive, true);
      assert.strictEqual(user.department, 'Computer Science');
      assert.ok(user.identifier?.startsWith('STU_'));
      assert.ok(user.createdAt instanceof Date);
      assert.ok(user.updatedAt instanceof Date);
    });

    it('should support multiple campus roles', async () => {
      const email = `${TEST_PREFIX}faculty_head_${Date.now()}@campusflow.edu`;
      const user = await User.create({
        name: 'Dr. Jane Smith',
        email,
        roles: [UserRole.FACULTY, UserRole.DEPARTMENT_HEAD],
        department: 'Electrical Engineering',
      });

      createdUserIds.push(user._id.toString());

      assert.strictEqual(user.roles.length, 2);
      assert.ok(user.roles.includes(UserRole.FACULTY));
      assert.ok(user.roles.includes(UserRole.DEPARTMENT_HEAD));
    });

    it('should reject invalid user role values', async () => {
      const email = `${TEST_PREFIX}invalid_role_${Date.now()}@campusflow.edu`;
      await assert.rejects(
        async () => {
          // @ts-expect-error Testing invalid runtime enum input
          await User.create({
            name: 'Invalid Role User',
            email,
            roles: ['SUPER_USER_INVALID'],
          });
        },
        /Invalid user role/
      );
    });

    it('should reject missing required fields (name, email)', async () => {
      await assert.rejects(
        async () => {
          // @ts-expect-error Testing missing name
          await User.create({ email: 'noname@campusflow.edu' });
        },
        /User name is required/
      );

      await assert.rejects(
        async () => {
          // @ts-expect-error Testing missing email
          await User.create({ name: 'No Email User' });
        },
        /Email is required/
      );
    });

    it('should reject invalid email format', async () => {
      await assert.rejects(
        async () => {
          await User.create({
            name: 'Bad Email User',
            email: 'not-an-email-format',
          });
        },
        /Please provide a valid email address/
      );
    });

    it('should enforce unique email constraint in MongoDB', async () => {
      const email = `${TEST_PREFIX}duplicate_${Date.now()}@campusflow.edu`;
      const firstUser = await User.create({
        name: 'First User',
        email,
      });
      createdUserIds.push(firstUser._id.toString());

      await assert.rejects(
        async () => {
          await User.create({
            name: 'Duplicate User',
            email,
          });
        },
        (err: unknown) => {
          const mongoErr = err as { code?: number };
          return mongoErr.code === 11000;
        }
      );
    });

    it('should enforce unique sparse institutional identifier constraint in MongoDB', async () => {
      const sharedIdentifier = `ID_INST_${Date.now()}`;

      const user1 = await User.create({
        name: 'Identifier User 1',
        email: `${TEST_PREFIX}id1_${Date.now()}@campusflow.edu`,
        identifier: sharedIdentifier,
      });
      createdUserIds.push(user1._id.toString());

      // Attempting second user with identical identifier must fail with duplicate key 11000
      await assert.rejects(
        async () => {
          await User.create({
            name: 'Identifier User 2',
            email: `${TEST_PREFIX}id2_${Date.now()}@campusflow.edu`,
            identifier: sharedIdentifier,
          });
        },
        (err: unknown) => {
          const mongoErr = err as { code?: number };
          return mongoErr.code === 11000;
        }
      );

      // Multiple users without identifier (sparse) must succeed without conflict
      const userWithoutId1 = await User.create({
        name: 'Guest User 1',
        email: `${TEST_PREFIX}guest1_${Date.now()}@campusflow.edu`,
      });
      const userWithoutId2 = await User.create({
        name: 'Guest User 2',
        email: `${TEST_PREFIX}guest2_${Date.now()}@campusflow.edu`,
      });
      createdUserIds.push(userWithoutId1._id.toString(), userWithoutId2._id.toString());
      assert.strictEqual(userWithoutId1.identifier, undefined);
      assert.strictEqual(userWithoutId2.identifier, undefined);
    });
  });

  // ==========================================
  // MODEL 2: RESOURCE TYPE TESTS
  // ==========================================
  describe('ResourceType Model', () => {
    it('should create a valid ResourceType with category and active state', async () => {
      const code = `TEST_TYPE_LAB_${Date.now()}`;
      const resourceType = await ResourceType.create({
        name: 'Computer Laboratory Template',
        code,
        category: ResourceCategory.LABORATORY,
        description: 'Standard campus computing laboratory with desktop terminals',
      });

      createdResourceTypeIds.push(resourceType._id.toString());

      assert.ok(resourceType._id);
      assert.strictEqual(resourceType.name, 'Computer Laboratory Template');
      assert.strictEqual(resourceType.code, code.toUpperCase());
      assert.strictEqual(resourceType.category, ResourceCategory.LABORATORY);
      assert.strictEqual(resourceType.isActive, true);
      assert.ok(resourceType.createdAt instanceof Date);
    });

    it('should reject missing required fields (name, code)', async () => {
      await assert.rejects(
        async () => {
          // @ts-expect-error Missing code
          await ResourceType.create({ name: 'Incomplete Type' });
        },
        /Resource type code is required/
      );

      await assert.rejects(
        async () => {
          // @ts-expect-error Missing name
          await ResourceType.create({ code: 'INCOMPLETE_TYPE' });
        },
        /Resource type name is required/
      );
    });

    it('should reject invalid category values', async () => {
      await assert.rejects(
        async () => {
          // @ts-expect-error Invalid category
          await ResourceType.create({
            name: 'Invalid Category Type',
            code: `TEST_INV_CAT_${Date.now()}`,
            category: 'INVALID_CATEGORY',
          });
        },
        /Invalid resource category/
      );
    });

    it('should enforce unique code constraint in MongoDB', async () => {
      const code = `TEST_DUP_TYPE_${Date.now()}`;
      const firstType = await ResourceType.create({
        name: 'Original Type',
        code,
        category: ResourceCategory.FACILITY,
      });
      createdResourceTypeIds.push(firstType._id.toString());

      await assert.rejects(
        async () => {
          await ResourceType.create({
            name: 'Second Type Same Code',
            code,
            category: ResourceCategory.FACILITY,
          });
        },
        (err: unknown) => {
          const mongoErr = err as { code?: number };
          return mongoErr.code === 11000;
        }
      );
    });
  });

  // ==========================================
  // MODEL 3: RESOURCE ATTRIBUTE TESTS (AUTHORITATIVE EMBEDDED PERSISTENCE)
  // ==========================================
  describe('ResourceAttribute Schema & Authoritative Embedded Persistence', () => {
    it('should validate embedded attributes with STRING, NUMBER, and BOOLEAN types on Resource', async () => {
      const resource = new Resource({
        name: 'Spec Testing Resource',
        code: `TEST_ATTR_SPEC_${Date.now()}`,
        resourceType: new Types.ObjectId(),
        capacity: 30,
        location: { building: 'Science Block' },
        attributes: [
          {
            key: 'os_family',
            label: 'Operating System Family',
            dataType: AttributeDataType.STRING,
            value: 'Ubuntu Linux 24.04 LTS',
          },
          {
            key: 'terminal_count',
            label: 'Workstation Terminal Count',
            dataType: AttributeDataType.NUMBER,
            value: 45,
          },
          {
            key: 'has_projector',
            label: 'Ceiling Projector Installed',
            dataType: AttributeDataType.BOOLEAN,
            value: true,
          },
        ],
      });

      await resource.validate();
      assert.strictEqual(resource.attributes[0].value, 'Ubuntu Linux 24.04 LTS');
      assert.strictEqual(resource.attributes[1].value, 45);
      assert.strictEqual(resource.attributes[2].value, true);
    });

    it('should reject NUMBER dataType with non-number value', async () => {
      const resource = new Resource({
        name: 'Invalid Number Attr Resource',
        code: `TEST_INV_NUM_${Date.now()}`,
        resourceType: new Types.ObjectId(),
        capacity: 10,
        location: { building: 'Hall A' },
        attributes: [
          {
            key: 'invalid_number',
            dataType: AttributeDataType.NUMBER,
            value: 'not-a-number',
          },
        ],
      });

      await assert.rejects(
        async () => {
          await resource.validate();
        },
        /Attribute value does not match the specified dataType/
      );
    });

    it('should reject BOOLEAN dataType with non-boolean value', async () => {
      const resource = new Resource({
        name: 'Invalid Bool Attr Resource',
        code: `TEST_INV_BOOL_${Date.now()}`,
        resourceType: new Types.ObjectId(),
        capacity: 10,
        location: { building: 'Hall A' },
        attributes: [
          {
            key: 'invalid_boolean',
            dataType: AttributeDataType.BOOLEAN,
            value: 'yes',
          },
        ],
      });

      await assert.rejects(
        async () => {
          await resource.validate();
        },
        /Attribute value does not match the specified dataType/
      );
    });

    it('should reject invalid key format (uppercase, spaces, or special characters)', async () => {
      const resource = new Resource({
        name: 'Invalid Key Format Resource',
        code: `TEST_INV_KEY_${Date.now()}`,
        resourceType: new Types.ObjectId(),
        capacity: 10,
        location: { building: 'Hall A' },
        attributes: [
          {
            key: 'Invalid Key Format!',
            dataType: AttributeDataType.STRING,
            value: 'test',
          },
        ],
      });

      await assert.rejects(
        async () => {
          await resource.validate();
        },
        /Attribute key must contain only lowercase alphanumeric characters and underscores/
      );
    });
  });

  // ==========================================
  // MODEL 4: CUSTODIAN TESTS
  // ==========================================
  describe('Custodian Model', () => {
    it('should create a valid custodian referencing a User', async () => {
      const user = await User.create({
        name: 'Robert Custodian',
        email: `${TEST_PREFIX}custodian_${Date.now()}@campusflow.edu`,
        roles: [UserRole.CUSTODIAN],
        department: 'Facilities Management',
      });
      createdUserIds.push(user._id.toString());

      const custodian = await Custodian.create({
        user: user._id,
        department: 'Facilities Management',
        officeLocation: 'Campus Operations Center, Room 102',
        contactPhone: '+1-555-0199',
      });
      createdCustodianIds.push(custodian._id.toString());

      assert.ok(custodian._id);
      assert.strictEqual(custodian.user.toString(), user._id.toString());
      assert.strictEqual(custodian.department, 'Facilities Management');
      assert.strictEqual(custodian.officeLocation, 'Campus Operations Center, Room 102');
      assert.strictEqual(custodian.contactPhone, '+1-555-0199');
      assert.strictEqual(custodian.isActive, true);
    });

    it('should reject missing user reference or department', async () => {
      await assert.rejects(
        async () => {
          // @ts-expect-error Missing user
          await Custodian.create({ department: 'Central IT' });
        },
        /User reference is required for custodian/
      );

      const user = await User.create({
        name: 'Another User',
        email: `${TEST_PREFIX}custodian_no_dept_${Date.now()}@campusflow.edu`,
      });
      createdUserIds.push(user._id.toString());

      await assert.rejects(
        async () => {
          // @ts-expect-error Missing department
          await Custodian.create({ user: user._id });
        },
        /Department is required for custodian/
      );
    });

    it('should enforce 1:1 user-to-custodian unique constraint in MongoDB', async () => {
      const user = await User.create({
        name: 'Single Custodian User',
        email: `${TEST_PREFIX}single_custodian_${Date.now()}@campusflow.edu`,
        roles: [UserRole.CUSTODIAN],
      });
      createdUserIds.push(user._id.toString());

      const firstCustodian = await Custodian.create({
        user: user._id,
        department: 'Department A',
      });
      createdCustodianIds.push(firstCustodian._id.toString());

      await assert.rejects(
        async () => {
          await Custodian.create({
            user: user._id,
            department: 'Department B',
          });
        },
        (err: unknown) => {
          const mongoErr = err as { code?: number };
          return mongoErr.code === 11000;
        }
      );
    });
  });

  // ==========================================
  // MODEL 5: RESOURCE TESTS
  // ==========================================
  describe('Resource Model', () => {
    it('should create a valid Resource with type, location, custodian, and embedded attributes', async () => {
      const user = await User.create({
        name: 'Lab Manager',
        email: `${TEST_PREFIX}lab_mgr_${Date.now()}@campusflow.edu`,
        roles: [UserRole.CUSTODIAN],
      });
      createdUserIds.push(user._id.toString());

      const custodian = await Custodian.create({
        user: user._id,
        department: 'Computer Science & Engineering',
      });
      createdCustodianIds.push(custodian._id.toString());

      const resourceType = await ResourceType.create({
        name: 'Computing Lab Template',
        code: `TEST_RT_${Date.now()}`,
        category: ResourceCategory.LABORATORY,
      });
      createdResourceTypeIds.push(resourceType._id.toString());

      const resourceCode = `TEST_RES_CS_${Date.now()}`;
      const resource = await Resource.create({
        name: 'Advanced Computing Lab 101',
        code: resourceCode,
        resourceType: resourceType._id,
        description: 'High-performance computing laboratory for graduate researchers',
        capacity: 40,
        location: {
          building: 'Alan Turing Science Hall',
          floor: '3rd Floor',
          roomNumber: 'ATH-304',
          campus: 'North Campus',
        },
        status: ResourceStatus.ACTIVE,
        custodian: custodian._id,
        attributes: [
          {
            key: 'workstations',
            label: 'Total Workstations',
            dataType: AttributeDataType.NUMBER,
            value: 40,
          },
          {
            key: 'has_gpu',
            label: 'NVIDIA GPU Acceleration',
            dataType: AttributeDataType.BOOLEAN,
            value: true,
          },
          {
            key: 'os',
            label: 'Operating System',
            dataType: AttributeDataType.STRING,
            value: 'Linux Ubuntu',
          },
        ],
      });
      createdResourceIds.push(resource._id.toString());

      assert.ok(resource._id);
      assert.strictEqual(resource.name, 'Advanced Computing Lab 101');
      assert.strictEqual(resource.code, resourceCode);
      assert.strictEqual(resource.capacity, 40);
      assert.strictEqual(resource.status, ResourceStatus.ACTIVE);
      assert.strictEqual(resource.isActive, true);
      assert.strictEqual(resource.location.building, 'Alan Turing Science Hall');
      assert.strictEqual(resource.location.roomNumber, 'ATH-304');
      assert.strictEqual(resource.custodian?.toString(), custodian._id.toString());
      assert.strictEqual(resource.resourceType.toString(), resourceType._id.toString());
      assert.strictEqual(resource.attributes.length, 3);
      assert.strictEqual(resource.attributes[0].key, 'workstations');
      assert.strictEqual(resource.attributes[0].value, 40);
    });

    it('should reject invalid resource status enum', async () => {
      const resourceType = await ResourceType.create({
        name: 'Status Test Type',
        code: `TEST_ST_TYPE_${Date.now()}`,
      });
      createdResourceTypeIds.push(resourceType._id.toString());

      await assert.rejects(
        async () => {
          // @ts-expect-error Invalid status value
          await Resource.create({
            name: 'Invalid Status Resource',
            code: `TEST_INV_STAT_${Date.now()}`,
            resourceType: resourceType._id,
            capacity: 25,
            location: { building: 'Hall A' },
            status: 'OCCUPIED_RIGHT_NOW',
          });
        },
        /Invalid resource status/
      );
    });

    it('should reject capacity less than 1', async () => {
      const resourceType = await ResourceType.create({
        name: 'Capacity Test Type',
        code: `TEST_CAP_TYPE_${Date.now()}`,
      });
      createdResourceTypeIds.push(resourceType._id.toString());

      await assert.rejects(
        async () => {
          await Resource.create({
            name: 'Zero Capacity Resource',
            code: `TEST_ZERO_CAP_${Date.now()}`,
            resourceType: resourceType._id,
            capacity: 0,
            location: { building: 'Hall B' },
          });
        },
        /Capacity must be at least 1/
      );
    });

    it('should reject duplicate attribute keys within the same resource', async () => {
      const resourceType = await ResourceType.create({
        name: 'Duplicate Attr Test Type',
        code: `TEST_DATTR_TYPE_${Date.now()}`,
      });
      createdResourceTypeIds.push(resourceType._id.toString());

      await assert.rejects(
        async () => {
          await Resource.create({
            name: 'Duplicate Attribute Key Resource',
            code: `TEST_DUP_KEY_${Date.now()}`,
            resourceType: resourceType._id,
            capacity: 30,
            location: { building: 'Hall C' },
            attributes: [
              { key: 'projector_model', dataType: AttributeDataType.STRING, value: 'Epson 1' },
              { key: 'projector_model', dataType: AttributeDataType.STRING, value: 'Epson 2' },
            ],
          });
        },
        /Duplicate attribute key "projector_model" in resource attributes/
      );
    });

    it('should enforce unique resource code constraint in MongoDB', async () => {
      const resourceType = await ResourceType.create({
        name: 'Code Uniqueness Test Type',
        code: `TEST_CODE_UNIQ_TYPE_${Date.now()}`,
      });
      createdResourceTypeIds.push(resourceType._id.toString());

      const code = `TEST_RES_CODE_${Date.now()}`;
      const firstResource = await Resource.create({
        name: 'First Resource',
        code,
        resourceType: resourceType._id,
        capacity: 20,
        location: { building: 'Science Building' },
      });
      createdResourceIds.push(firstResource._id.toString());

      await assert.rejects(
        async () => {
          await Resource.create({
            name: 'Second Resource Same Code',
            code,
            resourceType: resourceType._id,
            capacity: 25,
            location: { building: 'Arts Building' },
          });
        },
        (err: unknown) => {
          const mongoErr = err as { code?: number };
          return mongoErr.code === 11000;
        }
      );
    });
  });
});
