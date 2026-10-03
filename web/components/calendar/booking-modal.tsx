"use client";

import { useState, useEffect, type FormEvent } from "react";
import { Modal } from "@/components/ui/modal";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { AlertCircle, Clock, Calendar, CheckCircle2, Building2, ShieldCheck } from "lucide-react";
import { api, ApiError, type Resource, type Reservation } from "@/lib/api";

interface BookingModalProps {
  open: boolean;
  onClose: () => void;
  resource: Resource | null;
  initialStartAt?: string;
  initialEndAt?: string;
  onSuccess: (booking: Reservation) => void;
}

export function BookingModal({
  open,
  onClose,
  resource,
  initialStartAt,
  initialEndAt,
  onSuccess,
}: BookingModalProps) {
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [date, setDate] = useState("");
  const [startTime, setStartTime] = useState("09:00");
  const [endTime, setEndTime] = useState("10:00");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [conflictError, setConflictError] = useState<{
    code: string;
    message: string;
    isTimetable: boolean;
  } | null>(null);

  // Initialize form when opened or slot selected
  useEffect(() => {
    if (!open) {
      setConflictError(null);
      return;
    }

    if (initialStartAt && initialEndAt) {
      const s = new Date(initialStartAt);
      const e = new Date(initialEndAt);

      const yyyy = s.getUTCFullYear();
      const mm = String(s.getUTCMonth() + 1).padStart(2, "0");
      const dd = String(s.getUTCDate()).padStart(2, "0");
      setDate(`${yyyy}-${mm}-${dd}`);

      const sH = String(s.getUTCHours()).padStart(2, "0");
      const sM = String(s.getUTCMinutes()).padStart(2, "0");
      setStartTime(`${sH}:${sM}`);

      const eH = String(e.getUTCHours()).padStart(2, "0");
      const eM = String(e.getUTCMinutes()).padStart(2, "0");
      setEndTime(`${eH}:${eM}`);
    } else {
      // Default to today
      const now = new Date();
      const yyyy = now.getUTCFullYear();
      const mm = String(now.getUTCMonth() + 1).padStart(2, "0");
      const dd = String(now.getUTCDate()).padStart(2, "0");
      setDate(`${yyyy}-${mm}-${dd}`);
      setStartTime("09:00");
      setEndTime("10:00");
    }

    setTitle("");
    setDescription("");
    setConflictError(null);
  }, [open, initialStartAt, initialEndAt]);

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (!resource) return;

    setConflictError(null);
    setIsSubmitting(true);

    try {
      const [sH, sM] = startTime.split(":").map(Number);
      const [eH, eM] = endTime.split(":").map(Number);

      const [y, m, d] = date.split("-").map(Number);
      const startAtDate = new Date(Date.UTC(y, m - 1, d, sH, sM, 0, 0));
      const endAtDate = new Date(Date.UTC(y, m - 1, d, eH, eM, 0, 0));

      if (startAtDate >= endAtDate) {
        setConflictError({
          code: "INVALID_INTERVAL",
          message: "End time must be strictly later than start time.",
          isTimetable: false,
        });
        setIsSubmitting(false);
        return;
      }

      const res = await api.bookings.create({
        resourceId: resource._id,
        title: title.trim(),
        description: description.trim() || undefined,
        startAt: startAtDate.toISOString(),
        endAt: endAtDate.toISOString(),
        timezone: "America/New_York",
      });

      onSuccess(res.booking);
      onClose();
    } catch (err) {
      if (err instanceof ApiError) {
        const isTimetableConflict =
          err.code === "TIMETABLE_CONFLICT" ||
          err.message.includes("TIMETABLE_CONFLICT") ||
          err.message.toLowerCase().includes("academic timetable");

        setConflictError({
          code: err.code,
          message: isTimetableConflict
            ? "Academic Timetable Conflict: This facility is reserved for an authoritative institutional curriculum session during this period. Academic courses take precedence over ad-hoc user reservations."
            : err.message,
          isTimetable: isTimetableConflict,
        });
      } else {
        setConflictError({
          code: "UNKNOWN_ERROR",
          message: err instanceof Error ? err.message : "Failed to create booking",
          isTimetable: false,
        });
      }
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Create Resource Reservation"
      description={
        resource
          ? `Booking ${resource.name} (${resource.code}) in ${resource.location?.building}`
          : "Reserve campus facility"
      }
      size="lg"
    >
      <form onSubmit={handleSubmit} className="flex flex-col">
        <div className="space-y-4">
          {/* Timetable or General Conflict Error Banner */}
          {conflictError && (
            <div
              className={`p-3.5 rounded-[var(--radius-md)] border text-sm flex items-start gap-3 animate-fade-in ${
                conflictError.isTimetable
                  ? "bg-danger/10 border-danger/40 text-danger"
                  : "bg-warning/10 border-warning/40 text-warning"
              }`}
            >
              <AlertCircle className="h-5 w-5 shrink-0 mt-0.5" />
              <div className="space-y-1">
                <p className="font-semibold leading-tight">
                  {conflictError.isTimetable
                    ? "Institutional Timetable Conflict (HTTP 409)"
                    : "Reservation Conflict"}
                </p>
                <p className="text-xs leading-relaxed opacity-90">{conflictError.message}</p>
              </div>
            </div>
          )}

          {/* Resource Badge Info */}
          {resource && (
            <div className="flex items-center gap-2 p-2.5 rounded-[var(--radius-sm)] bg-surface-2/60 border border-border/50 text-xs text-muted">
              <Building2 className="h-4 w-4 text-primary" />
              <span className="font-medium text-foreground">{resource.name}</span>
              <span>•</span>
              <span>Capacity: {resource.capacity} seats</span>
              <span>•</span>
              <span>Room {resource.location?.roomNumber || resource.code}</span>
            </div>
          )}

          {/* Title */}
          <Input
            label="Reservation Title"
            required
            placeholder="e.g. CS Study Group, Research Project Review"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
          />

          {/* Date & Time Selectors */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <Input
              label="Date"
              type="date"
              required
              value={date}
              onChange={(e) => setDate(e.target.value)}
            />

            <Input
              label="Start Time (UTC)"
              type="time"
              required
              step="1800"
              value={startTime}
              onChange={(e) => setStartTime(e.target.value)}
            />

            <Input
              label="End Time (UTC)"
              type="time"
              required
              step="1800"
              value={endTime}
              onChange={(e) => setEndTime(e.target.value)}
            />
          </div>

          {/* Description */}
          <Textarea
            label="Purpose / Notes (Optional)"
            rows={2}
            placeholder="Describe the activity, equipment requirements, or attendee details..."
            value={description}
            onChange={(e) => setDescription(e.target.value)}
          />

          <div className="space-y-1.5 pt-0.5">
            <div className="text-[11px] text-muted flex items-center gap-1.5">
              <Clock className="h-3.5 w-3.5 text-primary/70 shrink-0" />
              <span>
                Institutional timetable sessions are authoritative. Bookings conflicting with published
                courses will be automatically rejected.
              </span>
            </div>
            <div className="text-[11px] text-muted flex items-center gap-1.5">
              <ShieldCheck className="h-3.5 w-3.5 text-success/70 shrink-0" />
              <span>
                Approval Policy &amp; Slot Hold: If approval is required, your reservation enters PENDING state while holding this slot against competing bookings.
              </span>
            </div>
          </div>
        </div>

        {/* Modal Actions - Pinned and clearly visible */}
        <div className="sticky bottom-0 z-10 flex items-center justify-end gap-3 pt-4 mt-4 border-t border-border/60 bg-surface-elevated/95 backdrop-blur-xs">
          <Button type="button" variant="ghost" onClick={onClose} disabled={isSubmitting}>
            Cancel
          </Button>
          <Button
            type="submit"
            variant="primary"
            disabled={isSubmitting || !title.trim() || !resource}
          >
            {isSubmitting ? "Verifying & Reserving..." : "Confirm Reservation"}
          </Button>
        </div>
      </form>
    </Modal>
  );
}
