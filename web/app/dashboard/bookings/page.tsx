"use client";

import { useState, useEffect, useCallback, useMemo } from "react";
import Link from "next/link";
import {
  CalendarCheck,
  Plus,
  Clock,
  Building2,
  Calendar,
  XCircle,
  AlertCircle,
  CheckCircle2,
  ArrowRight,
  Filter,
} from "lucide-react";

import { PageContainer, PageHeader } from "@/components/layout";
import { Card, Badge, Button, Modal, Textarea, Skeleton, EmptyState } from "@/components/ui";
import { api, type Reservation, type Resource } from "@/lib/api";
import { cn } from "@/lib/utils";

export default function BookingsPage() {
  const [bookings, setBookings] = useState<Reservation[]>([]);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [filterTab, setFilterTab] = useState<"ALL" | "ACTIVE" | "CANCELLED">("ALL");

  // Cancellation Modal state
  const [cancelModalBooking, setCancelModalBooking] = useState<Reservation | null>(null);
  const [cancelReason, setCancelReason] = useState<string>("");
  const [isCancelling, setIsCancelling] = useState<boolean>(false);
  const [cancelError, setCancelError] = useState<string | null>(null);

  const fetchBookings = useCallback(async () => {
    setIsLoading(true);
    try {
      const res = await api.bookings.list({ limit: 50 });
      setBookings(res.bookings || []);
    } catch (err) {
      console.error("Failed to fetch bookings", err);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchBookings();
  }, [fetchBookings]);

  // Execute cancellation
  const handleConfirmCancel = async () => {
    if (!cancelModalBooking) return;

    setIsCancelling(true);
    setCancelError(null);

    try {
      await api.bookings.cancel(cancelModalBooking._id, cancelReason.trim() || undefined);
      setCancelModalBooking(null);
      setCancelReason("");
      fetchBookings();
    } catch (err) {
      setCancelError(err instanceof Error ? err.message : "Failed to cancel booking");
    } finally {
      setIsCancelling(false);
    }
  };

  // Filter bookings based on active tab
  const filteredBookings = useMemo(() => {
    if (filterTab === "ACTIVE") {
      return bookings.filter(
        (b) => b.status === "CONFIRMED" || b.status === "PENDING" || b.status === "CHECKED_IN"
      );
    }
    if (filterTab === "CANCELLED") {
      return bookings.filter((b) => b.status === "CANCELLED" || b.status === "REJECTED");
    }
    return bookings;
  }, [bookings, filterTab]);

  return (
    <div className="min-h-full py-8 grid-background">
      <PageContainer className="space-y-6">
        <PageHeader
          title="My Reservations & Bookings"
          description="View, manage, and inspect your campus facility reservations and booking history."
          action={
            <Link href="/dashboard/calendar">
              <Button size="sm" icon={<Plus className="h-4 w-4" />}>
                Reserve Facility
              </Button>
            </Link>
          }
        />

        {/* Tab Filters */}
        <div className="flex items-center gap-2 border-b border-border/60 pb-3">
          <button
            type="button"
            onClick={() => setFilterTab("ALL")}
            className={cn(
              "px-3.5 py-1.5 rounded-full text-xs font-medium transition-colors",
              filterTab === "ALL"
                ? "bg-primary text-white"
                : "bg-surface text-muted hover:text-foreground border border-border"
            )}
          >
            All Reservations ({bookings.length})
          </button>
          <button
            type="button"
            onClick={() => setFilterTab("ACTIVE")}
            className={cn(
              "px-3.5 py-1.5 rounded-full text-xs font-medium transition-colors",
              filterTab === "ACTIVE"
                ? "bg-primary text-white"
                : "bg-surface text-muted hover:text-foreground border border-border"
            )}
          >
            Active &amp; Pending (
            {
              bookings.filter(
                (b) => b.status === "CONFIRMED" || b.status === "PENDING" || b.status === "CHECKED_IN"
              ).length
            }
            )
          </button>
          <button
            type="button"
            onClick={() => setFilterTab("CANCELLED")}
            className={cn(
              "px-3.5 py-1.5 rounded-full text-xs font-medium transition-colors",
              filterTab === "CANCELLED"
                ? "bg-primary text-white"
                : "bg-surface text-muted hover:text-foreground border border-border"
            )}
          >
            Cancelled &amp; Rejected ({bookings.filter((b) => b.status === "CANCELLED" || b.status === "REJECTED").length})
          </button>
        </div>

        {/* Bookings List */}
        {isLoading ? (
          <div className="space-y-4">
            {Array.from({ length: 3 }).map((_, i) => (
              <Card key={i} className="p-5 space-y-3">
                <Skeleton className="h-6 w-1/3" />
                <Skeleton className="h-4 w-1/4" />
                <Skeleton className="h-10 w-full" />
              </Card>
            ))}
          </div>
        ) : filteredBookings.length === 0 ? (
          <Card className="min-h-[350px] flex items-center justify-center">
            <EmptyState
              icon={<CalendarCheck className="h-8 w-8 text-primary" />}
              title="No Reservations Found"
              description="You have no active or historical bookings in this category. Browse available campus facilities to schedule a session."
              action={
                <Link href="/dashboard/calendar">
                  <Button size="sm">Explore Campus Calendar</Button>
                </Link>
              }
            />
          </Card>
        ) : (
          <div className="space-y-4">
            {filteredBookings.map((booking) => {
              const resObj =
                typeof booking.resource === "object" && booking.resource
                  ? (booking.resource as Resource)
                  : null;

              const resName = resObj?.name || "Campus Facility";
              const resCode = resObj?.code || "RES";
              const building = resObj?.location?.building || "University Campus";

              const sDate = new Date(booking.startAt);
              const eDate = new Date(booking.endAt);

              const formattedDate = new Intl.DateTimeFormat("en-US", {
                weekday: "short",
                month: "short",
                day: "numeric",
                year: "numeric",
                timeZone: "UTC",
              }).format(sDate);

              const startTimeStr = `${String(sDate.getUTCHours()).padStart(2, "0")}:${String(
                sDate.getUTCMinutes()
              ).padStart(2, "0")} UTC`;
              const endTimeStr = `${String(eDate.getUTCHours()).padStart(2, "0")}:${String(
                eDate.getUTCMinutes()
              ).padStart(2, "0")} UTC`;

              const isCancelable =
                booking.status === "CONFIRMED" || booking.status === "PENDING";

              return (
                <Card
                  key={booking._id}
                  className="p-5 border-border hover:border-border/80 transition-all flex flex-col md:flex-row md:items-center justify-between gap-4 bg-surface/90"
                >
                  <div className="space-y-2">
                    {/* Status Badge & Code */}
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-mono text-xs font-bold text-primary-bright px-2 py-0.5 rounded bg-primary/10 border border-primary/20">
                        {resCode}
                      </span>
                      <Badge
                        variant={
                          booking.status === "CONFIRMED"
                            ? "available"
                            : booking.status === "CANCELLED" || booking.status === "REJECTED"
                            ? "cancelled"
                            : "warning"
                        }
                        dot
                      >
                        {booking.status === "PENDING" && booking.currentStepOrder && booking.approvalChain?.length
                          ? `PENDING (Step ${booking.currentStepOrder}/${booking.approvalChain.length}: ${booking.currentApproverRole || "APPROVAL"})`
                          : booking.status}
                      </Badge>
                      {booking.status === "PENDING" && booking.activeStepDeadline && (
                        <span className="text-[11px] text-warning flex items-center gap-1 font-mono">
                          <Clock className="h-3 w-3" />
                          Due: {new Date(booking.activeStepDeadline).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                        </span>
                      )}
                      <span className="text-xs text-muted">ID: {booking._id.slice(-6)}</span>
                    </div>

                    {/* Booking Title */}
                    <div>
                      <h3 className="text-base font-semibold text-foreground leading-snug">
                        {booking.title}
                      </h3>
                      {booking.description && (
                        <p className="text-xs text-muted line-clamp-1 mt-0.5">
                          {booking.description}
                        </p>
                      )}
                    </div>

                    {/* Multi-step Approval Chain Visualization */}
                    {booking.approvalChain && booking.approvalChain.length > 0 && (
                      <div className="p-2.5 rounded bg-surface-2/60 border border-border/50 text-xs space-y-1.5 my-1">
                        <div className="font-semibold text-[11px] text-muted uppercase tracking-wider">
                          Approval Workflow ({booking.approvalChain.length} {booking.approvalChain.length === 1 ? 'Step' : 'Steps'})
                        </div>
                        <div className="flex flex-wrap items-center gap-2">
                          {booking.approvalChain.map((step, idx) => (
                            <div
                              key={idx}
                              className={cn(
                                "flex items-center gap-1.5 px-2 py-1 rounded text-xs border",
                                step.status === "APPROVED"
                                  ? "bg-success/10 border-success/30 text-success"
                                  : step.status === "REJECTED"
                                  ? "bg-danger/10 border-danger/30 text-danger"
                                  : step.stepOrder === booking.currentStepOrder
                                  ? "bg-warning/10 border-warning/30 text-warning font-semibold animate-pulse"
                                  : "bg-surface-2 border-border/40 text-muted"
                              )}
                            >
                              <span className="font-mono">#{step.stepOrder}</span>
                              <span>{step.approverRole}</span>
                              <span>•</span>
                              <span>{step.status}</span>
                              {step.comment && (
                                <span className="text-[11px] opacity-80">({step.comment})</span>
                              )}
                            </div>
                          ))}
                        </div>
                      </div>
                    )}

                    {/* Facility & Date Info */}
                    <div className="flex flex-wrap items-center gap-4 text-xs text-muted pt-1">
                      <div className="flex items-center gap-1.5">
                        <Building2 className="h-3.5 w-3.5 text-primary" />
                        <span>
                          {resName} • {building}
                        </span>
                      </div>
                      <span>•</span>
                      <div className="flex items-center gap-1.5">
                        <Calendar className="h-3.5 w-3.5 text-primary" />
                        <span>{formattedDate}</span>
                      </div>
                      <span>•</span>
                      <div className="flex items-center gap-1.5">
                        <Clock className="h-3.5 w-3.5 text-primary" />
                        <span>
                          {startTimeStr} – {endTimeStr}
                        </span>
                      </div>
                    </div>

                    {/* Cancellation reason if present */}
                    {booking.cancellationReason && (
                      <p className="text-xs text-danger/80 italic pt-1">
                        Reason for cancellation: {booking.cancellationReason}
                      </p>
                    )}
                  </div>

                  {/* Actions */}
                  <div className="flex items-center gap-2 shrink-0 self-end md:self-center">
                    {resObj && (
                      <Link href={`/dashboard/calendar?resourceId=${resObj._id}`}>
                        <Button variant="ghost" size="sm">
                          View on Calendar
                        </Button>
                      </Link>
                    )}

                    {isCancelable && (
                      <Button
                        variant="danger"
                        size="sm"
                        onClick={() => {
                          setCancelReason("");
                          setCancelError(null);
                          setCancelModalBooking(booking);
                        }}
                      >
                        Cancel Booking
                      </Button>
                    )}
                  </div>
                </Card>
              );
            })}
          </div>
        )}

        {/* Cancellation Confirmation Modal */}
        <Modal
          open={!!cancelModalBooking}
          onClose={() => setCancelModalBooking(null)}
          title="Cancel Reservation"
          description={`Are you sure you want to cancel "${cancelModalBooking?.title}"?`}
          size="md"
        >
          <div className="space-y-4">
            {cancelError && (
              <div className="p-3 rounded bg-danger/10 border border-danger/30 text-xs text-danger flex items-center gap-2">
                <AlertCircle className="h-4 w-4 shrink-0" />
                <span>{cancelError}</span>
              </div>
            )}

            <p className="text-xs text-muted">
              Cancelling will immediately release this time slot back to campus availability. This
              action cannot be undone.
            </p>

            <Textarea
              label="Reason for cancellation (optional)"
              placeholder="e.g. Rescheduled meeting, room no longer required..."
              rows={2}
              value={cancelReason}
              onChange={(e) => setCancelReason(e.target.value)}
            />

            <div className="flex items-center justify-end gap-3 pt-3 border-t border-border/50">
              <Button
                variant="ghost"
                onClick={() => setCancelModalBooking(null)}
                disabled={isCancelling}
              >
                Keep Booking
              </Button>
              <Button
                variant="danger"
                onClick={handleConfirmCancel}
                disabled={isCancelling}
              >
                {isCancelling ? "Cancelling..." : "Confirm Cancellation"}
              </Button>
            </div>
          </div>
        </Modal>
      </PageContainer>
    </div>
  );
}
