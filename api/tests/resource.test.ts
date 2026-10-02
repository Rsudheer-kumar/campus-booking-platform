/**
 * CampusFlow API - Resource Catalogue Endpoint Tests
 * Validates resource listing, search, filtering, and retrieval endpoints.
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
  ResourceType,
  ResourceCategory,
  Resource,
  ResourceStatus,
  type ResourceDocument,
} from '../src/models';

describe('CampusFlow Resource Catalogue Endpoints', () => {
  let server: Server;
  let baseUrl: string;

  const TEST_PREFIX = 'RES_TEST_';
  let testResourceType: mongoose.Types.ObjectId;
  let resource1: ResourceDocument;
  let resource2: ResourceDocument;

  before(async () => {
    await connectDatabase(env.MONGODB_TEST_URI);
    assert.strictEqual(isDatabaseConnected(), true);

    await new Promise<void>((resolve) => {
      server = app.listen(0, () => {
        const address = server.address() as AddressInfo;
        baseUrl = `http://127.0.0.1:${address.port}`;
        resolve();
      });
    });
  });

  after(async () => {
    await Promise.all([
      Resource.deleteMany({ code: { $regex: `^${TEST_PREFIX}` } }),
      ResourceType.deleteMany({ code: { $regex: `^${TEST_PREFIX}` } }),
    ]);

    await new Promise<void>((resolve) => {
      server.close(() => resolve());
    });
    await disconnectDatabase();
  });

  beforeEach(async () => {
    await Resource.deleteMany({ code: { $regex: `^${TEST_PREFIX}` } });
    await ResourceType.deleteMany({ code: { $regex: `^${TEST_PREFIX}` } });

    const rType = await ResourceType.create({
      name: `${TEST_PREFIX}Lecture Hall`,
      code: `${TEST_PREFIX}LH`,
      category: ResourceCategory.ROOM,
      description: 'Test lecture hall type',
    });
    testResourceType = rType._id;

    resource1 = await Resource.create({
      name: `${TEST_PREFIX}Turing Hall`,
      code: `${TEST_PREFIX}LH101`,
      resourceType: testResourceType,
      capacity: 120,
      status: ResourceStatus.ACTIVE,
      location: {
        building: `${TEST_PREFIX}Turing Science Center`,
        floor: '1',
        roomNumber: '101',
      },
      specifications: {
        projector: true,
      },
    });

    resource2 = await Resource.create({
      name: `${TEST_PREFIX}Hopper Lab`,
      code: `${TEST_PREFIX}LAB201`,
      resourceType: testResourceType,
      capacity: 45,
      status: ResourceStatus.ACTIVE,
      location: {
        building: `${TEST_PREFIX}Hopper Engineering Complex`,
        floor: '2',
        roomNumber: '201',
      },
      specifications: {
        workstations: 45,
      },
    });
  });

  it('GET /api/resources should list resources with pagination metadata', async () => {
    const res = await fetch(`${baseUrl}/api/resources?search=${TEST_PREFIX}`);
    assert.strictEqual(res.status, 200);

    const body = (await res.json()) as {
      success: boolean;
      data: {
        resources: Array<{ _id: string; name: string; code: string }>;
        total: number;
        page: number;
        limit: number;
      };
    };

    assert.strictEqual(body.success, true);
    assert.strictEqual(body.data.total, 2);
    assert.strictEqual(body.data.resources.length, 2);
    assert.ok(body.data.resources.some((r) => r.code === `${TEST_PREFIX}LH101`));
    assert.ok(body.data.resources.some((r) => r.code === `${TEST_PREFIX}LAB201`));
  });

  it('GET /api/resources should filter resources by building', async () => {
    const res = await fetch(`${baseUrl}/api/resources?building=${TEST_PREFIX}Hopper`);
    assert.strictEqual(res.status, 200);

    const body = (await res.json()) as {
      success: boolean;
      data: {
        resources: Array<{ _id: string; name: string; code: string }>;
        total: number;
      };
    };

    assert.strictEqual(body.success, true);
    assert.strictEqual(body.data.total, 1);
    assert.strictEqual(body.data.resources[0].code, `${TEST_PREFIX}LAB201`);
  });

  it('GET /api/resources/:id should retrieve specific resource by ID', async () => {
    const res = await fetch(`${baseUrl}/api/resources/${resource1._id}`);
    assert.strictEqual(res.status, 200);

    const body = (await res.json()) as {
      success: boolean;
      data: {
        _id: string;
        name: string;
        code: string;
        capacity: number;
        resourceType: { name: string; code: string };
      };
    };

    assert.strictEqual(body.success, true);
    assert.strictEqual(body.data.code, `${TEST_PREFIX}LH101`);
    assert.strictEqual(body.data.capacity, 120);
    assert.strictEqual(body.data.resourceType.name, `${TEST_PREFIX}Lecture Hall`);
  });

  it('GET /api/resources/:id should return 404 for non-existent ObjectId', async () => {
    const nonExistentId = new Types.ObjectId().toString();
    const res = await fetch(`${baseUrl}/api/resources/${nonExistentId}`);
    assert.strictEqual(res.status, 404);

    const body = (await res.json()) as {
      success: boolean;
      error: { code: string; message: string };
    };

    assert.strictEqual(body.success, false);
    assert.strictEqual(body.error.code, 'NOT_FOUND');
  });

  it('GET /api/resources/:id should return 400 for malformed ObjectId', async () => {
    const res = await fetch(`${baseUrl}/api/resources/invalid-mongo-id`);
    assert.strictEqual(res.status, 400);

    const body = (await res.json()) as {
      success: boolean;
      error: { code: string };
    };

    assert.strictEqual(body.success, false);
    assert.strictEqual(body.error.code, 'VALIDATION_ERROR');
  });
});
