import { addDays, format } from "date-fns";

/**
 * Long-term maintenance touch interval — fixed 75 days for a predictable cadence.
 * Applied when a user completes/logs a real interaction without specifying a
 * follow-up date, OR explicitly selects "No follow-up needed". This keeps the
 * person inside the long-term nurture cycle instead of falling out of follow-up.
 *
 * Do NOT apply this to:
 *   - Anonymous quick logs (Momentum quick add)
 *   - Cancelled/closed panels with no saved activity
 *   - Skipped / Did Not Reach Out (those have their own +2d/+3d defer rule)
 */
export const LONG_TERM_TOUCH_DAYS = 75;

/**
 * Returns the resolved long-term follow-up date.
 * - If an existing pending follow-up is sooner (and still in the future),
 *   preserves it (priority override for PCP, sample, post-appt, etc.).
 * - Otherwise returns today + 75 days.
 *
 * @param existingFollowUp Current next_follow_up_date on the entity (YYYY-MM-DD or null)
 * @param today Optional reference date (for testing / OOO freeze). Defaults to now.
 */
export function resolveLongTermFollowUpDate(
  existingFollowUp?: string | null,
  today: Date = new Date()
): string {
  const longTermDate = format(addDays(today, LONG_TERM_TOUCH_DAYS), "yyyy-MM-dd");
  const todayKey = format(today, "yyyy-MM-dd");
  if (existingFollowUp && existingFollowUp > todayKey && existingFollowUp < longTermDate) {
    return existingFollowUp;
  }
  return longTermDate;
}
