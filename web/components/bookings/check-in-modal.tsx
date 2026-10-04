"use client";

import { useState, useEffect, useCallback } from "react";
import { Modal } from "@/components/ui/modal";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  QrCode,
  CheckCircle2,
  AlertCircle,
  Timer,
  Clock,
  Building2,
  RefreshCw,
  LogOut,
  ShieldCheck,
  Copy,
  Check,
} from "lucide-react";
import { api, type Reservation, type Resource } from "@/lib/api";

interface CheckInModalProps {
  open: boolean;
  onClose: () => void;
  booking: Reservation | null;
  onSuccess: () => void;
}

export function CheckInModal({
  open,
  onClose,
  booking,
  onSuccess,
}: CheckInModalProps) {
  const [tokenData, setTokenData] = useState<{
    token: string;
    expiresAt: string;
    resourceId: string;
    validFrom: string;
    validUntil: string;
  } | null>(null);

  const [isLoadingToken, setIsLoadingToken] = useState(false);
  const [tokenError, setTokenError] = useState<string | null>(null);
  const [copiedToken, setCopiedToken] = useState(false);

  const [scannedResourceId, setScannedResourceId] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [successInfo, setSuccessInfo] = useState<{
    checkInAt: string;
    isIdempotent?: boolean;
  } | null>(null);

  const [tokenSecondsRemaining, setTokenSecondsRemaining] = useState<number | null>(null);
  const [graceSecondsRemaining, setGraceSecondsRemaining] = useState<number | null>(null);

  // Extract facility info
  const resObj =
    typeof booking?.resource === "object" && booking?.resource !== null
      ? (booking.resource as Resource)
      : null;

  const resourceName = resObj?.name || "Campus Facility";
  const resourceCode = resObj?.code || "FACILITY";

  // Request fresh ephemeral token
  const fetchToken = useCallback(async () => {
    if (!booking?._id) return;
    setIsLoadingToken(true);
    setTokenError(null);
    try {
      const data = await api.bookings.getCheckInToken(booking._id);
      setTokenData(data);
      setScannedResourceId(data.resourceId);
    } catch (err) {
      setTokenError(
        err instanceof Error ? err.message : "Failed to generate ephemeral check-in token"
      );
    } finally {
      setIsLoadingToken(false);
    }
  }, [booking]);

  // Initial load when modal opens for confirmed booking
  useEffect(() => {
    if (open && booking && booking.status === "CONFIRMED") {
      fetchToken();
    }
  }, [open, booking, fetchToken]);

  // Live countdown timer for token expiry and grace window
  useEffect(() => {
    if (!open || !tokenData) return;

    const interval = setInterval(() => {
      const now = Date.now();
      const tokenExp = new Date(tokenData.expiresAt).getTime();
      const graceExp = new Date(tokenData.validUntil).getTime();

      const remToken = Math.max(0, Math.floor((tokenExp - now) / 1000));
      const remGrace = Math.max(0, Math.floor((graceExp - now) / 1000));

      setTokenSecondsRemaining(remToken);
      setGraceSecondsRemaining(remGrace);
    }, 1000);

    return () => clearInterval(interval);
  }, [open, tokenData]);

  // Handle QR Check-in submission
  const handleCheckInSubmit = async () => {
    if (!booking || !tokenData) return;

    setIsSubmitting(true);
    setSubmitError(null);

    try {
      const res = await api.bookings.checkIn(booking._id, {
        token: tokenData.token,
        resourceId: scannedResourceId.trim() || tokenData.resourceId,
      });

      setSuccessInfo({
        checkInAt: res.checkInAt,
        isIdempotent: res.isIdempotent,
      });
      onSuccess();
    } catch (err) {
      setSubmitError(err instanceof Error ? err.message : "Check-in failed. Please verify credentials.");
    } finally {
      setIsSubmitting(false);
    }
  };

  // Handle Early Checkout
  const handleCheckout = async () => {
    if (!booking) return;
    setIsSubmitting(true);
    setSubmitError(null);

    try {
      await api.bookings.checkout(booking._id);
      onSuccess();
      onClose();
    } catch (err) {
      setSubmitError(err instanceof Error ? err.message : "Failed to check out");
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleClose = () => {
    setTokenData(null);
    setTokenError(null);
    setSuccessInfo(null);
    setSubmitError(null);
    onClose();
  };

  if (!booking) return null;

  return (
    <Modal
      open={open}
      onClose={handleClose}
      title={booking.status === "CHECKED_IN" ? "Active Session & Checkout" : "Facility Check-In"}
      description={`Reservation: ${booking.title}`}
      size="md"
    >
      <div className="space-y-4">
        {/* Status & Facility Header */}
        <div className="p-3.5 rounded bg-surface-2/60 border border-border flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Building2 className="h-4 w-4 text-primary shrink-0" />
            <div>
              <span className="text-xs font-semibold text-foreground block">{resourceName}</span>
              <span className="text-[11px] text-muted font-mono">{resourceCode}</span>
            </div>
          </div>
          <Badge
            variant={
              booking.status === "CHECKED_IN"
                ? "available"
                : booking.status === "CONFIRMED"
                ? "warning"
                : "neutral"
            }
          >
            {booking.status}
          </Badge>
        </div>

        {/* Already Checked-In State: Early Departure / Checkout Action */}
        {booking.status === "CHECKED_IN" ? (
          <div className="space-y-4">
            <div className="p-4 rounded bg-success/10 border border-success/30 text-success text-xs space-y-2">
              <div className="flex items-center gap-2 font-semibold">
                <CheckCircle2 className="h-4 w-4 shrink-0" />
                <span>Facility Session Currently Active</span>
              </div>
              <p className="text-[11px] text-foreground/80">
                You checked into this reservation {booking.checkInAt ? `at ${new Date(booking.checkInAt).toLocaleTimeString()}` : "successfully"}.
                When you finish using the room, check out early to instantly restore slot capacity for fellow campus members.
              </p>
            </div>

            {submitError && (
              <div className="p-3 rounded bg-danger/10 border border-danger/30 text-xs text-danger flex items-center gap-2">
                <AlertCircle className="h-4 w-4 shrink-0" />
                <span>{submitError}</span>
              </div>
            )}

            <div className="flex justify-end gap-3 pt-2">
              <Button variant="secondary" onClick={handleClose} disabled={isSubmitting}>
                Keep Session Active
              </Button>
              <Button
                variant="danger"
                icon={<LogOut className="h-4 w-4" />}
                onClick={handleCheckout}
                disabled={isSubmitting}
              >
                {isSubmitting ? "Checking out..." : "Check Out Early"}
              </Button>
            </div>
          </div>
        ) : successInfo ? (
          /* Check-In Success Confirmation */
          <div className="space-y-4 text-center py-4">
            <div className="mx-auto w-12 h-12 rounded-full bg-success/20 text-success flex items-center justify-center">
              <CheckCircle2 className="h-7 w-7" />
            </div>
            <div>
              <h3 className="text-base font-bold text-foreground">
                {successInfo.isIdempotent ? "Check-In Verified" : "Check-In Successful!"}
              </h3>
              <p className="text-xs text-muted mt-1">
                Verified at {new Date(successInfo.checkInAt).toLocaleTimeString()}
              </p>
            </div>
            <p className="text-xs text-foreground/80 max-w-sm mx-auto">
              Your room slot is locked and capacity is secured. Please check out when your session concludes.
            </p>
            <div className="pt-2">
              <Button size="sm" onClick={handleClose}>
                Done
              </Button>
            </div>
          </div>
        ) : (
          /* Check-In Pending State */
          <div className="space-y-4">
            {/* Error notifications */}
            {tokenError && (
              <div className="p-3 rounded bg-danger/10 border border-danger/30 text-xs text-danger flex items-start gap-2">
                <AlertCircle className="h-4 w-4 shrink-0 mt-0.5" />
                <div className="space-y-1">
                  <span className="font-semibold block">Check-in Unavailable</span>
                  <span>{tokenError}</span>
                </div>
              </div>
            )}

            {submitError && (
              <div className="p-3 rounded bg-danger/10 border border-danger/30 text-xs text-danger flex items-center gap-2">
                <AlertCircle className="h-4 w-4 shrink-0" />
                <span>{submitError}</span>
              </div>
            )}

            {/* Live Countdowns */}
            {tokenData && (
              <div className="grid grid-cols-2 gap-3 text-xs">
                <div className="p-2.5 rounded bg-surface border border-border space-y-1">
                  <div className="flex items-center gap-1.5 text-muted text-[11px]">
                    <Timer className="h-3.5 w-3.5 text-primary" />
                    <span>Token TTL</span>
                  </div>
                  <span className="font-mono font-bold text-foreground">
                    {tokenSecondsRemaining !== null
                      ? `${Math.floor(tokenSecondsRemaining / 60)}m ${tokenSecondsRemaining % 60}s`
                      : "Calculating..."}
                  </span>
                </div>

                <div className="p-2.5 rounded bg-surface border border-border space-y-1">
                  <div className="flex items-center gap-1.5 text-muted text-[11px]">
                    <Clock className="h-3.5 w-3.5 text-warning" />
                    <span>Auto-Release Grace</span>
                  </div>
                  <span className="font-mono font-bold text-foreground">
                    {graceSecondsRemaining !== null && graceSecondsRemaining > 0
                      ? `${Math.floor(graceSecondsRemaining / 60)}m ${graceSecondsRemaining % 60}s`
                      : "Grace window elapsed"}
                  </span>
                </div>
              </div>
            )}

            {/* Ephemeral QR Code & Security Information */}
            {tokenData && (
              <div className="p-4 rounded-lg bg-surface border border-border text-center space-y-3">
                <div className="flex items-center justify-center gap-2 text-xs font-semibold text-primary">
                  <QrCode className="h-4 w-4" />
                  <span>Single-Use Check-In Token</span>
                </div>

                {/* Token Display Box */}
                <div className="p-2.5 rounded bg-surface-2/80 font-mono text-[11px] text-muted flex items-center justify-between gap-2 border border-border/70">
                  <span className="truncate">{tokenData.token}</span>
                  <button
                    type="button"
                    onClick={() => {
                      navigator.clipboard.writeText(tokenData.token);
                      setCopiedToken(true);
                      setTimeout(() => setCopiedToken(false), 2000);
                    }}
                    className="shrink-0 p-1 rounded hover:bg-surface text-foreground transition-colors"
                    title="Copy token"
                  >
                    {copiedToken ? <Check className="h-3.5 w-3.5 text-success" /> : <Copy className="h-3.5 w-3.5" />}
                  </button>
                </div>

                <p className="text-[11px] text-muted">
                  Cryptographically hashed with SHA-256. Valid for 5 minutes. Regenerating invalidates any previous token.
                </p>

                <Button
                  variant="ghost"
                  size="sm"
                  icon={<RefreshCw className="h-3.5 w-3.5" />}
                  onClick={fetchToken}
                  disabled={isLoadingToken}
                >
                  {isLoadingToken ? "Regenerating..." : "Regenerate Token"}
                </Button>
              </div>
            )}

            {/* Facility Scanned Code Fallback Input */}
            <div className="space-y-2">
              <Input
                label="Scanned Facility Code / Resource ID"
                placeholder="Scan room QR plaque or enter facility ID"
                value={scannedResourceId}
                onChange={(e) => setScannedResourceId(e.target.value)}
                helperText={`Matches facility plaque: ${resourceCode} (${resourceName})`}
              />
            </div>

            {/* Action Buttons */}
            <div className="flex items-center justify-end gap-3 pt-3 border-t border-border">
              <Button variant="ghost" onClick={onClose} disabled={isSubmitting}>
                Cancel
              </Button>
              <Button
                variant="primary"
                icon={<ShieldCheck className="h-4 w-4" />}
                onClick={handleCheckInSubmit}
                disabled={isSubmitting || !tokenData || isLoadingToken}
              >
                {isSubmitting ? "Verifying..." : "Verify & Check In"}
              </Button>
            </div>
          </div>
        )}
      </div>
    </Modal>
  );
}
