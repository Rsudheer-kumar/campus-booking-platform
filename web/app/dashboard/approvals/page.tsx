"use client";

import { useState, useEffect, useCallback, useMemo } from "react";
import Link from "next/link";
import {
  ClipboardCheck,
  Clock,
  Building2,
  Calendar,
  AlertCircle,
  CheckCircle2,
  XCircle,
  ShieldAlert,
  User,
  ArrowRight,
  Filter,
  RefreshCw,
} from "lucide-react";

import { PageContainer, PageHeader } from "@/components/layout";
import { Card, Badge, Button, Modal, Textarea, Skeleton, EmptyState } from "@/components/ui";
import { useAuth } from "@/lib/auth";
import { api, type PendingApprovalQueueItem } from "@/lib/api";
import { cn } from "@/lib/utils";

export default function ApprovalsPage() {
  const { user } = useAuth();
  const [items, setItems] = useState<PendingApprovalQueueItem[]>([]);
  const [total, setTotal] = useState<number>(0);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [sortBy, setSortBy] = useState<"deadline_asc" | "created_desc" | "created_asc">("deadline_asc");

  // Action Modals State
  const [approveItem, setApproveItem] = useState<PendingApprovalQueueItem | null>(null);
  const [approveComment, setApproveComment] = useState<string>("");
  const [isApproving, setIsApproving] = useState<boolean>(false);
  const [approveError, setApproveError] = useState<string | null>(null);

  const [rejectItem, setRejectItem] = useState<PendingApprovalQueueItem | null>(null);
  const [rejectReason, setRejectReason] = useState<string>("");
  const [isRejecting, setIsRejecting] = useState<boolean>(false);
  const [rejectError, setRejectError] = useState<string | null>(null);

  const fetchQueue = useCallback(async () => {
    setIsLoading(true);
    try {
      const res = await api.approvals.getPending({ sortBy, limit: 50 });
      setItems(res.items || []);
      setTotal(res.total || 0);
    } catch (err) {
      console.error("Failed to fetch pending approval queue", err);
    } finally {
      setIsLoading(false);
    }
  }, [sortBy]);

  useEffect(() => {
    fetchQueue();
  }, [fetchQueue]);

  // Check if current user is ADMIN acting as override
  const isAdminOverride = useMemo(() => {
    if (!user || !approveItem) return false;
    const isAdmin = user.roles.includes("ADMIN");
    const isStepRole = user.roles.includes(approveItem.currentApproverRole as any);
    return isAdmin && !isStepRole;
  }, [user, approveItem]);

  const handleConfirmApprove = async () => {
    if (!approveItem) return;

    if (isAdminOverride && approveComment.trim().length < 5) {
      setApproveError("Admin overrides require a justification comment of at least 5 characters.");
      return;
    }

    setIsApproving(true);
    setApproveError(null);

    try {
      await api.bookings.approve(approveItem._id, approveComment.trim() || undefined);
      setApproveItem(null);
      setApproveComment("");
      fetchQueue();
    } catch (err) {
      setApproveError(err instanceof Error ? err.message : "Failed to approve reservation step");
    } finally {
      setIsApproving(false);
    }
  };

  const handleConfirmReject = async () => {
    if (!rejectItem) return;

    if (rejectReason.trim().length < 5) {
      setRejectError("Rejection reason must be at least 5 characters long.");
      return;
    }

    setIsRejecting(true);
    setRejectError(null);

    try {
      await api.bookings.reject(rejectItem._id, rejectReason.trim());
      setRejectItem(null);
      setRejectReason("");
      fetchQueue();
    } catch (err) {
      setRejectError(err instanceof Error ? err.message : "Failed to reject reservation");
    } finally {
      setIsRejecting(false);
    }
  };

  return (
    <div className="min-h-full py-8 grid-background">
      <PageContainer className="space-y-6">
        <PageHeader
          title="Approval Queue"
          description="Review, verify, and action pending resource booking requests under campus workflow policies."
          action={
            <Button
              size="sm"
              variant="outline"
              icon={<RefreshCw className={cn("h-4 w-4", isLoading && "animate-spin")} />}
              onClick={fetchQueue}
            >
              Refresh Queue
            </Button>
          }
        />

        {/* Sort & Urgency Controls */}
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border/60 pb-3">
          <div className="flex items-center gap-2">
            <span className="text-xs text-muted font-medium">Sort by:</span>
            <button
              type="button"
              onClick={() => setSortBy("deadline_asc")}
              className={cn(
                "px-3 py-1 rounded-full text-xs font-medium transition-colors",
                sortBy === "deadline_asc"
                  ? "bg-primary text-white"
                  : "bg-surface text-muted hover:text-foreground border border-border"
              )}
            >
              Urgency (Deadline First)
            </button>
            <button
              type="button"
              onClick={() => setSortBy("created_desc")}
              className={cn(
                "px-3 py-1 rounded-full text-xs font-medium transition-colors",
                sortBy === "created_desc"
                  ? "bg-primary text-white"
                  : "bg-surface text-muted hover:text-foreground border border-border"
              )}
            >
              Newest First
            </button>
            <button
              type="button"
              onClick={() => setSortBy("created_asc")}
              className={cn(
                "px-3 py-1 rounded-full text-xs font-medium transition-colors",
                sortBy === "created_asc"
                  ? "bg-primary text-white"
                  : "bg-surface text-muted hover:text-foreground border border-border"
              )}
            >
              Oldest First
            </button>
          </div>

          <div className="text-xs text-muted">
            <span className="font-semibold text-foreground">{total}</span> pending{" "}
            {total === 1 ? "reservation" : "reservations"} requiring action
          </div>
        </div>

        {/* Queue List */}
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
        ) : items.length === 0 ? (
          <Card className="min-h-[350px] flex items-center justify-center">
            <EmptyState
              icon={<ClipboardCheck className="h-8 w-8 text-primary" />}
              title="All Caught Up!"
              description="There are currently no pending reservation requests waiting for your role or department approval."
            />
          </Card>
        ) : (
          <div className="space-y-4">
            {items.map((item) => {
              const sDate = new Date(item.startAt);
              const eDate = new Date(item.endAt);

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

              const hasDeadline = Boolean(item.activeStepDeadline);
              const deadlineDate = hasDeadline ? new Date(item.activeStepDeadline as string) : null;
              const isOverdue = deadlineDate ? deadlineDate.getTime() < Date.now() : false;

              return (
                <Card
                  key={item._id}
                  className="p-5 border-border hover:border-border/80 transition-all flex flex-col md:flex-row md:items-center justify-between gap-4 bg-surface/90"
                >
                  <div className="space-y-2">
                    {/* Role & Step Badge Header */}
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-mono text-xs font-bold text-primary-bright px-2 py-0.5 rounded bg-primary/10 border border-primary/20">
                        {item.resource.code}
                      </span>
                      <Badge variant="warning" dot>
                        Step {item.currentStepOrder} of {item.totalSteps}: {item.currentApproverRole}
                      </Badge>
                      {hasDeadline && deadlineDate && (
                        <span
                          className={cn(
                            "text-xs px-2 py-0.5 rounded font-mono flex items-center gap-1",
                            isOverdue
                              ? "bg-danger/10 text-danger border border-danger/30 font-bold"
                              : "bg-warning/10 text-warning border border-warning/30"
                          )}
                        >
                          <Clock className="h-3 w-3" />
                          {isOverdue ? "OVERDUE: " : "Deadline: "}
                          {deadlineDate.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                        </span>
                      )}
                      <span className="text-xs text-muted">ID: {item._id.slice(-6)}</span>
                    </div>

                    {/* Booking Title */}
                    <div>
                      <h3 className="text-base font-semibold text-foreground leading-snug">
                        {item.title}
                      </h3>
                      {item.description && (
                        <p className="text-xs text-muted line-clamp-1 mt-0.5">{item.description}</p>
                      )}
                    </div>

                    {/* Requester & Facility Details */}
                    <div className="flex flex-wrap items-center gap-4 text-xs text-muted pt-1">
                      <div className="flex items-center gap-1.5 text-foreground font-medium">
                        <User className="h-3.5 w-3.5 text-primary" />
                        <span>
                          {item.user.name} ({item.user.department || "General"})
                        </span>
                      </div>
                      <span>•</span>
                      <div className="flex items-center gap-1.5">
                        <Building2 className="h-3.5 w-3.5 text-primary" />
                        <span>
                          {item.resource.name} ({item.resource.location?.building || "Campus"})
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
                  </div>

                  {/* Actions */}
                  <div className="flex items-center gap-2 shrink-0 self-end md:self-center">
                    <Button
                      variant="danger"
                      size="sm"
                      icon={<XCircle className="h-4 w-4" />}
                      onClick={() => {
                        setRejectReason("");
                        setRejectError(null);
                        setRejectItem(item);
                      }}
                    >
                      Reject
                    </Button>
                    <Button
                      variant="primary"
                      size="sm"
                      icon={<CheckCircle2 className="h-4 w-4" />}
                      onClick={() => {
                        setApproveComment("");
                        setApproveError(null);
                        setApproveItem(item);
                      }}
                    >
                      Approve
                    </Button>
                  </div>
                </Card>
              );
            })}
          </div>
        )}

        {/* Approve Modal */}
        <Modal
          open={!!approveItem}
          onClose={() => setApproveItem(null)}
          title={`Approve Reservation Step (${approveItem?.currentApproverRole})`}
          description={
            approveItem
              ? `Step ${approveItem.currentStepOrder} of ${approveItem.totalSteps} for ${approveItem.resource.name}`
              : "Approve workflow step"
          }
        >
          <div className="space-y-4">
            {approveError && (
              <div className="p-3 rounded bg-danger/10 border border-danger/30 text-xs text-danger flex items-start gap-2">
                <AlertCircle className="h-4 w-4 shrink-0 mt-0.5" />
                <span>{approveError}</span>
              </div>
            )}

            {isAdminOverride && (
              <div className="p-3 rounded bg-warning/10 border border-warning/40 text-xs text-warning flex items-start gap-2">
                <ShieldAlert className="h-4 w-4 shrink-0 mt-0.5" />
                <div>
                  <span className="font-semibold block">Administrative Override</span>
                  You are approving as an administrator for role {approveItem?.currentApproverRole}.
                  A justification comment of at least 5 characters is mandatory.
                </div>
              </div>
            )}

            <Textarea
              label={isAdminOverride ? "Override Justification (Required)" : "Approval Comment (Optional)"}
              placeholder={
                isAdminOverride
                  ? "Provide mandatory reason for administrative override..."
                  : "Add any operational notes or requirements for this approval step..."
              }
              value={approveComment}
              onChange={(e) => setApproveComment(e.target.value)}
              rows={3}
            />

            <div className="flex items-center justify-end gap-3 pt-3 border-t border-border">
              <Button variant="ghost" onClick={() => setApproveItem(null)} disabled={isApproving}>
                Cancel
              </Button>
              <Button
                variant="primary"
                onClick={handleConfirmApprove}
                disabled={isApproving || (isAdminOverride && approveComment.trim().length < 5)}
              >
                {isApproving ? "Approving..." : "Confirm Approval"}
              </Button>
            </div>
          </div>
        </Modal>

        {/* Reject Modal */}
        <Modal
          open={!!rejectItem}
          onClose={() => setRejectItem(null)}
          title="Reject Reservation"
          description={
            rejectItem
              ? `Rejecting will cancel the booking and immediately release the hardware slot lock for ${rejectItem.resource.name}.`
              : "Reject reservation"
          }
        >
          <div className="space-y-4">
            {rejectError && (
              <div className="p-3 rounded bg-danger/10 border border-danger/30 text-xs text-danger flex items-start gap-2">
                <AlertCircle className="h-4 w-4 shrink-0 mt-0.5" />
                <span>{rejectError}</span>
              </div>
            )}

            <div className="p-3 rounded bg-danger/10 border border-danger/30 text-xs text-danger flex items-start gap-2">
              <AlertCircle className="h-4 w-4 shrink-0 mt-0.5" />
              <span>
                Rejection is permanent. The requester will be notified and competing bookings may claim this
                facility slot immediately.
              </span>
            </div>

            <Textarea
              label="Rejection Reason (Required, min 5 chars)"
              placeholder="Explain why this reservation request is being rejected..."
              value={rejectReason}
              onChange={(e) => setRejectReason(e.target.value)}
              rows={3}
              required
            />

            <div className="flex items-center justify-end gap-3 pt-3 border-t border-border">
              <Button variant="ghost" onClick={() => setRejectItem(null)} disabled={isRejecting}>
                Cancel
              </Button>
              <Button
                variant="danger"
                onClick={handleConfirmReject}
                disabled={isRejecting || rejectReason.trim().length < 5}
              >
                {isRejecting ? "Rejecting..." : "Confirm Rejection"}
              </Button>
            </div>
          </div>
        </Modal>
      </PageContainer>
    </div>
  );
}
