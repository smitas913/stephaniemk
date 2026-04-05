import { addDays, differenceInCalendarDays } from "date-fns";
import { parseLocalDate, toLocalDateKey, getLocalToday } from "@/lib/dateOnly";
import { nextAvailableWeekday, type OOOPeriod, type WorkdayFlags, DEFAULT_WORKDAYS } from "@/lib/smartSchedule";

export type CadencePhase = "intensive" | "building" | "steady" | "graduated";

export interface CadenceInfo {
  phase: CadencePhase;
  label: string;
  sessionsPerWeek: number;
  daysBetweenSessions: number;
  daysSinceStart: number;
}

/**
 * Determine coaching cadence for a consultant based on days since their join date.
 * - Days 0–30:  3x/week  → every ~2 days
 * - Days 31–60: 2x/week  → every ~3 days
 * - Days 61–90: 1x/week  → every 7 days
 * - After 90:   graduated (no auto-cadence)
 */
export function getCadenceInfo(joinDateStr: string | null | undefined, today = getLocalToday()): CadenceInfo | null {
  if (!joinDateStr) return null;

  const joinDate = parseLocalDate(joinDateStr);
  if (isNaN(joinDate.getTime())) return null;

  const daysSinceStart = differenceInCalendarDays(today, joinDate);

  if (daysSinceStart < 0) {
    // Future start date — treat as intensive
    return { phase: "intensive", label: "Days 0–30 (3x/week)", sessionsPerWeek: 3, daysBetweenSessions: 2, daysSinceStart: 0 };
  }

  if (daysSinceStart <= 30) {
    return { phase: "intensive", label: "Days 0–30 (3x/week)", sessionsPerWeek: 3, daysBetweenSessions: 2, daysSinceStart };
  }

  if (daysSinceStart <= 60) {
    return { phase: "building", label: "Days 31–60 (2x/week)", sessionsPerWeek: 2, daysBetweenSessions: 3, daysSinceStart };
  }

  if (daysSinceStart <= 90) {
    return { phase: "steady", label: "Days 61–90 (1x/week)", sessionsPerWeek: 1, daysBetweenSessions: 7, daysSinceStart };
  }

  return { phase: "graduated", label: "After 90 days (manual)", sessionsPerWeek: 0, daysBetweenSessions: 0, daysSinceStart };
}

/**
 * Compute the next coaching date after completing a session.
 * Uses cadence spacing and ensures the date is always in the future (at least tomorrow).
 * Distributes across weekdays to avoid stacking.
 */
export function getNextCoachingDate(
  joinDateStr: string | null | undefined,
  currentCoachingDateStr: string | null | undefined,
  today = getLocalToday(),
  ooo: OOOPeriod | null = null,
  workdays: WorkdayFlags = DEFAULT_WORKDAYS,
): string | null {
  const cadence = getCadenceInfo(joinDateStr, today);
  if (!cadence || cadence.phase === "graduated") return null;

  const baseDate = currentCoachingDateStr ? parseLocalDate(currentCoachingDateStr) : today;
  const candidateDate = addDays(baseDate, cadence.daysBetweenSessions);

  const tomorrow = addDays(today, 1);
  const finalDate = candidateDate >= tomorrow ? candidateDate : tomorrow;

  return toLocalDateKey(nextAvailableWeekday(finalDate, ooo, new Set(), workdays));
}

/**
 * Auto-populate the initial coaching date for a new consultant.
 * Sets to tomorrow (or next weekday).
 */
export function getInitialCoachingDate(today = getLocalToday(), ooo: OOOPeriod | null = null, workdays: WorkdayFlags = DEFAULT_WORKDAYS): string {
  const candidate = addDays(today, 1);
  return toLocalDateKey(nextAvailableWeekday(candidate, ooo, new Set(), workdays));
}

/**
 * Snooze: push the next coaching date forward by the given number of days.
 */
export function snoozeCoachingDate(currentDateStr: string | null | undefined, snoozeDays: number, today = getLocalToday(), ooo: OOOPeriod | null = null, workdays: WorkdayFlags = DEFAULT_WORKDAYS): string {
  const baseDate = currentDateStr ? parseLocalDate(currentDateStr) : today;
  const candidate = addDays(baseDate, snoozeDays);
  const tomorrow = addDays(today, 1);
  const finalDate = candidate >= tomorrow ? candidate : tomorrow;

  return toLocalDateKey(nextAvailableWeekday(finalDate, ooo, new Set(), workdays));
}
