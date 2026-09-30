/**
 * CampusFlow API - Timezone & Calendar Computation Utilities
 * Provides exact IANA timezone conversions, half-open interval overlap testing,
 * and deterministic quota period boundary generation.
 */

export interface ZonedTimeParts {
  year: number;
  month: number; // 1 - 12
  day: number;   // 1 - 31
  weekday: 'MONDAY' | 'TUESDAY' | 'WEDNESDAY' | 'THURSDAY' | 'FRIDAY' | 'SATURDAY' | 'SUNDAY';
  hour: number;  // 0 - 23
  minute: number;// 0 - 59
  timeString: string; // HH:mm
  dateString: string; // YYYY-MM-DD
}

/**
 * Extracts decomposed date and time components of a UTC Date when interpreted
 * in a specific authoritative IANA timezone.
 */
export function getZonedParts(date: Date, timeZone: string): ZonedTimeParts {
  const formatter = new Intl.DateTimeFormat('en-US', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    weekday: 'long',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hourCycle: 'h23',
  });

  const parts = formatter.formatToParts(date);
  const map: Record<string, string> = {};
  for (const part of parts) {
    map[part.type] = part.value;
  }

  const hour = parseInt(map.hour, 10);
  const minute = parseInt(map.minute, 10);
  const year = parseInt(map.year, 10);
  const month = parseInt(map.month, 10);
  const day = parseInt(map.day, 10);
  const weekday = map.weekday.toUpperCase() as ZonedTimeParts['weekday'];

  const timeString = `${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}`;
  const dateString = `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;

  return {
    year,
    month,
    day,
    weekday,
    hour,
    minute,
    timeString,
    dateString,
  };
}

/**
 * Converts a local calendar date string (YYYY-MM-DD) and a local 24-hr time string (00:00 - 24:00)
 * in an authoritative IANA timezone into an exact UTC Date instance.
 * Supports "24:00" as the end-of-day boundary (normalized to next day 00:00).
 */
export function zonedTimeToUtc(dateStr: string, timeStr: string, timeZone: string): Date {
  const [origYear, origMonth, origDay] = dateStr.split('-').map(Number);
  let year = origYear;
  let month = origMonth;
  let day = origDay;

  let hours: number;
  let minutes: number;

  if (timeStr === '24:00') {
    // 24:00 normalized to next day 00:00
    const nextDay = new Date(Date.UTC(year, month - 1, day + 1, 0, 0, 0));
    year = nextDay.getUTCFullYear();
    month = nextDay.getUTCMonth() + 1;
    day = nextDay.getUTCDate();
    hours = 0;
    minutes = 0;
  } else {
    const [h, m] = timeStr.split(':').map(Number);
    hours = h;
    minutes = m;
  }

  const guess = new Date(Date.UTC(year, month - 1, day, hours, minutes, 0));
  const parts = getZonedParts(guess, timeZone);
  const diff =
    Date.UTC(parts.year, parts.month - 1, parts.day, parts.hour, parts.minute) -
    Date.UTC(year, month - 1, day, hours, minutes);
  const result = new Date(guess.getTime() - diff);

  // Second-pass verification for DST boundary shifts
  const verifyParts = getZonedParts(result, timeZone);
  const verifyDiff =
    Date.UTC(verifyParts.year, verifyParts.month - 1, verifyParts.day, verifyParts.hour, verifyParts.minute) -
    Date.UTC(year, month - 1, day, hours, minutes);

  return new Date(result.getTime() - verifyDiff);
}

/**
 * Authoritative half-open interval overlap predicate.
 * Evaluates whether two intervals [startA, endA) and [startB, endB) overlap.
 * Invariant: start < end.
 * Overlap condition: startA < endB && endA > startB.
 */
export function intervalsOverlap(
  startA: Date | number,
  endA: Date | number,
  startB: Date | number,
  endB: Date | number
): boolean {
  const sA = startA instanceof Date ? startA.getTime() : startA;
  const eA = endA instanceof Date ? endA.getTime() : endA;
  const sB = startB instanceof Date ? startB.getTime() : startB;
  const eB = endB instanceof Date ? endB.getTime() : endB;

  return sA < eB && eA > sB;
}

export interface PeriodBounds {
  startAt: Date;
  endAt: Date;
}

/**
 * Computes deterministic half-open period boundaries [startAt, endAt) for a given
 * period (DAILY, WEEKLY, MONTHLY) relative to an instant Date in an authoritative IANA timezone.
 */
export function getPeriodBounds(
  period: 'DAILY' | 'WEEKLY' | 'MONTHLY',
  instant: Date,
  timeZone: string
): PeriodBounds {
  const parts = getZonedParts(instant, timeZone);
  const { year, month, day, weekday, dateString } = parts;

  if (period === 'DAILY') {
    return {
      startAt: zonedTimeToUtc(dateString, '00:00', timeZone),
      endAt: zonedTimeToUtc(dateString, '24:00', timeZone),
    };
  }

  if (period === 'WEEKLY') {
    const dayMap: Record<ZonedTimeParts['weekday'], number> = {
      MONDAY: 0,
      TUESDAY: 1,
      WEDNESDAY: 2,
      THURSDAY: 3,
      FRIDAY: 4,
      SATURDAY: 5,
      SUNDAY: 6,
    };
    const offset = dayMap[weekday];
    const monDateObj = new Date(Date.UTC(year, month - 1, day - offset));
    const sunDateObj = new Date(Date.UTC(year, month - 1, day + (6 - offset)));

    const monStr = `${monDateObj.getUTCFullYear()}-${String(monDateObj.getUTCMonth() + 1).padStart(2, '0')}-${String(monDateObj.getUTCDate()).padStart(2, '0')}`;
    const sunStr = `${sunDateObj.getUTCFullYear()}-${String(sunDateObj.getUTCMonth() + 1).padStart(2, '0')}-${String(sunDateObj.getUTCDate()).padStart(2, '0')}`;

    return {
      startAt: zonedTimeToUtc(monStr, '00:00', timeZone),
      endAt: zonedTimeToUtc(sunStr, '24:00', timeZone),
    };
  }

  if (period === 'MONTHLY') {
    const monthStartStr = `${year}-${String(month).padStart(2, '0')}-01`;
    const daysInMonth = new Date(Date.UTC(year, month, 0)).getUTCDate();
    const monthEndStr = `${year}-${String(month).padStart(2, '0')}-${String(daysInMonth).padStart(2, '0')}`;

    return {
      startAt: zonedTimeToUtc(monthStartStr, '00:00', timeZone),
      endAt: zonedTimeToUtc(monthEndStr, '24:00', timeZone),
    };
  }

  throw new Error(`Unsupported period: ${period}`);
}
