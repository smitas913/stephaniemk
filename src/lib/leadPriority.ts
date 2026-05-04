// Lead priority classification based on attempts + last contact + status.
// HOT: 3-6 attempts AND last contact within 3-5 days AND status Working
// WARM: 1-2 attempts OR last contact within 5-10 days
// COLD: 0 attempts OR last contact >10 days
import { toLocalDateKey } from "./dateUtils";

export type LeadPriority = "hot" | "warm" | "cold";

export function getLeadPriority(params: {
  attempts: number;
  lastContactDate?: string | null;
  status?: string | null;
}): LeadPriority {
  const { attempts, lastContactDate, status } = params;
  const daysSince = (() => {
    if (!lastContactDate) return Infinity;
    const today = new Date(toLocalDateKey() + "T00:00:00");
    const last = new Date(lastContactDate.slice(0, 10) + "T00:00:00");
    return Math.floor((today.getTime() - last.getTime()) / 86400000);
  })();

  if (
    attempts >= 3 && attempts <= 6 &&
    daysSince >= 0 && daysSince <= 5 &&
    status === "Working"
  ) return "hot";

  if ((attempts >= 1 && attempts <= 2) || (daysSince > 0 && daysSince <= 10)) return "warm";

  return "cold";
}

export const PRIORITY_META: Record<LeadPriority, { icon: string; label: string; className: string }> = {
  hot: {
    icon: "🔥",
    label: "Hot",
    className: "bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-300",
  },
  warm: {
    icon: "⚡",
    label: "Warm",
    className: "bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300",
  },
  cold: {
    icon: "❄️",
    label: "Cold",
    className: "bg-sky-100 text-sky-700 dark:bg-sky-900/30 dark:text-sky-300",
  },
};
