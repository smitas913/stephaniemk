import { differenceInDays, addDays, addMonths, isWeekend, nextMonday, startOfYear, format } from "date-fns";
import type { Customer, Order, CustomerComputed } from "./types";
import { getFollowUpStatus } from "./dateOnly";

/** Parse a YYYY-MM-DD string as a LOCAL midnight date (not UTC). */
function parseLocalDate(dateStr: string): Date {
  const [y, m, d] = dateStr.split("-").map(Number);
  return new Date(y, m - 1, d);
}

function toBusinessDay(d: Date): Date {
  return isWeekend(d) ? nextMonday(d) : d;
}

const RECENT_CONTACT_DAYS = 7;

/** Activity tier cutoffs, measured in days since the most recent order. */
export const ACTIVE_MAX_DAYS = 120;
export const WARM_MAX_DAYS = 270;

/** Days before the catalog mail date for the "heads-up" text. */
export const CATALOG_HEADS_UP_LEAD_DAYS = 7;
/** Days after the catalog mail date for the "did it arrive?" follow-up text. */
export const CATALOG_FOLLOW_UP_LAG_DAYS = 5;
/** Maintenance interval used when no catalog mail date has been set yet. */
const MAINTENANCE_TOUCH_DAYS = 75;

export const CATALOG_REASONS = {
  headsUp: "Catalog Coming — Heads-Up Text",
  followUp: "Catalog Follow-Up Text",
  virtual: "Send Virtual Catalog Text",
} as const;

/**
 * Resolve the next catalog-driven touchpoint for an Active/Warm customer.
 *
 * PCP customers get two sequential touchpoints per catalog cycle (heads-up
 * before the mailing, follow-up after it); non-PCP customers get a single
 * virtual-catalog text on the mail date itself. Returns null once the cycle's
 * touchpoints are in the past, or when no catalog mail date is set — callers
 * then fall back to the normal maintenance cadence.
 */
export function getCatalogTouchpoint(
  catalogMailDate: string | null | undefined,
  isPcp: boolean,
  today: Date
): { date: Date; reason: string; kind: "heads_up" | "catalog_follow_up" | "virtual_catalog" } | null {
  if (!catalogMailDate) return null;
  const mail = parseLocalDate(catalogMailDate.slice(0, 10));
  if (isNaN(mail.getTime())) return null;

  if (!isPcp) {
    if (mail < today) return null;
    return { date: mail, reason: CATALOG_REASONS.virtual, kind: "virtual_catalog" };
  }

  const headsUp = addDays(mail, -CATALOG_HEADS_UP_LEAD_DAYS);
  const followUp = addDays(mail, CATALOG_FOLLOW_UP_LAG_DAYS);
  if (headsUp >= today) return { date: headsUp, reason: CATALOG_REASONS.headsUp, kind: "heads_up" };
  if (followUp >= today) return { date: followUp, reason: CATALOG_REASONS.followUp, kind: "catalog_follow_up" };
  return null;
}

/**
 * Compute derived customer fields.
 * @param referenceDate Optional "today" override. When provided (e.g., during Out of Office freeze),
 *   all time-based calculations (activity status, days-since-last-order, auto follow-up dates,
 *   follow-up status) are anchored to this date instead of the real-time clock. This prevents
 *   workflow accumulation while OOO is active.
 * @param catalogMailDate Optional global "next catalog mail date" (from user settings). When set,
 *   Active/Warm customers are scheduled off the catalog cycle instead of a fixed interval.
 */
export function computeCustomerFields(
  customer: Customer,
  orders: Order[],
  referenceDate?: Date,
  catalogMailDate?: string | null
): CustomerComputed {
  const isConsultant = customer.relationship_status === "Consultant";
  const today = referenceDate ? new Date(referenceDate) : new Date();
  today.setHours(0, 0, 0, 0);
  const yearStart = startOfYear(today);

  const lastOrderEffective = customer.last_order_date_order_log || customer.last_order_mk || null;
  const lastOrderDate = lastOrderEffective ? parseLocalDate(lastOrderEffective) : null;
  const lastContacted = customer.last_contacted ? parseLocalDate(customer.last_contacted) : null;
  const daysSinceContact = lastContacted ? differenceInDays(today, lastContacted) : null;
  const recentlyContacted = daysSinceContact !== null && daysSinceContact <= RECENT_CONTACT_DAYS;
  const isPcp = Array.isArray(customer.tags) && customer.tags.includes("PCP");

  // --- Manual new customer flag (read from DB field) ---
  const isNew = !!(customer as any).new_customer_flag;

  // --- Activity status (skip for Consultants) ---
  let category = "";
  if (!isConsultant) {
    if (lastOrderDate) {
      const days = differenceInDays(today, lastOrderDate);
      if (days <= ACTIVE_MAX_DAYS) category = "Active";
      else if (days <= WARM_MAX_DAYS) category = "Warm";
      else category = "Dormant";
    } else {
      category = "No Orders";
    }
  }

  // --- Year stats ---
  const thisYearOrders = orders.filter((o) => {
    const d = parseLocalDate(o.order_date);
    return d >= yearStart && d <= today;
  });
  const ordersThisYear = thisYearOrders.length;
  const retailThisYear = thisYearOrders.reduce((s, o) => s + Number(o.retail_amount || 0), 0);

  // --- VIP ---
  const last365 = addDays(today, -365);
  const recentOrders = orders.filter((o) => parseLocalDate(o.order_date) >= last365);
  const recentTotal = recentOrders.reduce((s, o) => s + Number(o.retail_amount || 0), 0);
  const vip = recentOrders.length >= 3 && recentTotal >= 300 ? "VIP" : "";

  const daysSinceLastOrder = lastOrderDate ? differenceInDays(today, lastOrderDate) : null;

  // --- Follow-up date calculation (skip for Consultants) ---
  let nextFollowUp: Date | null = null;
  const hasManualDate = !isConsultant && !!customer.next_follow_up_date;

  if (!isConsultant && hasManualDate) {
    nextFollowUp = parseLocalDate(customer.next_follow_up_date!);
  } else if (!isConsultant && lastOrderDate) {
    const stage = customer.new_follow_up_stage;
    const base = lastContacted || lastOrderDate;

    if (isNew) {
      if (stage === "Complete") {
        nextFollowUp = null;
      } else if (stage === "2 Day") {
        nextFollowUp = addDays(base, 2);
      } else if (stage === "2 Week") {
        nextFollowUp = addDays(base, 14);
      } else if (stage === "2 Month") {
        nextFollowUp = addMonths(base, 2);
      } else {
        nextFollowUp = lastContacted ? addDays(base, 14) : addDays(base, 2);
      }
    } else if (category === "Dormant" && customer.dormant_follow_up_stage) {
      // Dormant cadence: the date is managed via dormant_follow_up_stage + next_follow_up_date
      const dormantBase = lastContacted || lastOrderDate;
      if (customer.dormant_follow_up_stage === "Annual") {
        nextFollowUp = addDays(dormantBase, 365);
      } else {
        nextFollowUp = addDays(dormantBase, 5);
      }
    } else if (category === "Active" || category === "Warm") {
      // Active and Warm now share one cadence. When a catalog mail date is set,
      // the touch is driven off the catalog cycle; otherwise fall back to a
      // light maintenance interval from the last contact/order.
      if (catalogTouch) {
        nextFollowUp = catalogTouch.date;
      } else {
        const maintenanceBase = lastContacted || lastOrderDate;
        nextFollowUp = addDays(maintenanceBase, MAINTENANCE_TOUCH_DAYS);
      }
    } else {
      if (lastContacted) {
        nextFollowUp = addDays(lastContacted, 90);
      } else {
        nextFollowUp = addDays(lastOrderDate, 90);
      }
    }
    if (nextFollowUp) nextFollowUp = toBusinessDay(nextFollowUp);
  }

  // --- Follow-up status ---
  let followUpStatus = "";
  if (nextFollowUp) {
    followUpStatus = getFollowUpStatus(format(nextFollowUp, "yyyy-MM-dd"), format(today, "yyyy-MM-dd"));
  }

  // --- Follow-up reason (priority order) ---
  let followUpReason = "";
  const needsFollowUpReason = followUpStatus === "OVERDUE" || followUpStatus === "TODAY";

  // Also flag customers with no contact and 90+ day old orders even if
  // the computed follow-up date hasn't triggered yet
  const uncontactedOverdue = !isConsultant && !lastContacted && daysSinceLastOrder !== null && daysSinceLastOrder >= 90;
  if (uncontactedOverdue && !followUpStatus) {
    followUpStatus = "OVERDUE";
  }

  if (needsFollowUpReason || uncontactedOverdue) {
    if (hasManualDate) {
      followUpReason = "Manual Follow-Up";
    } else if (isNew) {
      const source = (customer as any).customer_source;
      followUpReason = source ? `New - ${source}` : "New - First Follow-Up";
    } else if (category === "Dormant" && customer.dormant_follow_up_stage) {
      const stageLabel = customer.dormant_follow_up_stage === "Annual" ? "Annual Check-In" : `Dormant Touch ${customer.dormant_follow_up_stage.replace("Stage ", "")}`;
      followUpReason = stageLabel;
    } else if (category === "Dormant") {
      followUpReason = "Dormant Reactivation";
    } else if (category === "Warm") {
      followUpReason = "Warm — Reorder Reminder";
    } else if (daysSinceLastOrder !== null && daysSinceLastOrder >= 90) {
      followUpReason = "90+ Day Reorder";
    } else if (daysSinceLastOrder !== null && daysSinceLastOrder >= 75) {
      followUpReason = "90 Day Cycle";
    } else if (category === "Active") {
      followUpReason = "Active — Check-In";
    } else if (vip) {
      followUpReason = "VIP Check-In";
    } else {
      followUpReason = "Customer Follow-Up";
    }
  }

  return {
    new_first_90_days: isNew ? "New" : "",
    activity_status: category,
    vip,
    last_order_effective: lastOrderEffective,
    days_since_last_order: daysSinceLastOrder,
    orders_this_year: ordersThisYear,
    retail_this_year: retailThisYear,
    next_follow_up: nextFollowUp ? format(nextFollowUp, "yyyy-MM-dd") : (uncontactedOverdue && lastOrderDate ? format(toBusinessDay(addDays(lastOrderDate, 90)), "yyyy-MM-dd") : null),
    follow_up_status: followUpStatus,
    follow_up_reason: followUpReason,
    recently_contacted: recentlyContacted,
  };
}
