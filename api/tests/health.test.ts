/**
 * CampusFlow API - Health & Core Middleware Integration Tests
 * Tests app.ts directly without starting the production server.
 */

import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import type { Server } from 'http';
import type { AddressInfo } from 'net';
import { app } from '../src/app';

describe('CampusFlow API Foundation & Health Tests', () => {
  let server: Server;
  let baseUrl: string;

  before(async () => {
    // Start test server on ephemeral port
    await new Promise<void>((resolve) => {
      server = app.listen(0, () => {
        const address = server.address() as AddressInfo;
        baseUrl = `http://127.0.0.1:${address.port}`;
        resolve();
      });
    });
  });

  after(async () => {
    await new Promise<void>((resolve) => {
      server.close(() => resolve());
    });
  });

  it('GET /api/health should return structured 200 OK with truthful dependency status', async () => {
    const res = await fetch(`${baseUrl}/api/health`);
    assert.strictEqual(res.status, 200);

    const body = (await res.json()) as {
      success: boolean;
      data: {
        status: string;
        timestamp: string;
        uptime: number;
        environment: string;
        services: {
          database: string;
          redis: string;
        };
      };
    };

    assert.strictEqual(body.success, true);
    assert.strictEqual(body.data.status, 'ok');
    assert.ok(typeof body.data.timestamp === 'string');
    assert.ok(typeof body.data.uptime === 'number');
    assert.ok(typeof body.data.environment === 'string');
    assert.ok(body.data.services);
    assert.ok(['connected', 'connecting', 'disconnecting', 'disconnected'].includes(body.data.services.database));
    assert.ok(['connected', 'connecting', 'disconnected'].includes(body.data.services.redis));
  });

  it('GET / should return root application information', async () => {
    const res = await fetch(`${baseUrl}/`);
    assert.strictEqual(res.status, 200);

    const body = (await res.json()) as {
      success: boolean;
      data: {
        name: string;
        version: string;
        healthCheck: string;
      };
    };

    assert.strictEqual(body.success, true);
    assert.strictEqual(body.data.name, 'CampusFlow API');
    assert.strictEqual(body.data.healthCheck, '/api/health');
  });

  it('GET /api/nonexistent-route should return structured 404 JSON', async () => {
    const res = await fetch(`${baseUrl}/api/nonexistent-route`);
    assert.strictEqual(res.status, 404);

    const body = (await res.json()) as {
      success: boolean;
      error: {
        code: string;
        message: string;
      };
    };

    assert.strictEqual(body.success, false);
    assert.strictEqual(body.error.code, 'ROUTE_NOT_FOUND');
    assert.ok(body.error.message.includes('/api/nonexistent-route'));
  });

  it('POST with malformed JSON body should return structured 400 INVALID_JSON', async () => {
    const res = await fetch(`${baseUrl}/api/health`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: '{ invalid_json: ',
    });

    assert.strictEqual(res.status, 400);

    const body = (await res.json()) as {
      success: boolean;
      error: {
        code: string;
        message: string;
      };
    };

    assert.strictEqual(body.success, false);
    assert.strictEqual(body.error.code, 'INVALID_JSON');
    assert.strictEqual(body.error.message, 'Malformed JSON in request body');
  });
});
