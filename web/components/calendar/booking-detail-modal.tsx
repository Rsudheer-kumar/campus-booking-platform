"use client";

import { useState, useEffect } from "react";
import { Modal } from "@/components/ui/modal";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Building2,
  Calendar,
  Clock,
  User,
  ShieldAlert,
  ShieldCheck,
  Timer,
  AlertCircle,
  QrCode,
  LogOut,
} from "lucide-react";
import type { Reservation, Resource, User as UserType } from "@/lib/api";

interface BookingDetailModalProps {
  open: boolean;
  onClose: () => void;
  booking: Reservation | null;
  resource?: Resource | null;
  onOpenCheckIn?: (booking: Reservation) => void;
}

type BookingTimeState = "UPCOMING" | "IN_PROGRESS" | "COMPLETED";

function formatDuration(diffMs: number): string {
  if (diffMs <= 0) return "00:00:00";
  const totalSec = Math.floor(diffMs / 1000);
  const hours = Math.floor(totalSec / 3600);
  const minutes = Math.floor((totalSec % 3600) / 60);
  const seconds = totalSec % 60;

  if (hours >= 24) {
    const days = Math.floor(hours / 24);
    const remHours = hours % 24;
    return `${days}d ${String(remHours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
  }

  return `${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
}

function calculateBookingTimeState(startAt: string, endAt: string): {
  timeState: BookingTimeState;
  countdownText: string;
} {
  const now = Date.now();
  const start = new Date(startAt).getTime();
  const end = new Date(endAt).getTime();

  if (now < start) {
    return {
      timeState: "UPCOMING",
      countdownText: `Starts in ${formatDuration(start - now)}`,
    };
  } else if (now < end) {
    return {
      timeState: "IN_PROGRESS",
      countdownText: `Ends in ${formatDuration(end - now)}`,
    };
  } else {
    return {
      timeState: "COMPLETED",
      countdownText: "Ended",
    };
  }
}

export function BookingDetailModal({
  open,
  onClose,
  booking,
  resource,
  onOpenCheckIn,
}: BookingDetailModalProps) {
  const [countdownInfo, setCountdownInfo] = useState<{
    timeState: BookingTimeState;
    countdownText: string;
  }>({
    timeState: "UPCOMING",
    countdownText: "Loading...",
  });

  // Second-precision authoritative countdown calculation, mounted only when open
  useEffect(() => {
    if (!open || !booking) return;

    const updateCountdown = () => {
      setCountdownInfo(calculateBookingTimeState(booking.startAt, booking.endAt));
    };

    updateCountdown();

    const intervalId = setInterval(updateCountdown, 1000);

    return () => {
      clearInterval(intervalId);
    };
  }, [open, booking]);

  if (!booking) return null;

  // Resolve resource metadata
  const resObj =
    typeof booking.resource === "object" && booking.resource !== null
      ? (booking.resource as Resource)
      : resource;

  const resourceName = resObj?.name || "Campus Facility";
  const resourceCode = resObj?.code || "FACILITY";
  const buildingName = resObj?.location?.building || "Main Campus";
  const roomNumber =
    resObj?.location?.roomNumber || resObj?.code || "Standard Room";

  // Resolve user / requester metadata
  const userObj =
    typeof booking.user === "object" && booking.user !== null
      ? (booking.user as UserType)
      : null;

  const requesterName = userObj
    ? userObj.name || userObj.email
    : "Authorized User";
  const requesterEmail = userObj?.email || "";
  const requesterDept = userObj?.department || "";

  const startDate = new Date(booking.startAt);
  const endDate = new Date(booking.endAt);

  const formattedDate = new Intl.DateTimeFormat("en-US", {
    weekday: "long",
    year: "numeric",
    month: "short",
    day: "numeric",
    timeZone: booking.timezone || "UTC",
  }).format(startDate);

  const startTimeStr = new Intl.DateTimeFormat("en-US", {
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
    timeZone: booking.timezone || "UTC",
  }).format(startDate);

  const endTimeStr = new Intl.DateTimeFormat("en-US", {
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
    timeZone: booking.timezone || "UTC",
  }).format(endDate);

  const statusVariant =
    booking.status === "CONFIRMED" || booking.status === "CHECKED_IN"
      ? "available"
      : booking.status === "PENDING"
      ? "occupied"
      : booking.status === "CANCELLED" || booking.status === "REJECTED" || booking.status === "NO_SHOW"
      ? "danger"
      : "neutral";

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={booking.title || "Facility Reservation"}
      description="Existing confirmed or pending resource reservation."
      size="lg"
    >
      <div className="space-y-5">
        {/* Status & Live Countdown Banner */}
        <div
          className={`p-4 rounded-[var(--radius-md)] border flex flex-col sm:flex-row sm:items-center justify-between gap-3 ${
            countdownInfo.timeState === "IN_PROGRESS"
              ? "bg-emerald-500/10 border-emerald-500/30 text-foreground"
              : countdownInfo.timeState === "UPCOMING"
              ? "bg-primary/10 border-primary/30 text-foreground"
              : "bg-surface-2/60 border-border text-muted"
          }`}
        >
          <div className="flex items-center gap-2.5">
            <Badge variant={statusVariant} dot={countdownInfo.timeState === "IN_PROGRESS"}>
              {booking.status}
            </Badge>
            <span className="text-xs font-semibold tracking-wide uppercase opacity-80">
              {countdownInfo.timeState === "IN_PROGRESS"
                ? "Active Now"
                : countdownInfo.timeState === "UPCOMING"
                ? "Upcoming Session"
                : "Completed Session"}
            </span>
          </div>

          <div className="flex items-center gap-2 font-mono text-sm font-bold">
            <Timer className="h-4 w-4 text-primary shrink-0" />
            <span
              className={
                countdownInfo.timeState === "IN_PROGRESS"
                  ? "text-emerald-400 font-semibold"
                  : countdownInfo.timeState === "UPCOMING"
                  ? "text-primary-bright font-semibold"
                  : "text-muted font-normal"
              }
            >
              {countdownInfo.countdownText}
            </span>
          </div>
        </div>

        {/* Details Grid */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          {/* Reservation & Requester */}
          <div className="p-3.5 rounded-[var(--radius-md)] bg-surface-2/40 border border-border/70 space-y-3">
            <div className="flex items-center gap-2 text-xs font-semibold text-primary-bright uppercase tracking-wider">
              <User className="h-4 w-4 text-primary" />
              <span>Requester & Purpose</span>
            </div>

            <div className="space-y-1.5 text-xs">
              <div>
                <span className="text-muted block text-[11px]">Title:</span>
                <span className="font-semibold text-foreground text-sm">
                  {booking.title}
                </span>
              </div>
              {booking.description && (
                <div>
                  <span className="text-muted block text-[11px]">Description:</span>
                  <p className="text-foreground/90 text-xs italic">
                    &ldquo;{booking.description}&rdquo;
                  </p>
                </div>
              )}
              <div className="pt-1">
                <span className="text-muted block text-[11px]">Reserved By:</span>
                <span className="font-medium text-foreground">
                  {requesterName}
                </span>
                {requesterEmail && (
                  <span className="block text-muted text-[11px]">
                    {requesterEmail}
                  </span>
                )}
                {requesterDept && (
                  <span className="block text-primary text-[11px]">
                    Dept: {requesterDept}
                  </span>
                )}
              </div>
            </div>
          </div>

          {/* Campus Facility Details */}
          <div className="p-3.5 rounded-[var(--radius-md)] bg-surface-2/40 border border-border/70 space-y-3">
            <div className="flex items-center gap-2 text-xs font-semibold text-primary-bright uppercase tracking-wider">
              <Building2 className="h-4 w-4 text-primary" />
              <span>Reserved Facility</span>
            </div>

            <div className="space-y-1.5 text-xs">
              <div>
                <span className="text-muted block text-[11px]">Resource Name:</span>
                <span className="font-semibold text-foreground">
                  {resourceName}
                </span>
              </div>
              <div className="flex items-center gap-4">
                <div>
                  <span className="text-muted block text-[11px]">Room Number:</span>
                  <span className="font-mono text-foreground font-medium">
                    {roomNumber}
                  </span>
                </div>
                <div>
                  <span className="text-muted block text-[11px]">Resource Code:</span>
                  <span className="font-mono text-primary font-medium">
                    {resourceCode}
                  </span>
                </div>
              </div>
              <div>
                <span className="text-muted block text-[11px]">Building / Location:</span>
                <span className="text-foreground font-medium">
                  {buildingName}
                </span>
              </div>
            </div>
          </div>
        </div>

        {/* Schedule & Timezone Information */}
        <div className="p-3.5 rounded-[var(--radius-md)] bg-surface-2/40 border border-border/70 space-y-2">
          <div className="flex items-center gap-2 text-xs font-semibold text-primary-bright uppercase tracking-wider">
            <Clock className="h-4 w-4 text-primary" />
            <span>Time & Timezone Details</span>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-xs pt-1">
            <div className="flex items-start gap-2">
              <Calendar className="h-4 w-4 text-muted mt-0.5 shrink-0" />
              <div>
                <span className="text-muted block text-[11px]">Date:</span>
                <span className="text-foreground font-medium">{formattedDate}</span>
              </div>
            </div>

            <div className="flex items-start gap-2">
              <Clock className="h-4 w-4 text-muted mt-0.5 shrink-0" />
              <div>
                <span className="text-muted block text-[11px]">Time Window:</span>
                <span className="font-mono font-semibold text-foreground">
                  {startTimeStr} – {endTimeStr}
                </span>
              </div>
            </div>

            <div className="flex items-start gap-2">
              <ShieldCheck className="h-4 w-4 text-primary mt-0.5 shrink-0" />
              <div>
                <span className="text-muted block text-[11px]">Timezone (Authoritative):</span>
                <span className="font-mono text-foreground font-medium">
                  {booking.timezone || "UTC"}
                </span>
              </div>
            </div>
          </div>
        </div>

        {/* Phase 3.2 Approval State Details if applicable */}
        {booking.approvalChain && booking.approvalChain.length > 0 && (
          <div className="p-3.5 rounded-[var(--radius-md)] bg-surface-2/30 border border-border/70 space-y-2">
            <div className="flex items-center gap-2 text-xs font-semibold text-primary-bright uppercase tracking-wider">
              <ShieldAlert className="h-4 w-4 text-warning" />
              <span>Phase 3.2 Multi-Step Approval State</span>
            </div>

            <div className="space-y-1.5 text-xs">
              <div className="flex items-center justify-between">
                <span className="text-muted">Current Approver Role:</span>
                <span className="font-mono font-semibold text-foreground">
                  {booking.currentApproverRole || "None (Fully Actioned)"}
                </span>
              </div>
              <div className="flex flex-wrap gap-2 pt-1">
                {booking.approvalChain.map((step) => (
                  <div
                    key={step.stepOrder}
                    className="px-2.5 py-1 rounded bg-surface border border-border/60 text-[11px] flex items-center gap-1.5"
                  >
                    <span className="text-muted font-mono">Step {step.stepOrder}:</span>
                    <span className="font-medium text-foreground">{step.approverRole}</span>
                    <Badge
                      variant={
                        step.status === "APPROVED"
                          ? "available"
                          : step.status === "REJECTED"
                          ? "danger"
                          : "occupied"
                      }
                      className="text-[9px] py-0 px-1"
                    >
                      {step.status}
                    </Badge>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* Cancellation details if cancelled */}
        {booking.cancellationReason && (
          <div className="p-3 rounded-[var(--radius-md)] bg-danger/10 border border-danger/30 text-xs text-danger flex items-start gap-2">
            <AlertCircle className="h-4 w-4 shrink-0 mt-0.5" />
            <div>
              <span className="font-semibold block">Cancellation Reason:</span>
              <span>{booking.cancellationReason}</span>
            </div>
          </div>
        )}

        {/* Phase 3.3 No-Show details & pardon badge */}
        {booking.status === "NO_SHOW" && (
          <div className="p-3.5 rounded-[var(--radius-md)] bg-danger/10 border border-danger/30 text-xs space-y-2">
            <div className="flex items-center gap-2 font-semibold text-danger">
              <AlertCircle className="h-4 w-4 shrink-0" />
              <span>Auto-Released Due to No-Show</span>
            </div>
            <p className="text-foreground/80">
              This reservation was not checked in within the allowed grace period and was auto-released as NO_SHOW.
            </p>
            {booking.noShowPardoned && (
              <div className="p-2.5 rounded bg-surface border border-border text-foreground space-y-1 mt-1">
                <span className="font-semibold text-emerald-400 block">Administrative Strike Pardon Granted</span>
                {booking.noShowPardonReason && (
                  <p className="text-[11px] text-muted">
                    Reason: {booking.noShowPardonReason}
                  </p>
                )}
              </div>
            )}
          </div>
        )}

        {/* Footer */}
        <div className="flex items-center justify-between pt-2">
          <div>
            {onOpenCheckIn && booking.status === "CONFIRMED" && (
              <Button
                variant="primary"
                size="sm"
                icon={<QrCode className="h-4 w-4" />}
                onClick={() => {
                  onClose();
                  onOpenCheckIn(booking);
                }}
              >
                Check In (QR)
              </Button>
            )}
            {onOpenCheckIn && booking.status === "CHECKED_IN" && (
              <Button
                variant="secondary"
                size="sm"
                icon={<LogOut className="h-4 w-4" />}
                onClick={() => {
                  onClose();
                  onOpenCheckIn(booking);
                }}
              >
                Check Out Early
              </Button>
            )}
          </div>

          <Button variant="secondary" onClick={onClose} size="sm">
            Close
          </Button>
        </div>
      </div>
    </Modal>
  );
}
