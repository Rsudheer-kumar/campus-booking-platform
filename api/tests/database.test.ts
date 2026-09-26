/**
 * CampusFlow API - MongoDB Configuration & Lifecycle Smoke Tests
 * Validates Mongoose connection state, credential redaction, lifecycle hooks,
 * and error handling behavior.
 */

import { describe, it, after } from 'node:test';
import assert from 'node:assert/strict';
import {
  connectDatabase,
  disconnectDatabase,
  getDatabaseState,
  isDatabaseConnected,
  redactMongoUri,
  getLastDatabaseError,
} from '../src/config/database';
import { env } from '../src/config/env';

describe('MongoDB Configuration & Lifecycle Smoke Tests', () => {
  after(async () => {
    // Always clean up after test suite
    await disconnectDatabase();
  });

  it('redactMongoUri should properly redact credentials from connection string', () => {
    const rawUri = 'mongodb://app_user:super_secret_password@localhost:27017/campusflow';
    const redacted = redactMongoUri(rawUri);
    assert.strictEqual(redacted, 'mongodb://app_user:****@localhost:27017/campusflow');
    assert.ok(!redacted.includes('super_secret_password'));

    // Non-credential URI remains intact
    const standardUri = 'mongodb://localhost:27017/campusflow';
    assert.strictEqual(redactMongoUri(standardUri), standardUri);
  });

  it('getDatabaseState and isDatabaseConnected should report valid initial states', () => {
    const state = getDatabaseState();
    assert.ok(['connected', 'connecting', 'disconnecting', 'disconnected', 'error'].includes(state));

    const isConnected = isDatabaseConnected();
    assert.strictEqual(typeof isConnected, 'boolean');
  });

  it('connectDatabase to invalid/offline port should fail gracefully and record error state', async () => {
    // Attempt connection to non-existent MongoDB port with 1000ms timeout
    const unreachableUri = 'mongodb://127.0.0.1:27018/campusflow_failure_test';

    let errorThrown = false;
    try {
      await connectDatabase(unreachableUri);
    } catch (err) {
      errorThrown = true;
      assert.ok(err instanceof Error);
    }

    assert.strictEqual(errorThrown, true);
    assert.strictEqual(isDatabaseConnected(), false);
    assert.strictEqual(getDatabaseState(), 'error');
    assert.ok(getLastDatabaseError() !== null);

    // Clean disconnect resets state
    await disconnectDatabase();
    assert.strictEqual(getDatabaseState(), 'disconnected');
  });

  it('connectDatabase with configured MONGODB_URI should handle real local environment truthfully', async () => {
    try {
      const conn = await connectDatabase(env.MONGODB_URI);
      if (conn) {
        // If local MongoDB is running
        assert.strictEqual(isDatabaseConnected(), true);
        assert.strictEqual(getDatabaseState(), 'connected');
        await disconnectDatabase();
        assert.strictEqual(isDatabaseConnected(), false);
      }
    } catch (err) {
      // If local MongoDB service is stopped (e.g. non-elevated user)
      assert.ok(err instanceof Error);
      assert.strictEqual(isDatabaseConnected(), false);
      assert.strictEqual(getDatabaseState(), 'error');
      await disconnectDatabase();
    }
  });
});
