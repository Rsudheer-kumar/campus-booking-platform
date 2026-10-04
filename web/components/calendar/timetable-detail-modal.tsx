"use client";

import { useState, useEffect } from "react";
import { Modal } from "@/components/ui/modal";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  GraduationCap,
  Building2,
  Calendar,
  Clock,
  User,
  ShieldCheck,
  Lock,
  Timer,
  Info,
} from "lucide-react";
import type { TimetableEntry, Resource } from "@/lib/api";

interface TimetableDetailModalProps {
  open: boolean;
  onClose: () => void;
  entry: TimetableEntry | null;
  resource?: Resource | null;
}

type ClassState = "UPCOMING" | "IN_PROGRESS" | "COMPLETED";

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

function calculateClassState(startAt: string, endAt: string): {
  state: ClassState;
  countdownText: string;
} {
  const now = Date.now();
  const start = new Date(startAt).getTime();
  const end = new Date(endAt).getTime();

  if (now < start) {
    return {
      state: "UPCOMING",
      countdownText: `Starts in ${formatDuration(start - now)}`,
    };
  } else if (now < end) {
    return {
      state: "IN_PROGRESS",
      countdownText: `Ends in ${formatDuration(end - now)}`,
    };
  } else {
    return {
      state: "COMPLETED",
      countdownText: "Ended",
    };
  }
}

export function TimetableDetailModal({
  open,
  onClose,
  entry,
  resource,
}: TimetableDetailModalProps) {
  const [countdownInfo, setCountdownInfo] = useState<{
    state: ClassState;
    countdownText: string;
  }>({
    state: "UPCOMING",
    countdownText: "Loading...",
  });

  // Second-precision authoritative countdown calculation, mounted only when open
  useEffect(() => {
    if (!open || !entry) return;

    const updateCountdown = () => {
      setCountdownInfo(calculateClassState(entry.startAt, entry.endAt));
    };

    // Calculate immediately on open
    updateCountdown();

    const intervalId = setInterval(updateCountdown, 1000);

    return () => {
      clearInterval(intervalId);
    };
  }, [open, entry]);

  if (!entry) return null;

  // Resolve resource metadata from entry.resource or parent resource
  const resObj =
    typeof entry.resource === "object" && entry.resource !== null
      ? (entry.resource as Resource)
      : resource;

  const resourceName = resObj?.name || "Campus Facility";
  const resourceCode = resObj?.code || "FACILITY";
  const buildingName = resObj?.location?.building || "Main Academic Campus";
  const roomNumber =
    resObj?.location?.roomNumber || resObj?.code || "Curriculum Hall";

  const startDate = new Date(entry.startAt);
  const endDate = new Date(entry.endAt);

  const formattedDate = new Intl.DateTimeFormat("en-US", {
    weekday: "long",
    year: "numeric",
    month: "short",
    day: "numeric",
    timeZone: entry.timezone || "UTC",
  }).format(startDate);

  const startTimeStr = new Intl.DateTimeFormat("en-US", {
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
    timeZone: entry.timezone || "UTC",
  }).format(startDate);

  const endTimeStr = new Intl.DateTimeFormat("en-US", {
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
    timeZone: entry.timezone || "UTC",
  }).format(endDate);

  const stateBadgeVariant =
    countdownInfo.state === "IN_PROGRESS"
      ? "occupied"
      : countdownInfo.state === "UPCOMING"
      ? "available"
      : "neutral";

  const stateLabel =
    countdownInfo.state === "IN_PROGRESS"
      ? "In Progress"
      : countdownInfo.state === "UPCOMING"
      ? "Upcoming"
      : "Completed";

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={`${entry.courseCode} — ${entry.courseTitle}`}
      description="Authoritative institutional academic session (hard availability constraint)."
      size="lg"
    >
      <div className="space-y-5">
        {/* State & Live Countdown Banner */}
        <div
          className={`p-4 rounded-[var(--radius-md)] border flex flex-col sm:flex-row sm:items-center justify-between gap-3 ${
            countdownInfo.state === "IN_PROGRESS"
              ? "bg-primary/10 border-primary/40 text-foreground"
              : countdownInfo.state === "UPCOMING"
              ? "bg-amber-500/10 border-amber-500/30 text-foreground"
              : "bg-surface-2/60 border-border text-muted"
          }`}
        >
          <div className="flex items-center gap-2.5">
            <Badge variant={stateBadgeVariant} dot={countdownInfo.state === "IN_PROGRESS"}>
              {stateLabel}
            </Badge>
            <span className="text-xs font-semibold tracking-wide uppercase opacity-80">
              Academic Term: {entry.academicTerm}
            </span>
          </div>

          <div className="flex items-center gap-2 font-mono text-sm font-bold">
            <Timer className="h-4 w-4 text-primary shrink-0" />
            <span
              className={
                countdownInfo.state === "IN_PROGRESS"
                  ? "text-primary-bright font-semibold"
                  : countdownInfo.state === "UPCOMING"
                  ? "text-amber-400 font-semibold"
                  : "text-muted font-normal"
              }
            >
              {countdownInfo.countdownText}
            </span>
          </div>
        </div>

        {/* Academic Details Grid */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          {/* Course & Instructor */}
          <div className="p-3.5 rounded-[var(--radius-md)] bg-surface-2/40 border border-border/70 space-y-3">
            <div className="flex items-center gap-2 text-xs font-semibold text-primary-bright uppercase tracking-wider">
              <GraduationCap className="h-4 w-4 text-primary" />
              <span>Curriculum Details</span>
            </div>

            <div className="space-y-1.5 text-xs">
              <div>
                <span className="text-muted block text-[11px]">Course Code:</span>
                <span className="font-mono font-bold text-foreground text-sm">
                  {entry.courseCode}
                </span>
              </div>
              <div>
                <span className="text-muted block text-[11px]">Course Title:</span>
                <span className="font-medium text-foreground">
                  {entry.courseTitle}
                </span>
              </div>
              <div className="flex items-center gap-1.5 pt-1 text-muted">
                <User className="h-3.5 w-3.5 text-muted" />
                <span>
                  Instructor:{" "}
                  <strong className="text-foreground font-medium">
                    {entry.instructorName || "Faculty of Instruction"}
                  </strong>
                </span>
              </div>
            </div>
          </div>

          {/* Location & Facility */}
          <div className="p-3.5 rounded-[var(--radius-md)] bg-surface-2/40 border border-border/70 space-y-3">
            <div className="flex items-center gap-2 text-xs font-semibold text-primary-bright uppercase tracking-wider">
              <Building2 className="h-4 w-4 text-primary" />
              <span>Campus Facility</span>
            </div>

            <div className="space-y-1.5 text-xs">
              <div>
                <span className="text-muted block text-[11px]">Resource / Room Name:</span>
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
                <span className="text-muted block text-[11px]">Building / Block:</span>
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
            <span>Session Schedule & Timezone</span>
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
                <span className="text-muted block text-[11px]">Time Interval:</span>
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
                  {entry.timezone || "UTC"}
                </span>
              </div>
            </div>
          </div>
        </div>

        {/* Institutional Policy Notice */}
        <div className="p-3 rounded-[var(--radius-md)] bg-surface-2/20 border border-border/50 text-[11px] text-muted flex items-start gap-2.5">
          <Info className="h-4 w-4 text-primary shrink-0 mt-0.5" />
          <p className="leading-relaxed">
            Institutional Timetable Constraint: This facility is reserved by academic administration.
            In accordance with Phase 3.1 institutional governance rules, academic curriculum sessions
            take absolute precedence and cannot be overwritten or reserved by ad-hoc bookings.
          </p>
        </div>

        {/* Footer Actions */}
        <div className="flex justify-end pt-2">
          <Button variant="secondary" onClick={onClose} size="sm">
            Close Details
          </Button>
        </div>
      </div>
    </Modal>
  );
}
