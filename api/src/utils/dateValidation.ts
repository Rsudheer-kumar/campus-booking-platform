/**
 * CampusFlow API - Date & Time Validation Helpers
 * Provides reusable helpers for calendar date validation and time-to-minutes conversions.
 */

/**
 * Validates whether a given string is a real calendar date in YYYY-MM-DD format.
 * Validates days per month, leap years, and calendar boundaries using standard ECMAScript Date.
 *
 * @param dateStr Date string in format YYYY-MM-DD
 * @returns boolean true if the date is valid and exists on the Gregorian calendar
 */
export function isValidCalendarDate(dateStr: string): boolean {
  if (!dateStr || typeof dateStr !== 'string') return false;

  const match = dateStr.match(/^(\d{4})-(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])$/);
  if (!match) return false;

  const year = parseInt(match[1], 10);
  const month = parseInt(match[2], 10); // 1 - 12
  const day = parseInt(match[3], 10);   // 1 - 31

  // Use setUTCFullYear to avoid legacy Date.UTC 2-digit year mapping (0-99 -> 1900-1999)
  const date = new Date(Date.UTC(2000, 0, 1));
  date.setUTCFullYear(year, month - 1, day);
  return (
    date.getUTCFullYear() === year &&
    date.getUTCMonth() === month - 1 &&
    date.getUTCDate() === day
  );
}

/**
 * Converts a 24-hour time string (00:00 through 24:00) to total minutes from start of day.
 * Supports "24:00" normalized to 1440 minutes.
 *
 * @param timeStr Time string in HH:mm format
 * @returns number Total minutes in range [0, 1440]
 */
export function timeStringToMinutes(timeStr: string): number {
  if (timeStr === '24:00') {
    return 1440;
  }
  const [hours, minutes] = timeStr.split(':').map((part) => parseInt(part, 10));
  return hours * 60 + minutes;
}

/**
 * Normalizes a department name by trimming leading/trailing whitespace and
 * collapsing internal consecutive whitespace down to a single space.
 * Preserves user-facing casing.
 *
 * @param dept Department string
 * @returns Normalized department string or undefined
 */
export function normalizeDepartmentName(dept?: string): string | undefined {
  if (!dept || typeof dept !== 'string') return undefined;
  const normalized = dept.trim().replace(/\s+/g, ' ');
  return normalized.length > 0 ? normalized : undefined;
}
