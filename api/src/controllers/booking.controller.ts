/**
 * CampusFlow API - Booking & Reservation Controller
 * Handles HTTP transport, input mapping, error propagation, and response serialization
 * for all booking engine capabilities.
 */

import type { Request, Response, NextFunction } from 'express';
import { ReservationService } from '../services/reservation.service';
import { AvailabilityService } from '../services/availability.service';
import { sendSuccess } from '../utils/response';
import type { ReservationStatusType } from '../models';

export async function createBooking(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const reservation = await ReservationService.createReservation(req.body);
    sendSuccess(res, reservation, 201);
  } catch (error) {
    next(error);
  }
}

export async function getBookingById(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const id = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
    const reservation = await ReservationService.getReservationById(id);
    sendSuccess(res, reservation, 200);
  } catch (error) {
    next(error);
  }
}

export async function listBookings(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const { resourceId, userId, status, startAt, endAt, page, limit } = req.query;
    const result = await ReservationService.listReservations({
      resourceId: resourceId as string,
      userId: userId as string,
      status: status as ReservationStatusType | ReservationStatusType[],
      startAt: startAt as string,
      endAt: endAt as string,
      page: page ? Number(page) : undefined,
      limit: limit ? Number(limit) : undefined,
    });
    sendSuccess(res, result, 200);
  } catch (error) {
    next(error);
  }
}

export async function cancelBooking(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const id = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
    const reservation = await ReservationService.cancelReservation(
      id,
      req.body.userId,
      req.body.reason
    );
    sendSuccess(res, reservation, 200);
  } catch (error) {
    next(error);
  }
}

export async function transitionBookingStatus(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const id = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
    const reservation = await ReservationService.transitionStatus({
      reservationId: id,
      targetStatus: req.body.status,
      actorId: req.body.userId,
      reason: req.body.reason,
    });
    sendSuccess(res, reservation, 200);
  } catch (error) {
    next(error);
  }
}

export async function checkAvailability(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const { resourceId, startAt, endAt, excludeReservationId } = req.query;
    const result = await AvailabilityService.checkAvailability({
      resourceId: resourceId as string,
      startAt: new Date(startAt as string),
      endAt: new Date(endAt as string),
      excludeReservationId: excludeReservationId as string,
    });
    sendSuccess(res, result, 200);
  } catch (error) {
    next(error);
  }
}

export async function calculateSlots(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const { resourceId, date, slotDurationMinutes } = req.query;
    const slots = await AvailabilityService.calculateSlots({
      resourceId: resourceId as string,
      date: date as string,
      slotDurationMinutes: slotDurationMinutes ? Number(slotDurationMinutes) : undefined,
    });
    sendSuccess(res, { slots }, 200);
  } catch (error) {
    next(error);
  }
}
