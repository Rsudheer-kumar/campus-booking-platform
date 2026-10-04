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
  AlertCircle,
  Eye,
} from "lucide-react";

import { PageContainer, PageHeader } from "@/components/layout";
import { Card, Badge, Button, Select, Skeleton } from "@/components/ui";
import { BookingModal } from "@/components/calendar/booking-modal";
import { TimetableDetailModal } from "@/components/calendar/timetable-detail-modal";
import { BookingDetailModal } from "@/components/calendar/booking-detail-modal";
import { CheckInModal } from "@/components/bookings/check-in-modal";
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

  // Modal interaction states
  const [isModalOpen, setIsModalOpen] = useState<boolean>(false);
  const [modalSlot, setModalSlot] = useState<{ start: string; end: string } | null>(null);
  const [selectedTimetable, setSelectedTimetable] = useState<TimetableEntry | null>(null);
  const [selectedBooking, setSelectedBooking] = useState<Reservation | null>(null);
  const [checkInModalBooking, setCheckInModalBooking] = useState<Reservation | null>(null);

  // 1. Fetch Resources — runs ONCE on mount only.
  const initialResourceIdRef = useRef<string | null>(null);
  useEffect(() => {
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
  }, []);

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
      const startAt = weekDays[0].toISOString();
      const endAt = new Date(weekDays[6].getTime() + 86400000 - 1).toISOString();

      const [ttRes, bkRes] = await Promise.all([
        api.timetables.list({
          resourceId: selectedResourceId,
          startAt,
          endAt,
        }),
        api.bookings.list({
          resourceId: selectedResourceId,
          startAt,
          endAt,
          limit: 100,
        }),
      ]);

      setTimetables(ttRes.entries || []);
      // Include all active bookings holding capacity on calendar (CONFIRMED, PENDING, CHECKED_IN)
      setBookings(
        (bkRes.bookings || []).filter(
          (b) =>
            b.status === "CONFIRMED" ||
            b.status === "PENDING" ||
            b.status === "CHECKED_IN"
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
    const currentTime = Date.now();
    const start = new Date(dayDate);
    start.setUTCHours(hour, 0, 0, 0);
    const end = new Date(dayDate);
    end.setUTCHours(hour + 1, 0, 0, 0);

    // If attempting to open a slot strictly in the past, refuse action
    if (end.getTime() <= currentTime) {
      return;
    }

    // If opening the current hour where start time is already in the past,
    // clamp start to the next valid future 15-minute mark so startAt is never in the past
    if (start.getTime() < currentTime) {
      const nowObj = new Date(currentTime);
      const nextMin = Math.ceil((nowObj.getUTCMinutes() + 1) / 15) * 15;
      start.setUTCHours(nowObj.getUTCHours(), nextMin, 0, 0);
      if (end.getTime() <= start.getTime()) {
        end.setTime(start.getTime() + 60 * 60 * 1000);
      }
    }

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
   * Pre-index schedule entries using authoritative mathematical half-open interval overlap:
   * [curHour, nextHour) overlaps [startAt, endAt) iff curHour < endAt && nextHour > startAt.
   *
   * Correctly maps non-hour-aligned intervals (e.g. 09:30–10:30 overlaps both 09:00 and 10:00),
   * respects adjacent boundaries (08:30–09:30 does not collide with 09:30–10:30),
   * and correctly indexes multi-hour sessions with O(1) cell lookup performance.
   */
  const scheduleIndex = useMemo(() => {
    const ttMap = new Map<string, TimetableEntry>();
    const bkMap = new Map<string, Reservation>();

    function getOverlappingSlotKeys(startAt: string | Date, endAt: string | Date): string[] {
      const s = new Date(startAt);
      const e = new Date(endAt);
      const keys: string[] = [];
      const cur = new Date(s);
      cur.setUTCMinutes(0, 0, 0);
      while (cur < e) {
        const nextHour = new Date(cur.getTime() + 3600000);
        if (cur < e && nextHour > s) {
          keys.push(cur.toISOString().slice(0, 13)); // "YYYY-MM-DDTHH"
        }
        cur.setTime(nextHour.getTime());
      }
      return keys;
    }

    for (const tt of timetables) {
      const keys = getOverlappingSlotKeys(tt.startAt, tt.endAt);
      for (const key of keys) {
        ttMap.set(key, tt);
      }
    }

    for (const bk of bookings) {
      const keys = getOverlappingSlotKeys(bk.startAt, bk.endAt);
      for (const key of keys) {
        if (!ttMap.has(key)) {
          bkMap.set(key, bk);
        }
      }
    }

    return { ttMap, bkMap };
  }, [timetables, bookings]);

  // Current timestamp snapshot for interval calculations
  const now = new Date();
  const todayStr = now.toISOString().slice(0, 10);

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
                Location: {activeResource.location?.building}, Floor {activeResource.location?.floor || "1"}, Room {activeResource.location?.roomNumber || activeResource.code}
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
            <div className="flex items-center justify-between">
              <div className="space-y-1">
                <div className="flex items-center gap-2">
                  <RefreshCw className="h-4 w-4 text-primary animate-spin" />
                  <span className="text-sm font-semibold text-foreground">
                    Loading Campus Schedule...
                  </span>
                </div>
                <p className="text-xs text-muted">
                  Retrieving institutional timetable constraints and reservations
                </p>
              </div>
              <Skeleton className="h-6 w-32" />
            </div>
            <div className="grid grid-cols-7 gap-2 pt-2">
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
                    const dayStr = d.toISOString().slice(0, 10);
                    const isToday = dayStr === todayStr;
                    const isPastDay = dayStr < todayStr;
                    const dayName = new Intl.DateTimeFormat("en-US", {
                      weekday: "short",
                      timeZone: "UTC",
                    }).format(d);
                    const dayNum = d.getUTCDate();

                    return (
                      <div
                        key={i}
                        className={cn(
                          "p-3 text-center border-r border-border/60 last:border-r-0 transition-colors",
                          isToday && "bg-primary/10 text-primary-bright font-bold",
                          isPastDay && "opacity-80 bg-surface-2/30"
                        )}
                      >
                        <div className="flex items-center justify-center gap-1.5">
                          <span className="block text-[11px] opacity-80 uppercase tracking-wider">
                            {dayName}
                          </span>
                          {isToday && (
                            <span className="px-1.5 py-0.2 rounded-full bg-primary/20 text-primary-bright text-[9px] font-bold uppercase tracking-wider">
                              Today
                            </span>
                          )}
                          {isPastDay && (
                            <span className="text-[9px] text-muted opacity-60 font-mono">
                              Past
                            </span>
                          )}
                        </div>
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
                          const slotStartUtc = new Date(dayDate);
                          slotStartUtc.setUTCHours(hour, 0, 0, 0);
                          const slotEndUtc = new Date(dayDate);
                          slotEndUtc.setUTCHours(hour + 1, 0, 0, 0);

                          const isPastCell = slotEndUtc.getTime() <= now.getTime();
                          const isCurrentCell =
                            slotStartUtc.getTime() <= now.getTime() &&
                            now.getTime() < slotEndUtc.getTime();

                          // O(1) pre-indexed lookups
                          const slotKey = slotStartUtc.toISOString().slice(0, 13);
                          const matchingTt = scheduleIndex.ttMap.get(slotKey) ?? null;
                          const matchingBk = scheduleIndex.bkMap.get(slotKey) ?? null;

                          return (
                            <div
                              key={dayIdx}
                              className={cn(
                                "border-r border-border/40 last:border-r-0 p-1 relative transition-colors select-none",
                                isPastCell && !matchingTt && !matchingBk
                                  ? "bg-surface-2/10 cursor-not-allowed opacity-60"
                                  : !matchingTt && !matchingBk
                                  ? "hover:bg-primary/5 cursor-pointer group"
                                  : "cursor-pointer"
                              )}
                              onClick={() => {
                                if (matchingTt) {
                                  setSelectedTimetable(matchingTt);
                                } else if (matchingBk) {
                                  setSelectedBooking(matchingBk);
                                } else if (!isPastCell) {
                                  handleOpenBooking(dayDate, hour);
                                }
                              }}
                            >
                              {/* 1. Academic Timetable Session (Interactive Detail Click) */}
                              {matchingTt && (
                                <div
                                  data-timetable-entry={matchingTt.courseCode}
                                  className={cn(
                                    "h-full w-full rounded-[var(--radius-sm)] p-1.5 border text-foreground flex flex-col justify-between shadow-sm transition-all hover:scale-[1.01] cursor-pointer",
                                    isCurrentCell
                                      ? "bg-gradient-to-br from-primary/35 to-[#1E293B] border-primary-bright ring-1 ring-primary/40 shadow-md"
                                      : isPastCell
                                      ? "bg-gradient-to-br from-primary/15 to-[#0F172A] border-primary/30 opacity-80"
                                      : "bg-gradient-to-br from-primary/25 to-[#1E293B] border-primary/50"
                                  )}
                                  title={`Academic Timetable: ${matchingTt.courseCode} - ${matchingTt.courseTitle} (Click for details)`}
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    setSelectedTimetable(matchingTt);
                                  }}
                                >
                                  <div>
                                    <div className="flex items-center justify-between gap-1">
                                      <span className="text-[11px] font-bold text-primary-bright truncate">
                                        {matchingTt.courseCode}
                                      </span>
                                      <div className="flex items-center gap-1">
                                        {isCurrentCell && (
                                          <span className="relative flex h-2 w-2">
                                            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-primary opacity-75"></span>
                                            <span className="relative inline-flex rounded-full h-2 w-2 bg-primary"></span>
                                          </span>
                                        )}
                                        <Lock className="h-3 w-3 text-primary-bright shrink-0" />
                                      </div>
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

                              {/* 2. User Reservation (Interactive Detail Click) */}
                              {!matchingTt && matchingBk && (
                                <div
                                  data-booking-entry={matchingBk._id}
                                  className={cn(
                                    "h-full w-full rounded-[var(--radius-sm)] p-1.5 border text-foreground flex flex-col justify-between transition-all hover:scale-[1.01] cursor-pointer",
                                    isCurrentCell
                                      ? "bg-emerald-500/25 border-emerald-400 ring-1 ring-emerald-400/40 shadow-sm"
                                      : isPastCell
                                      ? "bg-emerald-500/10 border-emerald-500/30 opacity-75"
                                      : "bg-emerald-500/15 border-emerald-500/40"
                                  )}
                                  title={`Reservation: ${matchingBk.title} (Click for details)`}
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    setSelectedBooking(matchingBk);
                                  }}
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
                                      {new Date(matchingBk.startAt).getUTCHours()}:
                                      {String(new Date(matchingBk.startAt).getUTCMinutes()).padStart(2, "0")}
                                    </span>
                                  </div>
                                </div>
                              )}

                              {/* 3. Empty Slot: Past (Unbookable) vs Future (Bookable) */}
                              {!matchingTt && !matchingBk && (
                                isPastCell ? (
                                  <div className="h-full w-full flex items-center justify-center">
                                    <span className="text-[10px] text-muted/30 font-mono select-none">
                                      —
                                    </span>
                                  </div>
                                ) : (
                                  <div className="h-full w-full opacity-0 group-hover:opacity-100 flex items-center justify-center transition-opacity">
                                    <span className="text-[10px] text-primary flex items-center gap-0.5 font-medium">
                                      <Plus className="h-3 w-3" /> Book
                                    </span>
                                  </div>
                                )
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
                  const cellEndUtc = new Date(selectedDate);
                  cellEndUtc.setUTCHours(hour + 1, 0, 0, 0);

                  const isPastCell = cellEndUtc.getTime() <= now.getTime();
                  const isCurrentCell =
                    cellStartUtc.getTime() <= now.getTime() &&
                    now.getTime() < cellEndUtc.getTime();

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
                          ? "bg-primary/10 border-primary/40 text-foreground cursor-pointer hover:border-primary/80"
                          : matchingBk
                          ? "bg-emerald-500/10 border-emerald-500/30 text-foreground cursor-pointer hover:border-emerald-400"
                          : isPastCell
                          ? "bg-surface-2/10 border-border/40 opacity-60 cursor-not-allowed"
                          : "bg-surface border-border/60 hover:border-primary/40"
                      )}
                      onClick={() => {
                        if (matchingTt) {
                          setSelectedTimetable(matchingTt);
                        } else if (matchingBk) {
                          setSelectedBooking(matchingBk);
                        }
                      }}
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
                              <Badge variant={isCurrentCell ? "occupied" : "neutral"} dot={isCurrentCell}>
                                {isCurrentCell ? "In Progress" : isPastCell ? "Completed" : "Institutional Session"}
                              </Badge>
                            </div>
                            <p className="text-xs text-muted mt-0.5">
                              Instructor: {matchingTt.instructorName || "Faculty"} • Click to view class details
                            </p>
                          </div>
                        )}

                        {!matchingTt && matchingBk && (
                          <div>
                            <div className="flex items-center gap-2">
                              <span className="semibold text-emerald-400 text-sm">
                                {matchingBk.title}
                              </span>
                              <Badge variant="available" dot={isCurrentCell}>
                                {matchingBk.status}
                              </Badge>
                            </div>
                            <p className="text-xs text-muted mt-0.5">
                              Active Reservation • Click to view reservation details
                            </p>
                          </div>
                        )}

                        {!matchingTt && !matchingBk && (
                          <div className="flex items-center gap-2">
                            <span className="text-sm font-medium text-muted">
                              {isPastCell ? "Past time slot" : "Available for booking"}
                            </span>
                            <Badge variant={isPastCell ? "neutral" : "available"}>
                              {isPastCell ? "Expired" : "Open"}
                            </Badge>
                          </div>
                        )}
                      </div>

                      <div>
                        {matchingTt ? (
                          <Button
                            size="sm"
                            variant="secondary"
                            onClick={(e) => {
                              e.stopPropagation();
                              setSelectedTimetable(matchingTt);
                            }}
                            className="text-xs"
                          >
                            <Eye className="h-3.5 w-3.5 mr-1" /> View Class
                          </Button>
                        ) : matchingBk ? (
                          <Button
                            size="sm"
                            variant="secondary"
                            onClick={(e) => {
                              e.stopPropagation();
                              setSelectedBooking(matchingBk);
                            }}
                            className="text-xs text-emerald-400"
                          >
                            <Eye className="h-3.5 w-3.5 mr-1" /> View Booking
                          </Button>
                        ) : isPastCell ? (
                          <Button size="sm" variant="secondary" disabled className="text-xs opacity-50">
                            Unbookable
                          </Button>
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

        {/* Timetable Class Detail Modal */}
        <TimetableDetailModal
          open={!!selectedTimetable}
          onClose={() => setSelectedTimetable(null)}
          entry={selectedTimetable}
          resource={activeResource}
        />

        {/* Booking Detail Modal */}
        <BookingDetailModal
          open={!!selectedBooking}
          onClose={() => setSelectedBooking(null)}
          booking={selectedBooking}
          resource={activeResource}
          onOpenCheckIn={(bk) => setCheckInModalBooking(bk)}
        />

        {/* Phase 3.3 Check-In Modal */}
        <CheckInModal
          open={!!checkInModalBooking}
          onClose={() => setCheckInModalBooking(null)}
          booking={checkInModalBooking}
          onSuccess={loadScheduleData}
        />

        {/* Booking Creation Modal */}
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
