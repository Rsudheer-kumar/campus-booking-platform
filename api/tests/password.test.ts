/**
 * CampusFlow API - Password Hashing, Policy & User Credential Tests (Phase 2.6A)
 * Tests bcrypt hashing (work factor 12), password policy enforcement,
 * and User model credential fields (passwordHash, tokenVersion, lastLoginAt).
 *
 * TEST ISOLATION:
 * Operates strictly on the dedicated, isolated test database (`campusflow_test`).
 */

import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import mongoose from 'mongoose';
import { connectDatabase, disconnectDatabase, isDatabaseConnected } from '../src/config/database';
import { env } from '../src/config/env';
import { User, UserRole } from '../src/models';
import {
  hashPassword,
  verifyPassword,
  validatePasswordPolicy,
  BCRYPT_SALT_ROUNDS,
  PASSWORD_POLICY,
} from '../src/utils/password';

describe('Phase 2.6A - Authentication Foundations & Credentials', () => {
  const TEST_PREFIX = 'test_p26a_';
  const createdUserIds: string[] = [];

  before(async () => {
    await connectDatabase(env.MONGODB_TEST_URI);
    assert.strictEqual(isDatabaseConnected(), true, 'Database must be connected');
    const connectedDb = mongoose.connection.db?.databaseName;
    assert.strictEqual(
      connectedDb,
      'campusflow_test',
      `Tests must run exclusively on isolated test database (connected to: "${connectedDb}")`
    );
  });

  after(async () => {
    if (isDatabaseConnected()) {
      if (createdUserIds.length > 0) {
        await User.deleteMany({ _id: { $in: createdUserIds } });
      }
      await disconnectDatabase();
    }
  });

  describe('Password Policy Validation', () => {
    it('should define password policy constraints (min 8, max 72)', () => {
      assert.strictEqual(PASSWORD_POLICY.MIN_LENGTH, 8);
      assert.strictEqual(PASSWORD_POLICY.MAX_LENGTH, 72);
    });

    it('should accept valid passwords meeting all criteria', () => {
      const validPasswords = [
        'CampusFlow#2026',
        'SecurePassword1!',
        'Admin_Secret99$',
        'P@ssw0rd1234',
        'A'.repeat(20) + 'a'.repeat(20) + '1'.repeat(20) + '!', // 61 chars (<= 72)
      ];

      for (const pwd of validPasswords) {
        const result = validatePasswordPolicy(pwd);
        assert.strictEqual(result.valid, true, `Expected "${pwd}" to be valid`);
        assert.strictEqual(result.errors.length, 0);
      }
    });

    it('should reject passwords that are too short (< 8 characters)', () => {
      const result = validatePasswordPolicy('Ab1!');
      assert.strictEqual(result.valid, false);
      assert.ok(result.errors.some((e) => e.includes('at least 8 characters')));
    });

    it('should reject passwords that are too long (> 72 characters)', () => {
      const longPassword = 'A1!' + 'a'.repeat(70); // 73 chars
      const result = validatePasswordPolicy(longPassword);
      assert.strictEqual(result.valid, false);
      assert.ok(result.errors.some((e) => e.includes('cannot exceed 72 characters')));
    });

    it('should reject passwords missing uppercase letters', () => {
      const result = validatePasswordPolicy('lowercase123!@#');
      assert.strictEqual(result.valid, false);
      assert.ok(result.errors.some((e) => e.includes('uppercase')));
    });

    it('should reject passwords missing lowercase letters', () => {
      const result = validatePasswordPolicy('UPPERCASE123!@#');
      assert.strictEqual(result.valid, false);
      assert.ok(result.errors.some((e) => e.includes('lowercase')));
    });

    it('should reject passwords missing numeric digits', () => {
      const result = validatePasswordPolicy('NoDigitsHere!@#');
      assert.strictEqual(result.valid, false);
      assert.ok(result.errors.some((e) => e.includes('numeric digit')));
    });

    it('should reject passwords missing special characters', () => {
      const result = validatePasswordPolicy('NoSpecialChar1234');
      assert.strictEqual(result.valid, false);
      assert.ok(result.errors.some((e) => e.includes('special character')));
    });

    it('should reject non-string password inputs', () => {
      assert.strictEqual(validatePasswordPolicy(null).valid, false);
      assert.strictEqual(validatePasswordPolicy(undefined).valid, false);
      assert.strictEqual(validatePasswordPolicy(12345678).valid, false);
      assert.strictEqual(validatePasswordPolicy({}).valid, false);
    });
  });

  describe('Password Hashing & Verification (bcrypt)', () => {
    it('should configure bcrypt cost factor to 12', () => {
      assert.strictEqual(BCRYPT_SALT_ROUNDS, 12, 'BCRYPT_SALT_ROUNDS must equal 12');
    });

    it('should hash password into a non-plaintext bcrypt string with cost 12', async () => {
      const plaintext = 'SuperSecret#2026';
      const hash = await hashPassword(plaintext);

      assert.notStrictEqual(hash, plaintext);
      assert.strictEqual(hash.includes(plaintext), false);
      // Format: $2b$12$... or $2a$12$...
      assert.match(hash, /^\$2[ab]\$12\$/);
      const parts = hash.split('$');
      assert.strictEqual(parts[2], '12', 'Bcrypt cost factor in hash must be 12');
    });

    it('should verify password successfully with correct plaintext', async () => {
      const plaintext = 'ValidP@ssw0rd99';
      const hash = await hashPassword(plaintext);

      const isValid = await verifyPassword(plaintext, hash);
      assert.strictEqual(isValid, true);
    });

    it('should reject verification with incorrect password', async () => {
      const plaintext = 'ValidP@ssw0rd99';
      const hash = await hashPassword(plaintext);

      const isValid = await verifyPassword('WrongP@ssw0rd99', hash);
      assert.strictEqual(isValid, false);
    });

    it('should return false when verifying empty or invalid inputs', async () => {
      const isValid1 = await verifyPassword('', 'hash');
      const isValid2 = await verifyPassword('pass', '');
      assert.strictEqual(isValid1, false);
      assert.strictEqual(isValid2, false);
    });

    it('should reject hashing passwords that violate policy', async () => {
      await assert.rejects(
        async () => {
          await hashPassword('weak');
        },
        /Password policy violation/
      );
    });
  });

  describe('User Credential Model Invariants', () => {
    it('should default tokenVersion to 0 when user is created', async () => {
      const user = await User.create({
        name: 'Token Version User',
        email: `${TEST_PREFIX}tv_${Date.now()}@campusflow.edu`,
        roles: [UserRole.STUDENT],
      });
      createdUserIds.push(user._id.toString());

      assert.strictEqual(user.tokenVersion, 0);
    });

    it('should support atomic increment of tokenVersion', async () => {
      const user = await User.create({
        name: 'Increment Token User',
        email: `${TEST_PREFIX}inc_${Date.now()}@campusflow.edu`,
        roles: [UserRole.STUDENT],
      });
      createdUserIds.push(user._id.toString());
      assert.strictEqual(user.tokenVersion, 0);

      const updated = await User.findByIdAndUpdate(
        user._id,
        { $inc: { tokenVersion: 1 } },
        { returnDocument: 'after' }
      );
      assert.ok(updated);
      assert.strictEqual(updated.tokenVersion, 1);
    });

    it('should exclude passwordHash from normal queries and JSON serialization (select: false)', async () => {
      const hash = await hashPassword('HiddenSecret#2026');
      const user = await User.create({
        name: 'Hidden Hash User',
        email: `${TEST_PREFIX}hidden_${Date.now()}@campusflow.edu`,
        roles: [UserRole.FACULTY],
        passwordHash: hash,
      });
      createdUserIds.push(user._id.toString());

      // Query by findById
      const queried = await User.findById(user._id).lean();
      assert.ok(queried);
      assert.strictEqual(queried.passwordHash, undefined, 'passwordHash must be omitted in standard query');

      // Check toJSON serialization on Mongoose document
      const doc = await User.findById(user._id);
      assert.ok(doc);
      assert.strictEqual(doc.passwordHash, undefined);
      const json = doc.toJSON();
      assert.strictEqual(json.passwordHash, undefined, 'passwordHash must be omitted in toJSON()');

      // Explicit select allows loading passwordHash for authentication
      const authUser = await User.findById(user._id).select('+passwordHash').lean();
      assert.ok(authUser);
      assert.strictEqual(authUser.passwordHash, hash, 'Explicit select must yield passwordHash');
    });

    it('should support updating lastLoginAt with Date values', async () => {
      const user = await User.create({
        name: 'Login Tracking User',
        email: `${TEST_PREFIX}login_${Date.now()}@campusflow.edu`,
        roles: [UserRole.STAFF],
      });
      createdUserIds.push(user._id.toString());
      assert.strictEqual(user.lastLoginAt, undefined);

      const loginTime = new Date('2026-09-30T14:30:00.000Z');
      const updated = await User.findByIdAndUpdate(
        user._id,
        { lastLoginAt: loginTime },
        { returnDocument: 'after' }
      );
      assert.ok(updated);
      assert.ok(updated.lastLoginAt instanceof Date);
      assert.strictEqual(updated.lastLoginAt.toISOString(), loginTime.toISOString());
    });

    it('should preserve backward compatibility for users created without passwordHash', async () => {
      const user = await User.create({
        name: 'Legacy User Without Password',
        email: `${TEST_PREFIX}legacy_${Date.now()}@campusflow.edu`,
        roles: [UserRole.STUDENT],
      });
      createdUserIds.push(user._id.toString());

      assert.strictEqual(user.name, 'Legacy User Without Password');
      assert.strictEqual(user.passwordHash, undefined);
      assert.strictEqual(user.tokenVersion, 0);
      assert.strictEqual(user.isActive, true);
    });
  });
});
