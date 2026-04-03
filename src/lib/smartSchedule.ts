import { addDays, getYear, getMonth, getDate } from "date-fns";
import { toLocalDateKey, parseLocalDate, getLocalToday } from "@/lib/dateOnly";

/**
 * US federal holidays (fixed + computed).
 * Returns YYYY-MM-DD strings for a given year.
 */
function getHolidaysForYear(year: number): Set<string> {
  const pad = (n: number) => String(n).padStart(2, "0");
  const key = (m: number, d: number) => `${year}-${pad(m)}-${pad(d)}`;

  const holidays = new Set<string>();

  // Fixed holidays
  holidays.add(key(1, 1));   // New Year's Day
  holidays.add(key(7, 4));   // Independence Day
  holidays.add(key(12, 25)); // Christmas

  // Memorial Day — last Monday of May
  for (let d = 31; d >= 25; d--) {
    if (new Date(year, 4, d).getDay() === 1) { holidays.add(key(5, d)); break; }
  }

  // Labor Day — first Monday of September
  for (let d = 1; d <= 7; d++) {
    if (new Date(year, 8, d).getDay() === 1) { holidays.add(key(9, d)); break; }
  }

  // Thanksgiving — fourth Thursday of November
  let count = 0;
  for (let d = 1; d <= 30; d++) {
    if (new Date(year, 10, d).getDay() === 4) {
      count++;
      if (count === 4) { holidays.add(key(11, d)); break; }
    }
  }

  return holidays;
}

// Cache holidays per year
const holidayCache = new Map<number, Set<string>>();
function isHoliday(dateKey: string): boolean {
  const year = parseInt(dateKey.slice(0, 4), 10);
  if (!holidayCache.has(year)) holidayCache.set(year, getHolidaysForYear(year));
  return holidayCache.get(year)!.has(dateKey);
}

function isSunday(date: Date): boolean {
  return date.getDay() === 0;
}

export interface OOOPeriod {
  ooo_start_date: string | null;
  ooo_end_date: string | null;
}

function isInOOO(dateKey: string, ooo: OOOPeriod | null): boolean {
  if (!ooo?.ooo_start_date || !ooo?.ooo_end_date) return false;
  return dateKey >= ooo.ooo_start_date && dateKey <= ooo.ooo_end_date;
}

/**
 * Given a candidate date, advance it forward until it lands on a valid working day
 * (not Sunday, not a holiday, not in OOO).
 */
export function nextAvailableDay(candidate: Date, ooo: OOOPeriod | null = null): Date {
  let current = candidate;
  let safety = 0;
  while (safety < 60) {
    const key = toLocalDateKey(current);
    if (!isSunday(current) && !isHoliday(key) && !isInOOO(key, ooo)) {
      return current;
    }
    current = addDays(current, 1);
    safety++;
  }
  return current;
}

/**
 * Same as nextAvailableDay but also skips Saturdays (weekday-only scheduling).
 */
export function nextAvailableWeekday(candidate: Date, ooo: OOOPeriod | null = null): Date {
  let current = candidate;
  let safety = 0;
  while (safety < 60) {
    const key = toLocalDateKey(current);
    const day = current.getDay();
    if (day !== 0 && day !== 6 && !isHoliday(key) && !isInOOO(key, ooo)) {
      return current;
    }
    current = addDays(current, 1);
    safety++;
  }
  return current;
}

/**
 * Spread multiple dates forward so no single day gets more than `maxPerDay` tasks.
 * Takes an array of candidate date strings, returns adjusted date strings.
 */
export function spreadTasks(
  dates: string[],
  maxPerDay: number,
  ooo: OOOPeriod | null = null,
): string[] {
  const dayCount = new Map<string, number>();
  return dates.map((d) => {
    let candidate = parseLocalDate(d);
    candidate = nextAvailableWeekday(candidate, ooo);
    let key = toLocalDateKey(candidate);

    let safety = 0;
    while ((dayCount.get(key) ?? 0) >= maxPerDay && safety < 60) {
      candidate = addDays(candidate, 1);
      candidate = nextAvailableWeekday(candidate, ooo);
      key = toLocalDateKey(candidate);
      safety++;
    }

    dayCount.set(key, (dayCount.get(key) ?? 0) + 1);
    return key;
  });
}

/** Check if a date string falls on Sunday, holiday, or OOO */
export function isBlockedDay(dateStr: string, ooo: OOOPeriod | null = null): boolean {
  const d = parseLocalDate(dateStr);
  return isSunday(d) || isHoliday(dateStr) || isInOOO(dateStr, ooo);
}

/** Holiday list for display purposes */
export function getHolidayList(year: number): { date: string; name: string }[] {
  const pad = (n: number) => String(n).padStart(2, "0");
  const key = (m: number, d: number) => `${year}-${pad(m)}-${pad(d)}`;
  const list: { date: string; name: string }[] = [];

  list.push({ date: key(1, 1), name: "New Year's Day" });

  // Memorial Day
  for (let d = 31; d >= 25; d--) {
    if (new Date(year, 4, d).getDay() === 1) { list.push({ date: key(5, d), name: "Memorial Day" }); break; }
  }

  list.push({ date: key(7, 4), name: "Independence Day" });

  // Labor Day
  for (let d = 1; d <= 7; d++) {
    if (new Date(year, 8, d).getDay() === 1) { list.push({ date: key(9, d), name: "Labor Day" }); break; }
  }

  // Thanksgiving
  let count = 0;
  for (let d = 1; d <= 30; d++) {
    if (new Date(year, 10, d).getDay() === 4) {
      count++;
      if (count === 4) { list.push({ date: key(11, d), name: "Thanksgiving" }); break; }
    }
  }

  list.push({ date: key(12, 25), name: "Christmas" });
  return list;
}
