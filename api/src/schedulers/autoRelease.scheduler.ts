/**
 * CampusFlow API - Autonomous Auto-Release Background Scheduler
 *
 * Implements resilient, autonomous in-process background scheduling to auto-release
 * abandoned confirmed reservations as NO_SHOW once the grace window has passed.
 *
 * Locked Invariants:
 * - Independent of Redis: Uses in-process timer with execution mutex and atomic MongoDB claims.
 * - Single-use timer with unref() so Node.js process / tests do not hang.
 * - Strict lookback boundary (24 hours) to prevent unbounded historical scans.
 * - Releases slot capacity atomically by transitioning status out of ACTIVE_RESERVATION_STATES.
 */

import { Reservation, ReservationStatus } from '../models/reservation.model';
import { env } from '../config/env';
import { logger } from '../utils/logger';

export class AutoReleaseScheduler {
  private timer: NodeJS.Timeout | null = null;
  private isRunning = false;
  private isStarted = false;
  private lastRunAt: Date | null = null;
  private totalReleased = 0;

  /**
   * Starts the autonomous scheduler timer.
   * Safe to call multiple times (idempotent).
   */
  public start(): void {
    if (this.isStarted) {
      return;
    }

    this.isStarted = true;
    logger.info(
      `[AutoReleaseScheduler] Starting auto-release background scheduler ` +
      `(poll interval: ${env.AUTO_RELEASE_POLL_INTERVAL_MS}ms, grace: ${env.AUTO_RELEASE_GRACE_MINUTES}m, lookback: ${env.AUTO_RELEASE_LOOKBACK_HOURS}h)`
    );

    this.timer = setInterval(() => {
      void this.runTick();
    }, env.AUTO_RELEASE_POLL_INTERVAL_MS);

    if (this.timer.unref) {
      this.timer.unref();
    }
  }

  /**
   * Stops the autonomous scheduler timer cleanly.
   * Idempotent and safe for shutdown hooks and test tear-downs.
   */
  public stop(): void {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
    this.isStarted = false;
    logger.info('[AutoReleaseScheduler] Auto-release background scheduler stopped');
  }

  /**
   * Executes a scheduled tick protected by an execution mutex.
   * Prevents overlapping runs if a tick takes longer than the interval.
   */
  private async runTick(): Promise<void> {
    if (this.isRunning) {
      logger.debug('[AutoReleaseScheduler] Previous sweep tick still running, skipping overlap');
      return;
    }

    this.isRunning = true;
    try {
      await this.runOnce();
    } catch (error) {
      logger.error(
        '[AutoReleaseScheduler] Unhandled error during auto-release sweep',
        error instanceof Error ? error.message : error
      );
    } finally {
      this.isRunning = false;
    }
  }

  /**
   * Executes a single sweep of all eligible reservations.
   * Publicly accessible for deterministic testing and manual triggers.
   */
  public async runOnce(): Promise<{ scanned: number; released: number }> {
    const now = new Date();
    this.lastRunAt = now;

    // Boundary definitions:
    // 1. graceCutoff: startAt must be older than (now - AUTO_RELEASE_GRACE_MINUTES)
    // 2. lookbackCutoff: startAt must be within (now - AUTO_RELEASE_LOOKBACK_HOURS)
    const graceCutoff = new Date(now.getTime() - env.AUTO_RELEASE_GRACE_MINUTES * 60000);
    const lookbackCutoff = new Date(now.getTime() - env.AUTO_RELEASE_LOOKBACK_HOURS * 3600000);

    const candidates = await Reservation.find({
      status: ReservationStatus.CONFIRMED,
      checkInAt: null,
      startAt: {
        $lt: graceCutoff,
        $gte: lookbackCutoff,
      },
    })
      .select('_id title startAt resource')
      .lean();

    let releasedCount = 0;
    const releaseReason = `Auto-released: Check-in grace period expired (${env.AUTO_RELEASE_GRACE_MINUTES} minutes)`;

    for (const candidate of candidates) {
      // Atomic state transition predicate:
      // Repeats the complete predicate: _id, CONFIRMED, checkInAt is null, and within the bounded [now-lookback, now-grace) window
      const updated = await Reservation.findOneAndUpdate(
        {
          _id: candidate._id,
          status: ReservationStatus.CONFIRMED,
          checkInAt: null,
          startAt: {
            $lt: graceCutoff,
            $gte: lookbackCutoff,
          },
        },
        {
          $set: {
            status: ReservationStatus.NO_SHOW,
            autoReleasedAt: now,
            autoReleaseReason: releaseReason,
          },
        },
        { new: true }
      );

      if (updated) {
        releasedCount++;
        this.totalReleased++;
        logger.info(
          `[AutoReleaseScheduler] Auto-released reservation ${candidate._id} ("${candidate.title}") to NO_SHOW`
        );
      }
    }

    return { scanned: candidates.length, released: releasedCount };
  }

  /**
   * Diagnostic telemetry inspection.
   */
  public getStatus(): {
    isStarted: boolean;
    isRunning: boolean;
    lastRunAt: Date | null;
    totalReleased: number;
  } {
    return {
      isStarted: this.isStarted,
      isRunning: this.isRunning,
      lastRunAt: this.lastRunAt,
      totalReleased: this.totalReleased,
    };
  }
}

export const autoReleaseScheduler = new AutoReleaseScheduler();
