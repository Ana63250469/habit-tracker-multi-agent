// Pure calendar-date helpers. Dates are calendar dates in the proleptic Gregorian
// calendar; no time zones are involved. Internal day numbers count days since
// 1970-01-01 (can be negative). Calendar strings are strictly "YYYY-MM-DD"
// with years 0001-9999.

export interface CalendarDate {
  year: number;
  month: number; // 1-12
  day: number; // 1-31
}

export const MIN_YEAR = 1;
export const MAX_YEAR = 9999;

const DATE_PATTERN = /^(\d{4})-(\d{2})-(\d{2})$/;

// Day number of 0001-01-01 and 9999-12-31 in the proleptic Gregorian calendar.
export const MIN_DAY_NUMBER = daysFromCivil(MIN_YEAR, 1, 1);
export const MAX_DAY_NUMBER = daysFromCivil(MAX_YEAR, 12, 31);

export function isLeapYear(year: number): boolean {
  return year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0);
}

export function daysInMonth(year: number, month: number): number {
  switch (month) {
    case 1:
    case 3:
    case 5:
    case 7:
    case 8:
    case 10:
    case 12:
      return 31;
    case 4:
    case 6:
    case 9:
    case 11:
      return 30;
    case 2:
      return isLeapYear(year) ? 29 : 28;
    default:
      return 0;
  }
}

// Days from civil (Howard Hinnant's algorithm), proleptic Gregorian calendar.
export function daysFromCivil(year: number, month: number, day: number): number {
  const y = month <= 2 ? year - 1 : year;
  const era = Math.floor(y / 400);
  const yoe = y - era * 400; // [0, 399]
  const doy = Math.floor((153 * (month + (month > 2 ? -3 : 9)) + 2) / 5) + day - 1;
  const doe = yoe * 365 + Math.floor(yoe / 4) - Math.floor(yoe / 100) + doy;
  return era * 146097 + doe - 719468;
}

export function civilFromDays(dayNumber: number): CalendarDate {
  const z = dayNumber + 719468;
  const era = Math.floor(z / 146097);
  const doe = z - era * 146097; // [0, 146096]
  const yoe = Math.floor((doe - Math.floor(doe / 1460) + Math.floor(doe / 36524) - Math.floor(doe / 146096)) / 365); // [0, 399]
  const year = yoe + era * 400;
  const doy = doe - (365 * yoe + Math.floor(yoe / 4) - Math.floor(yoe / 100)); // [0, 365]
  const mp = Math.floor((5 * doy + 2) / 153); // [0, 11]
  const day = doy - Math.floor((153 * mp + 2) / 5) + 1; // [1, 31]
  const month = mp < 10 ? mp + 3 : mp - 9; // [1, 12]
  return { year: month <= 2 ? year + 1 : year, month, day };
}

/** Weekday with Monday = 0 ... Sunday = 6. 1970-01-01 was a Thursday. */
export function weekdayMonday0(dayNumber: number): number {
  return (((dayNumber + 3) % 7) + 7) % 7;
}

export function formatCalendarDate(date: CalendarDate): string {
  const year = String(date.year).padStart(4, "0");
  const month = String(date.month).padStart(2, "0");
  const day = String(date.day).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

/** Strictly parse "YYYY-MM-DD". Returns null for wrong format, impossible dates, years outside 0001-9999. */
export function parseCalendarDate(value: unknown): CalendarDate | null {
  if (typeof value !== "string") return null;
  const match = DATE_PATTERN.exec(value);
  if (!match) return null;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  if (year < MIN_YEAR || year > MAX_YEAR) return null;
  if (month < 1 || month > 12) return null;
  if (day < 1 || day > daysInMonth(year, month)) return null;
  return { year, month, day };
}

/** True if `value` is a strictly valid calendar date string in years 0001-9999. */
export function isValidCalendarDateString(value: string): boolean {
  return parseCalendarDate(value) !== null;
}

export interface PeriodBounds {
  start: string; // inclusive, YYYY-MM-DD
  end: string; // inclusive, YYYY-MM-DD
}

/** Weekly period: Monday-Sunday, inclusive, containing `ref`. */
export function weeklyPeriod(ref: CalendarDate): PeriodBounds {
  const z = daysFromCivil(ref.year, ref.month, ref.day);
  const startZ = z - weekdayMonday0(z);
  return {
    start: formatCalendarDate(civilFromDays(startZ)),
    end: formatCalendarDate(civilFromDays(startZ + 6)),
  };
}

/** Monthly period: first through last calendar day, inclusive, containing `ref`. */
export function monthlyPeriod(ref: CalendarDate): PeriodBounds {
  const start: CalendarDate = { year: ref.year, month: ref.month, day: 1 };
  const end: CalendarDate = { year: ref.year, month: ref.month, day: daysInMonth(ref.year, ref.month) };
  return { start: formatCalendarDate(start), end: formatCalendarDate(end) };
}

/**
 * A reference date is a valid progress date when it is a valid calendar date in
 * years 0001-9999 AND its complete containing week (Monday-Sunday) and complete
 * containing month have boundaries within 0001-01-01..9999-12-31.
 */
export function isValidProgressDate(value: unknown): value is string {
  const ref = parseCalendarDate(value);
  if (!ref) return false;
  const z = daysFromCivil(ref.year, ref.month, ref.day);
  const weekStartZ = z - weekdayMonday0(z);
  const weekEndZ = weekStartZ + 6;
  if (weekStartZ < MIN_DAY_NUMBER || weekEndZ > MAX_DAY_NUMBER) return false;
  // Containing month always lies within 0001..9999 for a valid reference, checked defensively.
  const monthStartZ = daysFromCivil(ref.year, ref.month, 1);
  const monthEndZ = daysFromCivil(ref.year, ref.month, daysInMonth(ref.year, ref.month));
  if (monthStartZ < MIN_DAY_NUMBER || monthEndZ > MAX_DAY_NUMBER) return false;
  return true;
}
