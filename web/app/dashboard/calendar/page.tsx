"use client";

import { useState, useEffect, useCallback, useMemo, Suspense, useRef } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import {
  Calendar as CalendarIcon,
  ChevronLeft,
  ChevronRight,
  Plus,
  Lock,
  CalendarCheck,
  Clock,
  Sparkles,
  Building2,
  Users,
  CheckCircle2,
  RefreshCw,
} from "lucide-react";

import { PageContainer, PageHeader } from "@/components/layout";
import { Card, Badge, Button, Select, Skeleton } from "@/components/ui";
import { BookingModal } from "@/components/calendar/booking-modal";
import {
  api,
  type Resource,
  type TimetableEntry,
  type Reservation,
} from "@/lib/api";
import { cn } from "@/lib/utils";

function CalendarView() {
  const searchParams = useSearchParams();
  const router = useRouter();

  // Selected state
  const [resources, setResources] = useState<Resource[]>([]);
  const [selectedResourceId, setSelectedResourceId] = useState<string>("");
  const [selectedDate, setSelectedDate] = useState<Date>(new Date());
  const [viewMode, setViewMode] = useState<"week" | "day">("week");

  // Data state
  const [timetables, setTimetables] = useState<TimetableEntry[]>([]);
  const [bookings, setBookings] = useState<Reservation[]>([]);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [isRefreshing, setIsRefreshing] = useState<boolean>(false);

  // Booking modal state
  const [isModalOpen, setIsModalOpen] = useState<boolean>(false);
  const [modalSlot, setModalSlot] = useState<{ start: string; end: string } | null>(null);

  // 1. Fetch Resources — runs ONCE on mount only.
  // We read the initial URL resourceId here and never re-run when searchParams
  // changes (e.g. after handleResourceChange calls router.replace), which would
  // create an infinite fetch loop.
  const initialResourceIdRef = useRef<string | null>(null);
  useEffect(() => {
    // Capture the URL param at the time the component first mounts
    initialResourceIdRef.current = searchParams.get("resourceId");

    async function loadResources() {
      try {
        const res = await api.resources.list({ limit: 50 });
        setResources(res.resources);

        const queryResId = initialResourceIdRef.current;
        if (queryResId && res.resources.some((r) => r._id === queryResId)) {
          setSelectedResourceId(queryResId);
        } else if (res.resources.length > 0) {
          setSelectedResourceId(res.resources[0]._id);
        }
      } catch (err) {
        console.error("Failed to fetch resources", err);
      }
    }
    loadResources();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []); // intentionally empty — mount-only

  // Sync selected resource with URL
  const handleResourceChange = (resId: string) => {
    setSelectedResourceId(resId);
    const params = new URLSearchParams(searchParams.toString());
    params.set("resourceId", resId);
    router.replace(`/dashboard/calendar?${params.toString()}`);
  };

  // Find currently active resource object
  const activeResource = useMemo(() => {
    return resources.find((r) => r._id === selectedResourceId) || null;
  }, [resources, selectedResourceId]);

  // Calculate Monday of the active week
  const weekDays = useMemo(() => {
    const d = new Date(selectedDate);
    const day = d.getUTCDay();
    const diffToMonday = day === 0 ? -6 : 1 - day;
    const monday = new Date(d);
    monday.setUTCDate(d.getUTCDate() + diffToMonday);
    monday.setUTCHours(0, 0, 0, 0);

    const days: Date[] = [];
    for (let i = 0; i < 7; i++) {
      const nextDay = new Date(monday);
      nextDay.setUTCDate(monday.getUTCDate() + i);
      days.push(nextDay);
    }
    return days;
  }, [selectedDate]);

  // 2. Fetch Timetable Entries and Bookings for the selected resource and date range
  const loadScheduleData = useCallback(async () => {
    if (!selectedResourceId) return;

    setIsLoading(true);
    try {
      // Full ISO range for the visible week window
      const startAt = weekDays[0].toISOString();
      // End of the last visible day (Sunday 23:59:59.999 UTC)
      const endAt = new Date(weekDays[6].getTime() + 86400000 - 1).toISOString();

      const [ttRes, bkRes] = await Promise.all([
        api.timetables.list({
          resourceId: selectedResourceId,
          startAt,
          endAt,
          limit: 100,
        }),
        api.bookings.list({
          resourceId: selectedResourceId,
          startAt,
          endAt,
          limit: 100,
        }),
      ]);

      setTimetables(ttRes.entries || []);
      // Filter out cancelled bookings
      setBookings(
        (bkRes.bookings || []).filter(
          (b) => b.status === "CONFIRMED" || b.status === "PENDING"
        )
      );
    } catch (err) {
      console.error("Failed to load schedule data", err);
    } finally {
      setIsLoading(false);
      setIsRefreshing(false);
    }
  }, [selectedResourceId, weekDays]);

  useEffect(() => {
    loadScheduleData();
  }, [loadScheduleData]);

  // Navigation handlers
  const handlePrev = () => {
    const delta = viewMode === "week" ? 7 : 1;
    const nextDate = new Date(selectedDate);
    nextDate.setUTCDate(selectedDate.getUTCDate() - delta);
    setSelectedDate(nextDate);
  };

  const handleNext = () => {
    const delta = viewMode === "week" ? 7 : 1;
    const nextDate = new Date(selectedDate);
    nextDate.setUTCDate(selectedDate.getUTCDate() + delta);
    setSelectedDate(nextDate);
  };

  const handleToday = () => {
    setSelectedDate(new Date());
  };

  // Open booking modal for a specific day and hour
  const handleOpenBooking = (dayDate: Date, hour: number) => {
    const start = new Date(dayDate);
    start.setUTCHours(hour, 0, 0, 0);
    const end = new Date(dayDate);
    end.setUTCHours(hour + 1, 0, 0, 0);

    setModalSlot({
      start: start.toISOString(),
      end: end.toISOString(),
    });
    setIsModalOpen(true);
  };

  // Callback on successful booking
  const handleBookingSuccess = () => {
    setIsRefreshing(true);
    loadScheduleData();
  };

  // Operating hours (08:00 to 20:00 UTC)
  const hours = Array.from({ length: 12 }, (_, i) => i + 8);

  const monthYearLabel = useMemo(() => {
    const options: Intl.DateTimeFormatOptions = { month: "short", year: "numeric", timeZone: "UTC" };
    return new Intl.DateTimeFormat("en-US", options).format(selectedDate);
  }, [selectedDate]);

  /**
   * Pre-index schedule entries by an ISO slot key "YYYY-MM-DDTHH" (UTC) to
   * enable O(1) lookups during the calendar grid render instead of an O(N)
   * linear scan per cell.  Timetable entries win over bookings when they
   * overlap the same cell (institutional calendar has priority).
   */
  const scheduleIndex = useMemo(() => {
    const ttMap = new Map<string, TimetableEntry>();
    const bkMap = new Map<string, Reservation>();

    for (const tt of timetables) {
      const s = new Date(tt.startAt);
      const e = new Date(tt.endAt);
      // Mark every UTC whole-hour slot that overlaps this entry
      for (let h = s.getUTCHours(); ; h++) {
        const slotStart = new Date(s);
        slotStart.setUTCHours(h, 0, 0, 0);
        if (slotStart >= e) break;
        const key = slotStart.toISOString().slice(0, 13); // "YYYY-MM-DDTHH"
        ttMap.set(key, tt);
      }
    }

    for (const bk of bookings) {
      const s = new Date(bk.startAt);
      const e = new Date(bk.endAt);
      for (let h = s.getUTCHours(); ; h++) {
        const slotStart = new Date(s);
        slotStart.setUTCHours(h, 0, 0, 0);
        if (slotStart >= e) break;
        const key = slotStart.toISOString().slice(0, 13);
        if (!ttMap.has(key)) {
          // Only store booking entry if no timetable entry occupies that slot
          bkMap.set(key, bk);
        }
      }
    }

    return { ttMap, bkMap };
  }, [timetables, bookings]);

  return (
    <div className="min-h-full py-8 grid-background">
      <PageContainer className="space-y-6">
        {/* Header with Title and Action Button */}
        <PageHeader
          title="Campus Timetable & Availability"
          description="Institutional curriculum sessions, academic timetables, and resource reservations."
          action={
            <Button
              size="sm"
              icon={<Plus className="h-4 w-4" />}
              onClick={() => {
                setModalSlot(null);
                setIsModalOpen(true);
              }}
              disabled={!activeResource}
            >
              New Booking
            </Button>
          }
        />

        {/* Top Control Bar: Resource Selector, Date Navigation, View Mode */}
        <Card className="p-4 bg-surface-2/40 border-border/80">
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
            {/* Resource Selector Dropdown */}
            <div className="w-full md:w-80">
              <Select
                label="Selected Campus Facility"
                value={selectedResourceId}
                onChange={(e) => handleResourceChange(e.target.value)}
                options={resources.map((r) => ({
                  value: r._id,
                  label: `${r.name} (${r.code}) — ${r.location?.building}`,
                }))}
                disabled={resources.length === 0}
              />
            </div>

            {/* Date Navigation Controls */}
            <div className="flex items-center gap-2 self-start md:self-end">
              <Button
                variant="secondary"
                size="sm"
                onClick={handleToday}
                className="text-xs"
              >
                Today
              </Button>
              <div className="flex items-center border border-border rounded-[var(--radius-md)] bg-surface">
                <button
                  type="button"
                  onClick={handlePrev}
                  className="p-1.5 hover:bg-white/[0.06] text-muted hover:text-foreground transition-colors rounded-l"
                  aria-label="Previous"
                >
                  <ChevronLeft className="h-4 w-4" />
                </button>
                <span className="px-3 text-xs font-semibold text-foreground tracking-wide min-w-[100px] text-center">
                  {monthYearLabel}
                </span>
                <button
                  type="button"
                  onClick={handleNext}
                  className="p-1.5 hover:bg-white/[0.06] text-muted hover:text-foreground transition-colors rounded-r"
                  aria-label="Next"
                >
                  <ChevronRight className="h-4 w-4" />
                </button>
              </div>

              {/* View Mode Toggle */}
              <div className="flex rounded-[var(--radius-md)] border border-border bg-surface p-0.5">
                <button
                  type="button"
                  onClick={() => setViewMode("week")}
                  className={cn(
                    "px-2.5 py-1 text-xs font-medium rounded transition-colors",
                    viewMode === "week"
                      ? "bg-primary text-white"
                      : "text-muted hover:text-foreground"
                  )}
                >
                  Week
                </button>
                <button
                  type="button"
                  onClick={() => setViewMode("day")}
                  className={cn(
                    "px-2.5 py-1 text-xs font-medium rounded transition-colors",
                    viewMode === "day"
                      ? "bg-primary text-white"
                      : "text-muted hover:text-foreground"
                  )}
                >
                  Day
                </button>
              </div>

              {/* Refresh indicator */}
              <button
                type="button"
                onClick={() => {
                  setIsRefreshing(true);
                  loadScheduleData();
                }}
                disabled={isRefreshing}
                className="p-2 text-muted hover:text-foreground transition-colors"
                title="Refresh schedule"
              >
                <RefreshCw className={cn("h-4 w-4", isRefreshing && "animate-spin")} />
              </button>
            </div>
          </div>

          {/* Active Resource Details Bar */}
          {activeResource && (
            <div className="mt-4 pt-3 border-t border-border/50 flex flex-wrap items-center gap-4 text-xs text-muted">
              <div className="flex items-center gap-1.5">
                <Building2 className="h-3.5 w-3.5 text-primary" />
                <span className="text-foreground font-medium">{activeResource.name}</span>
                <span>({activeResource.code})</span>
              </div>
              <span>•</span>
              <div>
                Location: {activeResource.location?.building}, Floor {activeResource.location?.floor}, Room {activeResource.location?.roomNumber || activeResource.code}
              </div>
              <span>•</span>
              <div className="flex items-center gap-1">
                <Users className="h-3.5 w-3.5" />
                <span>Capacity: {activeResource.capacity} seats</span>
              </div>
              <div className="ml-auto flex items-center gap-3">
                <div className="flex items-center gap-1.5">
                  <span className="h-2.5 w-2.5 rounded-full bg-primary/70" />
                  <span className="text-[11px]">Academic Timetable (Authoritative)</span>
                </div>
                <div className="flex items-center gap-1.5">
                  <span className="h-2.5 w-2.5 rounded-full bg-emerald-500" />
                  <span className="text-[11px]">User Reservation</span>
                </div>
              </div>
            </div>
          )}
        </Card>

        {/* Schedule Grid Area */}
        {isLoading ? (
          <Card className="p-6 space-y-4">
            <Skeleton className="h-8 w-1/3" />
            <div className="grid grid-cols-7 gap-2">
              {Array.from({ length: 7 }).map((_, i) => (
                <Skeleton key={i} className="h-72 w-full" />
              ))}
            </div>
          </Card>
        ) : viewMode === "week" ? (
          /* ─── WEEK VIEW GRID ─── */
          <div className="space-y-2">
            <Card className="overflow-x-auto p-0 border-border" noPadding>
              <div className="min-w-[850px]">
                {/* Day Header Row */}
                <div className="grid grid-cols-8 border-b border-border bg-surface-2/70 text-xs font-semibold text-foreground">
                  <div className="p-3 text-center border-r border-border/60 text-muted uppercase tracking-wider text-[11px]">
                    UTC Time
                  </div>
                  {weekDays.map((d, i) => {
                    const isToday =
                      new Date().toISOString().slice(0, 10) ===
                      d.toISOString().slice(0, 10);
                    const dayName = new Intl.DateTimeFormat("en-US", {
                      weekday: "short",
                      timeZone: "UTC",
                    }).format(d);
                    const dayNum = d.getUTCDate();

                    return (
                      <div
                        key={i}
                        className={cn(
                          "p-3 text-center border-r border-border/60 last:border-r-0",
                          isToday && "bg-primary/10 text-primary-bright font-bold"
                        )}
                      >
                        <span className="block text-[11px] opacity-80 uppercase tracking-wider">
                          {dayName}
                        </span>
                        <span className="text-sm font-semibold">{dayNum}</span>
                      </div>
                    );
                  })}
                </div>

                {/* Hourly Rows */}
                <div className="divide-y divide-border/40">
                  {hours.map((hour) => {
                    const timeLabel = `${String(hour).padStart(2, "0")}:00`;

                    return (
                      <div key={hour} className="grid grid-cols-8 min-h-[64px]">
                        {/* Hour Label */}
                        <div className="p-2 border-r border-border/60 text-[11px] font-mono text-muted text-center flex items-center justify-center bg-surface-2/20">
                          {timeLabel}
                        </div>

                        {/* 7 Day Columns */}
                        {weekDays.map((dayDate, dayIdx) => {
                          const cellStartUtc = new Date(dayDate);
                          cellStartUtc.setUTCHours(hour, 0, 0, 0);

                          // O(1) pre-indexed lookups instead of O(N) linear scans
                          const slotKey = cellStartUtc.toISOString().slice(0, 13);
                          const matchingTt = scheduleIndex.ttMap.get(slotKey) ?? null;
                          const matchingBk = scheduleIndex.bkMap.get(slotKey) ?? null;

                          return (
                            <div
                              key={dayIdx}
                              className={cn(
                                "border-r border-border/40 last:border-r-0 p-1 relative transition-colors",
                                !matchingTt && !matchingBk && "hover:bg-primary/5 cursor-pointer group"
                              )}
                              onClick={() => {
                                if (!matchingTt && !matchingBk) {
                                  handleOpenBooking(dayDate, hour);
                                }
                              }}
                            >
                              {/* 1. Academic Timetable Session (Institutional Priority) */}
                              {matchingTt && (
                                <div
                                  className="h-full w-full rounded-[var(--radius-sm)] p-1.5 bg-gradient-to-br from-primary/25 to-[#1E293B] border border-primary/50 text-foreground flex flex-col justify-between select-none shadow-sm"
                                  title={`Academic Timetable: ${matchingTt.courseCode} - ${matchingTt.courseTitle} (${matchingTt.instructorName || "Department"})`}
                                >
                                  <div>
                                    <div className="flex items-center justify-between gap-1">
                                      <span className="text-[11px] font-bold text-primary-bright truncate">
                                        {matchingTt.courseCode}
                                      </span>
                                      <Lock className="h-3 w-3 text-primary-bright shrink-0" />
                                    </div>
                                    <p className="text-[10px] text-foreground/90 truncate leading-tight font-medium">
                                      {matchingTt.courseTitle}
                                    </p>
                                  </div>
                                  <div className="flex items-center justify-between text-[9px] text-muted pt-0.5">
                                    <span className="truncate">{matchingTt.instructorName || "Curriculum"}</span>
                                    <span className="font-mono text-primary-bright/80 shrink-0">
                                      {new Date(matchingTt.startAt).getUTCHours()}:
                                      {String(new Date(matchingTt.startAt).getUTCMinutes()).padStart(2, "0")}
                                    </span>
                                  </div>
                                </div>
                              )}

                              {/* 2. User Reservation */}
                              {!matchingTt && matchingBk && (
                                <div
                                  className="h-full w-full rounded-[var(--radius-sm)] p-1.5 bg-emerald-500/15 border border-emerald-500/40 text-foreground flex flex-col justify-between select-none"
                                  title={`Reservation: ${matchingBk.title}`}
                                >
                                  <div className="flex items-center justify-between gap-1">
                                    <span className="text-[11px] font-semibold text-emerald-400 truncate">
                                      {matchingBk.title}
                                    </span>
                                    <CalendarCheck className="h-3 w-3 text-emerald-400 shrink-0" />
                                  </div>
                                  <div className="flex items-center justify-between text-[9px] text-muted">
                                    <span className="text-emerald-300 font-medium">{matchingBk.status}</span>
                                    <span className="font-mono">
                                      {new Date(matchingBk.startAt).getUTCHours()}:00
                                    </span>
                                  </div>
                                </div>
                              )}

                              {/* 3. Available Empty Slot Hover Helper */}
                              {!matchingTt && !matchingBk && (
                                <div className="h-full w-full opacity-0 group-hover:opacity-100 flex items-center justify-center transition-opacity">
                                  <span className="text-[10px] text-primary flex items-center gap-0.5 font-medium">
                                    <Plus className="h-3 w-3" /> Book
                                  </span>
                                </div>
                              )}
                            </div>
                          );
                        })}
                      </div>
                    );
                  })}
                </div>
              </div>
            </Card>
          </div>
        ) : (
          /* ─── DAY VIEW LIST ─── */
          <div className="space-y-4">
            <Card className="p-4 bg-surface-2/20">
              <h3 className="text-sm font-semibold text-foreground mb-3 flex items-center gap-2">
                <Clock className="h-4 w-4 text-primary" />
                Schedule for {selectedDate.toISOString().slice(0, 10)} (UTC)
              </h3>

              <div className="space-y-2">
                {hours.map((hour) => {
                  const cellStartUtc = new Date(selectedDate);
                  cellStartUtc.setUTCHours(hour, 0, 0, 0);

                  // O(1) pre-indexed lookups
                  const slotKey = cellStartUtc.toISOString().slice(0, 13);
                  const matchingTt = scheduleIndex.ttMap.get(slotKey) ?? null;
                  const matchingBk = scheduleIndex.bkMap.get(slotKey) ?? null;

                  return (
                    <div
                      key={hour}
                      className={cn(
                        "p-3 rounded-[var(--radius-md)] border flex items-center justify-between gap-4 transition-colors",
                        matchingTt
                          ? "bg-primary/10 border-primary/40 text-foreground"
                          : matchingBk
                          ? "bg-emerald-500/10 border-emerald-500/30 text-foreground"
                          : "bg-surface border-border/60 hover:border-primary/40"
                      )}
                    >
                      <div className="flex items-center gap-3">
                        <span className="font-mono text-xs font-semibold text-muted w-14">
                          {String(hour).padStart(2, "0")}:00
                        </span>

                        {matchingTt && (
                          <div>
                            <div className="flex items-center gap-2">
                              <span className="font-bold text-primary-bright text-sm">
                                {matchingTt.courseCode} — {matchingTt.courseTitle}
                              </span>
                              <Badge variant="occupied" dot>
                                Institutional Curriculum
                              </Badge>
                            </div>
                            <p className="text-xs text-muted mt-0.5">
                              Instructor: {matchingTt.instructorName || "Faculty"} • Non-bookable institutional session
                            </p>
                          </div>
                        )}

                        {!matchingTt && matchingBk && (
                          <div>
                            <div className="flex items-center gap-2">
                              <span className="font-semibold text-emerald-400 text-sm">
                                {matchingBk.title}
                              </span>
                              <Badge variant="available" dot>
                                Reserved
                              </Badge>
                            </div>
                            <p className="text-xs text-muted mt-0.5">
                              Active Reservation • {matchingBk.status}
                            </p>
                          </div>
                        )}

                        {!matchingTt && !matchingBk && (
                          <div className="flex items-center gap-2">
                            <span className="text-sm font-medium text-muted">
                              Available for booking
                            </span>
                            <Badge variant="available">Open</Badge>
                          </div>
                        )}
                      </div>

                      <div>
                        {matchingTt ? (
                          <span className="text-xs text-muted flex items-center gap-1 font-medium">
                            <Lock className="h-3.5 w-3.5 text-primary" /> Locked
                          </span>
                        ) : matchingBk ? (
                          <span className="text-xs text-emerald-400 flex items-center gap-1 font-medium">
                            <CheckCircle2 className="h-3.5 w-3.5" /> Booked
                          </span>
                        ) : (
                          <Button
                            size="sm"
                            variant="secondary"
                            onClick={() => handleOpenBooking(selectedDate, hour)}
                          >
                            Reserve Slot
                          </Button>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </Card>
          </div>
        )}

        {/* Booking Modal */}
        <BookingModal
          open={isModalOpen}
          onClose={() => setIsModalOpen(false)}
          resource={activeResource}
          initialStartAt={modalSlot?.start}
          initialEndAt={modalSlot?.end}
          onSuccess={handleBookingSuccess}
        />
      </PageContainer>
    </div>
  );
}

export default function CalendarPage() {
  return (
    <Suspense
      fallback={
        <div className="min-h-full py-8 grid-background">
          <PageContainer>
            <Skeleton className="h-10 w-48 mb-6" />
            <Skeleton className="h-96 w-full" />
          </PageContainer>
        </div>
      }
    >
      <CalendarView />
    </Suspense>
  );
}
