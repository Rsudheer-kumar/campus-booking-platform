/**
 * CampusFlow API - Timetable Domain Service (Phase 3.1)
 * Authoritative business logic for timetable ingestion, atomic republication,
 * resource code resolution, version protection, and ad-hoc booking supersession.
 */

import mongoose, { Types } from 'mongoose';
import {
  TimetableEntry,
  type ITimetableEntry,
  type TimetableEntryDocument,
  Resource,
  Reservation,
  ReservationStatus,
  ACTIVE_RESERVATION_STATES,
} from '../models';
import { intervalsOverlap } from '../utils/timezone';
import { ConflictError, UnprocessableEntityError } from '../utils/errors';
import type { SyncTimetableBodyInput, ListTimetablesQueryInput, ConflictAuditQueryInput } from '../validators/timetable.validator';

export interface SyncResult {
  academicTerm: string;
  version: number;
  publicationBatchId: string;
  insertedCount: number;
  activeCount: number;
  supersededEntriesCount: number;
  cancelledReservationsCount: number;
  conflictsDetected: number;
  isIdempotentRepeat?: boolean;
}

export class TimetableService {
  /**
   * Synchronizes an entire published timetable batch atomically for a given academic term.
   * Enforces:
   * 1. 100% Resource code resolution before write.
   * 2. Stale version rejection (409).
   * 3. Idempotent re-submission when matching batchId and version.
   * 4. Multi-document transaction atomicity.
   * 5. Supersession & cancellation of conflicting active ad-hoc reservations with
   *    reason "SUPERSEDED_BY_TIMETABLE_REPUBLICATION".
   * 6. Deactivation (unpublishing) of absent/previous timetable records for that term.
   */
  public static async syncTimetable(
    payload: SyncTimetableBodyInput,
    adminUserId: string | Types.ObjectId
  ): Promise<SyncResult> {
    const { academicTerm, version, publicationBatchId, entries } = payload;

    // 1. Check current published version for this academic term
    const latestPublished = await TimetableEntry.findOne({
      academicTerm,
      isPublished: true,
    })
      .sort({ version: -1 })
      .lean();

    if (latestPublished) {
      if (version < latestPublished.version) {
        throw new ConflictError(
          `Stale publication version: incoming version ${version} is older than currently published version ${latestPublished.version}`
        );
      }

      if (version === latestPublished.version) {
        if (latestPublished.publicationBatchId === publicationBatchId) {
          // Idempotent repeat submission of the exact same publication batch
          const activeCount = await TimetableEntry.countDocuments({
            academicTerm,
            publicationBatchId,
            isPublished: true,
          });

          return {
            academicTerm,
            version,
            publicationBatchId,
            insertedCount: 0,
            activeCount,
            supersededEntriesCount: 0,
            cancelledReservationsCount: 0,
            conflictsDetected: 0,
            isIdempotentRepeat: true,
          };
        } else {
          throw new ConflictError(
            `Publication version ${version} for term "${academicTerm}" has already been published with batch ID "${latestPublished.publicationBatchId}"`
          );
        }
      }
    }

    // 2. Resolve all resource codes to physical CampusFlow Resource ObjectIds
    const uniqueCodes = Array.from(new Set(entries.map((e) => e.resourceCode.toUpperCase())));
    const existingResources = await Resource.find({ code: { $in: uniqueCodes } }).lean();
    const resourceMap = new Map(existingResources.map((r) => [r.code.toUpperCase(), r]));

    const missingCodes = uniqueCodes.filter((c) => !resourceMap.has(c));
    if (missingCodes.length > 0) {
      throw new UnprocessableEntityError(
        `Unknown resource codes: ${missingCodes.join(', ')}. All physical resources must exist before timetable sync.`
      );
    }

    // 3. Execute atomic synchronization inside MongoDB transaction
    const session = await mongoose.startSession();

    try {
      let resultSummary: SyncResult | null = null;

      await session.withTransaction(async () => {
        // Step A: Prepare TimetableEntry documents
        const timetableDocs = entries.map((entry) => {
          const resDoc = resourceMap.get(entry.resourceCode)!;
          return {
            resource: resDoc._id,
            academicTerm,
            courseCode: entry.courseCode,
            courseTitle: entry.courseTitle,
            instructorName: entry.instructorName,
            startAt: new Date(entry.startAt),
            endAt: new Date(entry.endAt),
            timezone: entry.timezone,
            isPublished: true,
            sourceSystemId: entry.sourceSystemId,
            version,
            publicationBatchId,
            metadata: entry.metadata,
          };
        });

        // Step B: Insert all new timetable entries
        await TimetableEntry.insertMany(timetableDocs, { session });

        // Step C: Detect conflicts with existing active reservations for these resources
        const affectedResourceIds = Array.from(new Set(existingResources.map((r) => r._id)));

        // Only query reservations in ACTIVE states (PENDING, CONFIRMED, CHECKED_IN)
        const activeReservations = await Reservation.find({
          resource: { $in: affectedResourceIds },
          status: { $in: ACTIVE_RESERVATION_STATES },
        }).session(session);

        let cancelledCount = 0;

        for (const reservation of activeReservations) {
          // Check if this reservation overlaps any newly published timetable session for the same resource
          const matchingConflict = timetableDocs.find(
            (t) =>
              t.resource.equals(reservation.resource) &&
              intervalsOverlap(reservation.startAt, reservation.endAt, t.startAt, t.endAt)
          );

          if (matchingConflict) {
            // DECISION 2: Academic timetable has absolute precedence!
            // Cancel conflicting ad-hoc reservation with required reason.
            reservation.status = ReservationStatus.CANCELLED;
            reservation.cancelledBy = new Types.ObjectId(adminUserId);
            reservation.cancelledAt = new Date();
            reservation.cancellationReason = 'SUPERSEDED_BY_TIMETABLE_REPUBLICATION';
            reservation.metadata = {
              ...(reservation.metadata || {}),
              supersededByTimetable: true,
              publicationBatchId,
              courseCode: matchingConflict.courseCode,
              timetableStartAt: matchingConflict.startAt,
              timetableEndAt: matchingConflict.endAt,
            };

            await reservation.save({ session });
            cancelledCount++;
          }
        }

        // Step D: Deactivate previous published entries for this term (including absent entries)
        const deactivation = await TimetableEntry.updateMany(
          {
            academicTerm,
            publicationBatchId: { $ne: publicationBatchId },
            isPublished: true,
          },
          {
            $set: { isPublished: false },
          },
          { session }
        );

        resultSummary = {
          academicTerm,
          version,
          publicationBatchId,
          insertedCount: timetableDocs.length,
          activeCount: timetableDocs.length,
          supersededEntriesCount: deactivation.modifiedCount,
          cancelledReservationsCount: cancelledCount,
          conflictsDetected: cancelledCount,
        };
      });

      return resultSummary!;
    } finally {
      await session.endSession();
    }
  }

  /**
   * Retrieves active published timetable entries matching flexible filters.
   */
  public static async listTimetableEntries(query: ListTimetablesQueryInput): Promise<ITimetableEntry[]> {
    const filter: Record<string, unknown> = {
      isPublished: true,
    };

    if (query.academicTerm) {
      filter.academicTerm = query.academicTerm;
    }

    if (query.resourceId) {
      filter.resource = new Types.ObjectId(query.resourceId);
    } else if (query.resourceCode) {
      const resource = await Resource.findOne({ code: query.resourceCode.toUpperCase() }).lean();
      if (resource) {
        filter.resource = resource._id;
      } else {
        return [];
      }
    }

    if (query.startAt || query.endAt) {
      if (query.startAt && query.endAt) {
        const s = new Date(query.startAt);
        const e = new Date(query.endAt);
        filter.startAt = { $lt: e };
        filter.endAt = { $gt: s };
      } else if (query.startAt) {
        filter.endAt = { $gt: new Date(query.startAt) };
      } else if (query.endAt) {
        filter.startAt = { $lt: new Date(query.endAt) };
      }
    }

    const entries = await TimetableEntry.find(filter)
      .populate('resource', 'name code location status capacity')
      .sort({ startAt: 1 })
      .lean();

    return entries as unknown as ITimetableEntry[];
  }

  /**
   * Retrieves audit records of reservations cancelled due to timetable supersession.
   */
  public static async getConflictAudit(query: ConflictAuditQueryInput): Promise<any[]> {
    const filter: Record<string, unknown> = {
      cancellationReason: 'SUPERSEDED_BY_TIMETABLE_REPUBLICATION',
    };

    if (query.resourceId) {
      filter.resource = new Types.ObjectId(query.resourceId);
    }

    const cancelledBookings = await Reservation.find(filter)
      .populate('resource', 'name code location')
      .populate('user', 'firstName lastName email department roles')
      .sort({ cancelledAt: -1 })
      .lean();

    return cancelledBookings;
  }
}
