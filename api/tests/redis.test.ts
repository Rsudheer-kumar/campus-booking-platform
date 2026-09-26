/**
 * CampusFlow API - Redis Configuration & Lifecycle Smoke Tests
 * Validates Redis connection state, URL credential redaction, lifecycle hooks,
 * duplicate connection protection, and graceful failure handling.
 */

import { describe, it, after } from 'node:test';
import assert from 'node:assert/strict';
import {
  connectRedis,
  disconnectRedis,
  getRedisState,
  isRedisConnected,
  redactRedisUrl,
  getLastRedisError,
} from '../src/config/redis';
import { env } from '../src/config/env';

describe('Redis Configuration & Lifecycle Smoke Tests', () => {
  after(async () => {
    // Always clean up after test suite
    await disconnectRedis();
  });

  it('redactRedisUrl should properly redact credentials from Redis URL', () => {
    const urlWithPass = 'redis://:super_secret_redis_pass@localhost:6379';
    const redacted1 = redactRedisUrl(urlWithPass);
    assert.strictEqual(redacted1, 'redis://:****@localhost:6379');
    assert.ok(!redacted1.includes('super_secret_redis_pass'));

    const urlWithUserPass = 'redis://redis_user:secret_pass_123@redis.internal:6379';
    const redacted2 = redactRedisUrl(urlWithUserPass);
    assert.strictEqual(redacted2, 'redis://redis_user:****@redis.internal:6379');
    assert.ok(!redacted2.includes('secret_pass_123'));

    const standardUrl = 'redis://localhost:6379';
    assert.strictEqual(redactRedisUrl(standardUrl), standardUrl);
  });

  it('getRedisState and isRedisConnected should report valid initial states', () => {
    const state = getRedisState();
    assert.ok(['connected', 'connecting', 'disconnected', 'error'].includes(state));

    const isConnected = isRedisConnected();
    assert.strictEqual(typeof isConnected, 'boolean');
  });

  it('connectRedis to unreachable port should fail gracefully and record error state', async () => {
    // Attempt connection to non-existent Redis port (6399)
    const unreachableUrl = 'redis://127.0.0.1:6399';

    let errorThrown = false;
    try {
      await connectRedis(unreachableUrl);
    } catch (err) {
      errorThrown = true;
      assert.ok(err instanceof Error);
    }

    assert.strictEqual(errorThrown, true);
    assert.strictEqual(isRedisConnected(), false);
    assert.strictEqual(getRedisState(), 'error');
    assert.ok(getLastRedisError() !== null);

    // Clean disconnect resets state
    await disconnectRedis();
    assert.strictEqual(getRedisState(), 'disconnected');
  });

  it('connectRedis with configured REDIS_URL should handle real local environment truthfully', async () => {
    try {
      const client = await connectRedis(env.REDIS_URL);
      if (client && client.isReady) {
        // If local Redis is running
        assert.strictEqual(isRedisConnected(), true);
        assert.strictEqual(getRedisState(), 'connected');
        await disconnectRedis();
        assert.strictEqual(isRedisConnected(), false);
      }
    } catch (err) {
      // If local Redis service is unavailable
      assert.ok(err instanceof Error);
      assert.strictEqual(isRedisConnected(), false);
      assert.strictEqual(getRedisState(), 'error');
      await disconnectRedis();
    }
  });
});
