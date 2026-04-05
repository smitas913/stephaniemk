import { addDays } from "date-fns";
import { toLocalDateKey, parseLocalDate } from "@/lib/dateOnly";

/**
 * Compute Easter Sunday using the Anonymous Gregorian algorithm.
 * Returns { month (1-based), day } for the given year.
 */
function computeEaster(year: number): { month: number; day: number } {
  const a = year % 19;
  const b = Math.floor(year / 100);
  const c = year % 100;
  const d = Math.floor(b / 4);
  const e = b % 4;
  const f = Math.floor((b + 8) / 25);
  const g = Math.floor((b - f + 1) / 3);
  const h = (19 * a + b - d - g + 15) % 30;
  const i = Math.floor(c / 4);
  const k = c % 4;
  const l = (32 + 2 * e + 2 * i - h - k) % 7;
  const m = Math.floor((a + 11 * h + 22 * l) / 451);
  const month = Math.floor((h + l - 7 * m + 114) / 31);
  const day = ((h + l - 7 * m + 114) % 31) + 1;
  return { month, day };
}

/**
 * US holidays (fixed + computed) for a given year.
 */
function getHolidaysForYear(year: number): Set<string> {
  const pad = (n: number) => String(n).padStart(2, "0");
  const key = (m: number, d: number) => `${year}-${pad(m)}-${pad(d)}`;

  const holidays = new Set<string>();

  // Fixed holidays
  holidays.add(key(1, 1));   // New Year's Day
  holidays.add(key(7, 4));   // Independence Day
  holidays.add(key(12, 25)); // Christmas

  // Easter Sunday
  const easter = computeEaster(year);
  holidays.add(key(easter.month, easter.day));

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

/** Workday flags indexed by JS day number (0=Sun … 6=Sat). All true = default. */
export type WorkdayFlags = [boolean, boolean, boolean, boolean, boolean, boolean, boolean];

export const DEFAULT_WORKDAYS: WorkdayFlags = [true, true, true, true, true, true, true];

/** Build WorkdayFlags from schedule settings fields */
export function buildWorkdayFlags(settings: {
  workday_sunday?: boolean;
  workday_monday?: boolean;
  workday_tuesday?: boolean;
  workday_wednesday?: boolean;
  workday_thursday?: boolean;
  workday_friday?: boolean;
  workday_saturday?: boolean;
} | null | undefined): WorkdayFlags {
  if (!settings) return DEFAULT_WORKDAYS;
  return [
    settings.workday_sunday ?? true,   // 0 = Sunday
    settings.workday_monday ?? true,   // 1 = Monday
    settings.workday_tuesday ?? true,  // 2 = Tuesday
    settings.workday_wednesday ?? true,// 3 = Wednesday
    settings.workday_thursday ?? true, // 4 = Thursday
    settings.workday_friday ?? true,   // 5 = Friday
    settings.workday_saturday ?? true, // 6 = Saturday
  ];
}

function isNonWorkday(date: Date, workdays: WorkdayFlags): boolean {
  return !workdays[date.getDay()];
}

function isInOOO(dateKey: string, ooo: OOOPeriod | null): boolean {
  if (!ooo?.ooo_start_date || !ooo?.ooo_end_date) return false;
  return dateKey >= ooo.ooo_start_date && dateKey <= ooo.ooo_end_date;
}

function isCustomBlackout(dateKey: string, blackoutDates: Set<string>): boolean {
  return blackoutDates.has(dateKey);
}

/**
 * Given a candidate date, advance it forward until it lands on a valid working day
 * (not a non-workday, not a holiday, not in OOO, not a custom blackout day).
 */
export function nextAvailableDay(
  candidate: Date,
  ooo: OOOPeriod | null = null,
  blackoutDates: Set<string> = new Set(),
  workdays: WorkdayFlags = DEFAULT_WORKDAYS,
): Date {
  let current = candidate;
  let safety = 0;
  while (safety < 90) {
    const key = toLocalDateKey(current);
    if (!isNonWorkday(current, workdays) && !isHoliday(key) && !isInOOO(key, ooo) && !isCustomBlackout(key, blackoutDates)) {
      return current;
    }
    current = addDays(current, 1);
    safety++;
  }
  return current;
}

/**
 * Same as nextAvailableDay but also skips Saturdays (weekday-only scheduling).
 * When workday flags are provided, those take precedence over the default Sat/Sun skip.
 */
export function nextAvailableWeekday(
  candidate: Date,
  ooo: OOOPeriod | null = null,
  blackoutDates: Set<string> = new Set(),
  workdays: WorkdayFlags = DEFAULT_WORKDAYS,
): Date {
  let current = candidate;
  let safety = 0;
  while (safety < 90) {
    const key = toLocalDateKey(current);
    if (!isNonWorkday(current, workdays) && !isHoliday(key) && !isInOOO(key, ooo) && !isCustomBlackout(key, blackoutDates)) {
      return current;
    }
    current = addDays(current, 1);
    safety++;
  }
  return current;
}

/**
 * Spread multiple dates forward so no single day gets more than `maxPerDay` tasks.
 */
export function spreadTasks(
  dates: string[],
  maxPerDay: number,
  ooo: OOOPeriod | null = null,
  blackoutDates: Set<string> = new Set(),
  workdays: WorkdayFlags = DEFAULT_WORKDAYS,
): string[] {
  const dayCount = new Map<string, number>();
  return dates.map((d) => {
    let candidate = parseLocalDate(d);
    candidate = nextAvailableWeekday(candidate, ooo, blackoutDates, workdays);
    let key = toLocalDateKey(candidate);

    let safety = 0;
    while ((dayCount.get(key) ?? 0) >= maxPerDay && safety < 60) {
      candidate = addDays(candidate, 1);
      candidate = nextAvailableWeekday(candidate, ooo, blackoutDates, workdays);
      key = toLocalDateKey(candidate);
      safety++;
    }

    dayCount.set(key, (dayCount.get(key) ?? 0) + 1);
    return key;
  });
}

/** Check if a date string falls on a non-workday, holiday, OOO, or blackout */
export function isBlockedDay(
  dateStr: string,
  ooo: OOOPeriod | null = null,
  blackoutDates: Set<string> = new Set(),
  workdays: WorkdayFlags = DEFAULT_WORKDAYS,
): boolean {
  const d = parseLocalDate(dateStr);
  return isNonWorkday(d, workdays) || isHoliday(dateStr) || isInOOO(dateStr, ooo) || isCustomBlackout(dateStr, blackoutDates);
}

/** Check if today is a non-working day (for Today page messaging) */
export function isTodayNonWorkday(workdays: WorkdayFlags = DEFAULT_WORKDAYS): boolean {
  return !workdays[new Date().getDay()];
}

/** Holiday list for display purposes */
export function getHolidayList(year: number): { date: string; name: string }[] {
  const pad = (n: number) => String(n).padStart(2, "0");
  const key = (m: number, d: number) => `${year}-${pad(m)}-${pad(d)}`;
  const list: { date: string; name: string }[] = [];

  list.push({ date: key(1, 1), name: "New Year's Day" });

  // Easter
  const easter = computeEaster(year);
  list.push({ date: key(easter.month, easter.day), name: "Easter" });

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

  // Sort by date
  list.sort((a, b) => a.date.localeCompare(b.date));
  return list;
}
