/**
 * Birthdays can be known fully (year included) or only as a month/day.
 *
 * - `customers.birthday` (date) holds the full date when the year is known.
 * - `customers.birthday_mmdd` (text, "MM-DD") always holds the month/day, so
 *   birthday lists work even when the year was never collected.
 *
 * The DB merge/convert functions (merge_customers, merge_consultants,
 * merge_customer_into_consultant_impl, convert_person_impl) COALESCE both
 * columns, so keeping `birthday_mmdd` populated alongside a full `birthday`
 * is the consistent thing to do.
 */

const MONTH_NAME_TO_NUMBER: Record<string, number> = {
  jan: 1, january: 1, feb: 2, february: 2, mar: 3, march: 3, apr: 4, april: 4,
  may: 5, jun: 6, june: 6, jul: 7, july: 7, aug: 8, august: 8, sep: 9, sept: 9,
  september: 9, oct: 10, october: 10, nov: 11, november: 11, dec: 12, december: 12,
};

export const MONTH_LABELS = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

/** Tolerant parser: "MM-DD", "MM/DD", "YYYY-MM-DD", "Mar 4", "0304". */
export function parseBirthdayMMDD(mmdd: string | null | undefined): { month: number; day: number } | null {
  if (!mmdd) return null;
  const normalized = String(mmdd).trim();
  if (!normalized) return null;

  const monthNameMatch = normalized.match(/^([A-Za-z]+)\s+(\d{1,2})$/);
  if (monthNameMatch) {
    const month = MONTH_NAME_TO_NUMBER[monthNameMatch[1].toLowerCase()];
    const day = parseInt(monthNameMatch[2], 10);
    if (month && day >= 1 && day <= 31) return { month, day };
  }

  const isoLikeMatch = normalized.match(/^\d{4}-(\d{1,2})-(\d{1,2})$/);
  if (isoLikeMatch) {
    const month = parseInt(isoLikeMatch[1], 10);
    const day = parseInt(isoLikeMatch[2], 10);
    if (month >= 1 && month <= 12 && day >= 1 && day <= 31) return { month, day };
  }

  const slashOrDashMatch = normalized.match(/^(\d{1,2})[/-](\d{1,2})$/);
  if (slashOrDashMatch) {
    const month = parseInt(slashOrDashMatch[1], 10);
    const day = parseInt(slashOrDashMatch[2], 10);
    if (month >= 1 && month <= 12 && day >= 1 && day <= 31) return { month, day };
  }

  const cleaned = normalized.replace(/\D/g, "");
  if (cleaned.length < 3) return null;
  const month = parseInt(cleaned.slice(0, cleaned.length === 3 ? 1 : 2), 10);
  const day = parseInt(cleaned.slice(cleaned.length === 3 ? 1 : 2), 10);
  if (month < 1 || month > 12 || day < 1 || day > 31) return null;
  return { month, day };
}

/** Month/day for a person, reading `birthday_mmdd` first and falling back to the full date. */
export function birthdayMonthDay(person: {
  birthday?: string | null;
  birthday_mmdd?: string | null;
}): { month: number; day: number } | null {
  const fromMMDD = parseBirthdayMMDD(person.birthday_mmdd ?? null);
  if (fromMMDD) return fromMMDD;
  if (person.birthday) {
    const parts = person.birthday.slice(0, 10).split("-");
    if (parts.length === 3) {
      const month = parseInt(parts[1], 10);
      const day = parseInt(parts[2], 10);
      if (month >= 1 && month <= 12 && day >= 1 && day <= 31) return { month, day };
    }
  }
  return null;
}

/** Human label, e.g. "Mar 4, 1985" when the year is known, otherwise "Mar 4". */
export function formatBirthdayLabel(person: {
  birthday?: string | null;
  birthday_mmdd?: string | null;
}): string | null {
  const md = birthdayMonthDay(person);
  if (!md) return null;
  const short = MONTH_LABELS[md.month - 1].slice(0, 3);
  if (person.birthday) {
    const year = person.birthday.slice(0, 4);
    if (/^\d{4}$/.test(year)) return `${short} ${md.day}, ${year}`;
  }
  return `${short} ${md.day}`;
}

export type BirthdayMode = "full" | "month-day";

export type BirthdayValue = {
  mode: BirthdayMode;
  /** YYYY-MM-DD, used when mode === "full". */
  date: string;
  /** 1-12 as a string, used when mode === "month-day". */
  month: string;
  /** 1-31 as a string, used when mode === "month-day". */
  day: string;
};

export const EMPTY_BIRTHDAY_VALUE: BirthdayValue = { mode: "full", date: "", month: "", day: "" };

/** Seed the editor from an existing record (or a scanned date string). */
export function birthdayValueFromRecord(person: {
  birthday?: string | null;
  birthday_mmdd?: string | null;
}): BirthdayValue {
  const full = (person.birthday || "").slice(0, 10);
  if (/^\d{4}-\d{2}-\d{2}$/.test(full)) {
    const md = birthdayMonthDay(person);
    return { mode: "full", date: full, month: String(md?.month ?? ""), day: String(md?.day ?? "") };
  }
  const md = parseBirthdayMMDD(person.birthday_mmdd ?? null);
  if (md) return { mode: "month-day", date: "", month: String(md.month), day: String(md.day) };
  return EMPTY_BIRTHDAY_VALUE;
}

const pad = (n: number) => String(n).padStart(2, "0");

/** The two column values to persist for the current editor state. */
export function birthdayColumns(v: BirthdayValue): { birthday: string | null; birthday_mmdd: string | null } {
  if (v.mode === "full") {
    const full = (v.date || "").slice(0, 10);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(full)) return { birthday: null, birthday_mmdd: null };
    return { birthday: full, birthday_mmdd: `${full.slice(5, 7)}-${full.slice(8, 10)}` };
  }
  const month = parseInt(v.month, 10);
  const day = parseInt(v.day, 10);
  if (!month || !day || month < 1 || month > 12 || day < 1 || day > 31) {
    return { birthday: null, birthday_mmdd: null };
  }
  return { birthday: null, birthday_mmdd: `${pad(month)}-${pad(day)}` };
}

/** "MM-DD" from any loose birthday text, for keeping the column in sync. */
export function toBirthdayMMDD(loose: string | null | undefined): string | null {
  const md = parseBirthdayMMDD(loose);
  return md ? `${pad(md.month)}-${pad(md.day)}` : null;
}
