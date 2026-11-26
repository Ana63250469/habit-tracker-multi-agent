// Client-side mirror of the server's progress-date rules so invalid dates
// never trigger a progress request. Pure calendar math, no time zones.
// Dates are strictly "YYYY-MM-DD" with years 0001-9999.

export const PROGRESS_DATE_ERROR = "Enter a valid date in YYYY-MM-DD format";

const DATE_PATTERN = /^(\d{4})-(\d{2})-(\d{2})$/;
const MIN_YEAR = 1;
const MAX_YEAR = 9999;
const MIN_DAY_NUMBER = daysFromCivil(MIN_YEAR, 1, 1);
const MAX_DAY_NUMBER = daysFromCivil(MAX_YEAR, 12, 31);

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
  const yoe = y - era * 400;
  const doy = Math.floor((153 * (month + (month > 2 ? -3 : 9)) + 2) / 5) + day - 1;
  const doe = yoe * 365 + Math.floor(yoe / 4) - Math.floor(yoe / 100) + doy;
  return era * 146097 + doe - 719468;
}

/** Weekday with Monday = 0 ... Sunday = 6. */
export function weekdayMonday0(dayNumber: number): number {
  return (((dayNumber + 3) % 7) + 7) % 7;
}

export function isValidCalendarDateString(value: string): boolean {
  const match = DATE_PATTERN.exec(value);
  if (!match) return false;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  if (year < MIN_YEAR || year > MAX_YEAR) return false;
  if (month < 1 || month > 12) return false;
  if (day < 1 || day > daysInMonth(year, month)) return false;
  return true;
}

/**
 * A reference date is a valid progress date when it is a valid calendar date in
 * years 0001-9999 AND its complete containing week (Monday-Sunday) and complete
 * containing month have boundaries within 0001-01-01..9999-12-31.
 */
export function isValidProgressDate(value: string): boolean {
  if (!isValidCalendarDateString(value)) return false;
  const match = DATE_PATTERN.exec(value);
  if (!match) return false;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const z = daysFromCivil(year, month, day);
  const weekStartZ = z - weekdayMonday0(z);
  const weekEndZ = weekStartZ + 6;
  if (weekStartZ < MIN_DAY_NUMBER || weekEndZ > MAX_DAY_NUMBER) return false;
  const monthStartZ = daysFromCivil(year, month, 1);
  const monthEndZ = daysFromCivil(year, month, daysInMonth(year, month));
  if (monthStartZ < MIN_DAY_NUMBER || monthEndZ > MAX_DAY_NUMBER) return false;
  return true;
}

/** Today's date in the browser's local calendar, "YYYY-MM-DD". */
export function todayLocalISODate(now: Date = new Date()): string {
  const year = String(now.getFullYear()).padStart(4, "0");
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const day = String(now.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}
