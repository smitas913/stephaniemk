import { format } from "date-fns";

export type FollowUpStatus = "" | "OVERDUE" | "TODAY" | "UPCOMING";

export function parseLocalDate(dateStr: string): Date {
  const normalized = dateStr.trim().slice(0, 10);
  const [year, month, day] = normalized.split("-").map(Number);
  return new Date(year, month - 1, day);
}

export function getLocalToday(): Date {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  return today;
}

export function toLocalDateKey(date: Date = new Date()): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

export function normalizeDateOnly(dateStr: string | null | undefined): string | null {
  if (!dateStr) return null;

  const trimmed = dateStr.trim();
  if (!trimmed) return null;

  const isoMatch = trimmed.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/);
  if (isoMatch) {
    const [, year, month, day] = isoMatch;
    return `${year}-${month.padStart(2, "0")}-${day.padStart(2, "0")}`;
  }

  const parsed = parseLocalDate(trimmed);
  return Number.isNaN(parsed.getTime()) ? null : toLocalDateKey(parsed);
}

export function getDateOnlyTime(dateStr: string | null | undefined): number | null {
  const normalized = normalizeDateOnly(dateStr);
  if (!normalized) return null;

  const parsed = parseLocalDate(normalized);
  const time = parsed.getTime();
  return Number.isNaN(time) ? null : time;
}

export function compareDateOnly(dateStr: string | null | undefined, todayKey = toLocalDateKey(getLocalToday())): -1 | 0 | 1 | null {
  const normalized = normalizeDateOnly(dateStr);
  if (!normalized) return null;
  if (normalized < todayKey) return -1;
  if (normalized > todayKey) return 1;
  return 0;
}

export function getFollowUpStatus(dateStr: string | null | undefined, todayKey = toLocalDateKey(getLocalToday())): FollowUpStatus {
  const comparison = compareDateOnly(dateStr, todayKey);
  if (comparison === null) return "";
  if (comparison < 0) return "OVERDUE";
  if (comparison === 0) return "TODAY";
  return "UPCOMING";
}

export function isDueTodayOrEarlier(dateStr: string | null | undefined, todayKey = toLocalDateKey(getLocalToday())): boolean {
  const comparison = compareDateOnly(dateStr, todayKey);
  return comparison !== null && comparison <= 0;
}

export function getDaysOverdue(dateStr: string | null | undefined, today = getLocalToday()): number | null {
  const dueTime = getDateOnlyTime(dateStr);
  if (dueTime === null) return null;

  const todayTime = getLocalToday().getTime();
  if (dueTime >= todayTime) return null;
  return Math.floor((today.getTime() - dueTime) / (1000 * 60 * 60 * 24));
}

export function formatDateOnly(dateStr: string | null | undefined, pattern = "M/d/yyyy"): string {
  const normalized = normalizeDateOnly(dateStr);
  if (!normalized) return "—";
  return format(parseLocalDate(normalized), pattern);
}