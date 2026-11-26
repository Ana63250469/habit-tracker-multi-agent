import { describe, it, expect } from "vitest";
import {
  civilFromDays,
  daysFromCivil,
  daysInMonth,
  formatCalendarDate,
  isLeapYear,
  isValidCalendarDateString,
  isValidProgressDate,
  monthlyPeriod,
  parseCalendarDate,
  weekdayMonday0,
  weeklyPeriod,
} from "../../src/lib/calendar";
import { computeAchieved, computePercentage, computeRemainingCount, periodBoundsFor } from "../../src/services/progress.service";

describe("calendar conversion round trips", () => {
  it("daysFromCivil/civilFromDays are inverses across years", () => {
    for (const [y, m, d] of [
      [1, 1, 1],
      [1, 12, 31],
      [4, 2, 29],
      [999, 6, 15],
      [1000, 1, 1],
      [1582, 10, 15],
      [1900, 3, 1],
      [1970, 1, 1],
      [2000, 2, 29],
      [2026, 11, 24],
      [2028, 2, 29],
      [9999, 12, 31],
    ] as const) {
      const z = daysFromCivil(y, m, d);
      expect(civilFromDays(z)).toEqual({ year: y, month: m, day: d });
      expect(formatCalendarDate(civilFromDays(z))).toBe(
        `${String(y).padStart(4, "0")}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`
      );
    }
  });

  it("1970-01-01 is day zero and a Thursday", () => {
    expect(daysFromCivil(1970, 1, 1)).toBe(0);
    expect(weekdayMonday0(0)).toBe(3);
  });

  it("known reference dates have the correct weekday", () => {
    // 2026-11-24 is a Tuesday; 2026-11-23 Monday; 2026-11-29 Sunday.
    expect(weekdayMonday0(daysFromCivil(2026, 11, 24))).toBe(1);
    expect(weekdayMonday0(daysFromCivil(2026, 11, 23))).toBe(0);
    expect(weekdayMonday0(daysFromCivil(2026, 11, 29))).toBe(6);
    // 0001-01-01 is a Monday in the proleptic Gregorian calendar.
    expect(weekdayMonday0(daysFromCivil(1, 1, 1))).toBe(0);
  });

  it("leap years follow the Gregorian rule", () => {
    expect(isLeapYear(4)).toBe(true);
    expect(isLeapYear(100)).toBe(false);
    expect(isLeapYear(400)).toBe(true);
    expect(isLeapYear(1900)).toBe(false);
    expect(isLeapYear(2000)).toBe(true);
    expect(isLeapYear(2028)).toBe(true);
    expect(isLeapYear(2026)).toBe(false);
    expect(daysInMonth(2028, 2)).toBe(29);
    expect(daysInMonth(2026, 2)).toBe(28);
    expect(daysInMonth(1, 2)).toBe(28);
  });
});

describe("parseCalendarDate", () => {
  it("accepts strict YYYY-MM-DD calendar dates in years 0001-9999", () => {
    expect(parseCalendarDate("0001-01-01")).toEqual({ year: 1, month: 1, day: 1 });
    expect(parseCalendarDate("9999-12-31")).toEqual({ year: 9999, month: 12, day: 31 });
    expect(parseCalendarDate("2028-02-29")).toEqual({ year: 2028, month: 2, day: 29 });
  });

  it.each([
    "",
    "2026-11-24T00:00:00Z",
    "2026-11-24 ",
    " 2026-11-24",
    "2026-11-24x",
    "24-11-2026",
    "20261124",
    "2026-1-01",
    "2026-01-1",
    "2026-11",
    "2026",
    "2026-00-10",
    "2026-13-01",
    "2026-01-00",
    "2026-01-32",
    "2026-02-29", // non-leap year
    "2026-02-30",
    "2028-02-30",
    "0000-01-01",
    "10000-01-01",
    "not-a-date",
  ])("rejects %j", (value) => {
    expect(parseCalendarDate(value)).toBeNull();
    expect(isValidCalendarDateString(value)).toBe(false);
  });

  it("rejects non-string values", () => {
    for (const value of [null, undefined, 123, {}, [], ["2026-11-24"], { date: "2026-11-24" }, true]) {
      expect(parseCalendarDate(value)).toBeNull();
    }
  });
});

describe("weekly and monthly periods", () => {
  it("weekly periods run Monday-Sunday inclusive", () => {
    expect(weeklyPeriod({ year: 2026, month: 11, day: 24 })).toEqual({ start: "2026-11-23", end: "2026-11-29" });
    expect(weeklyPeriod({ year: 2026, month: 11, day: 23 })).toEqual({ start: "2026-11-23", end: "2026-11-29" });
    expect(weeklyPeriod({ year: 2026, month: 11, day: 29 })).toEqual({ start: "2026-11-23", end: "2026-11-29" });
    expect(weeklyPeriod({ year: 2026, month: 11, day: 22 })).toEqual({ start: "2026-11-16", end: "2026-11-22" });
    expect(weeklyPeriod({ year: 2026, month: 11, day: 30 })).toEqual({ start: "2026-11-30", end: "2026-12-06" });
    // Week crossing a year boundary.
    expect(weeklyPeriod({ year: 2027, month: 1, day: 1 })).toEqual({ start: "2026-12-28", end: "2027-01-03" });
    expect(periodBoundsFor("WEEKLY", "2027-01-01")).toEqual({ start: "2026-12-28", end: "2027-01-03" });
  });

  it("monthly periods run first through last calendar day inclusive", () => {
    expect(monthlyPeriod({ year: 2026, month: 11, day: 24 })).toEqual({ start: "2026-11-01", end: "2026-11-30" });
    expect(monthlyPeriod({ year: 2028, month: 2, day: 15 })).toEqual({ start: "2028-02-01", end: "2028-02-29" });
    expect(monthlyPeriod({ year: 2026, month: 2, day: 15 })).toEqual({ start: "2026-02-01", end: "2026-02-28" });
    expect(periodBoundsFor("MONTHLY", "2026-11-24")).toEqual({ start: "2026-11-01", end: "2026-11-30" });
  });
});

describe("isValidProgressDate", () => {
  it("accepts valid dates whose complete containing week and month are in range", () => {
    expect(isValidProgressDate("2026-11-24")).toBe(true);
    expect(isValidProgressDate("2028-02-29")).toBe(true);
    expect(isValidProgressDate("0001-01-01")).toBe(true);
    expect(isValidProgressDate("0001-12-31")).toBe(true);
    // Last complete Monday-Sunday week fully inside years 0001-9999.
    const lastZ = daysFromCivil(9999, 12, 31);
    const lastSundayZ = lastZ - ((weekdayMonday0(lastZ) + 1) % 7); // last Sunday <= lastZ
    const weekStartZ = lastSundayZ - 6; // its Monday
    expect(isValidProgressDate(formatCalendarDate(civilFromDays(weekStartZ)))).toBe(true);
    // A reference whose containing week ends in year 10000 is rejected.
    expect(isValidProgressDate(formatCalendarDate(civilFromDays(weekStartZ + 7)))).toBe(false);
  });

  it("rejects invalid dates and non-strings", () => {
    for (const value of ["", "2026-02-30", "2026-13-01", "0000-01-01", "10000-01-01", "x", null, 5, [], {}]) {
      expect(isValidProgressDate(value)).toBe(false);
    }
  });

  it("rejects reference dates whose complete containing period leaves years 0001-9999", () => {
    // Depending on weekday, week may start in year 0000 or end in year 10000.
    const early = isValidProgressDate("0001-01-01") ? "0001-01-01" : null;
    expect(early).toBe("0001-01-01");
    // 9999-12-31: accepted only if its complete containing week stays in range.
    const lastZ = daysFromCivil(9999, 12, 31);
    const weekEndZ = lastZ - weekdayMonday0(lastZ) + 6;
    const lastDayZ = daysFromCivil(9999, 12, 31);
    if (weekEndZ > lastDayZ) {
      expect(isValidProgressDate("9999-12-31")).toBe(false);
    } else {
      expect(isValidProgressDate("9999-12-31")).toBe(true);
    }
  });
});

describe("progress calculations", () => {
  it("remainingCount = max(targetCount - completedCount, 0)", () => {
    expect(computeRemainingCount(3, 2)).toBe(1);
    expect(computeRemainingCount(3, 3)).toBe(0);
    expect(computeRemainingCount(3, 4)).toBe(0);
    expect(computeRemainingCount(3, 0)).toBe(3);
  });

  it("percentage = min(100, floor(completedCount / targetCount * 100))", () => {
    expect(computePercentage(3, 2)).toBe(66);
    expect(computePercentage(3, 3)).toBe(100);
    expect(computePercentage(3, 4)).toBe(100);
    expect(computePercentage(4, 2)).toBe(50);
    expect(computePercentage(3, 1)).toBe(33);
    expect(computePercentage(3, 0)).toBe(0);
    expect(computePercentage(7, 1)).toBe(14);
  });

  it("achieved = completedCount >= targetCount", () => {
    expect(computeAchieved(3, 2)).toBe(false);
    expect(computeAchieved(3, 3)).toBe(true);
    expect(computeAchieved(3, 4)).toBe(true);
    expect(computeAchieved(3, 0)).toBe(false);
  });
});
