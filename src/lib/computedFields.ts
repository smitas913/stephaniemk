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

export function computeCustomerFields(customer: Customer, orders: Order[]): CustomerComputed {
  const isConsultant = customer.relationship_status === "Consultant";
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const yearStart = startOfYear(today);

  const lastOrderEffective = customer.last_order_date_order_log || customer.last_order_mk || null;
  const lastOrderDate = lastOrderEffective ? parseLocalDate(lastOrderEffective) : null;
  const lastContacted = customer.last_contacted ? parseLocalDate(customer.last_contacted) : null;
  const daysSinceContact = lastContacted ? differenceInDays(today, lastContacted) : null;
  const recentlyContacted = daysSinceContact !== null && daysSinceContact <= RECENT_CONTACT_DAYS;

  // --- Manual new customer flag (read from DB field) ---
  const isNew = !!(customer as any).new_customer_flag;

  // --- Activity status (skip for Consultants) ---
  let category = "";
  if (!isConsultant) {
    if (lastOrderDate) {
      const days = differenceInDays(today, lastOrderDate);
      if (days <= 90) category = "Active";
      else if (days <= 179) category = "Warm";
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
    } else if (category === "Warm") {
      // Warm customers: follow-up at ~45 days after last contact to encourage reorder
      const warmBase = lastContacted || lastOrderDate;
      nextFollowUp = addDays(warmBase, 45);
    } else if (category === "Active") {
      // Active customers: light maintenance at ~75 days
      const activeBase = lastContacted || lastOrderDate;
      nextFollowUp = addDays(activeBase, 75);
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
    followUpStatus = getFollowUpStatus(format(nextFollowUp, "yyyy-MM-dd"));
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
    } else if (daysSinceLastOrder !== null && daysSinceLastOrder >= 90) {
      followUpReason = "90+ Day Reorder";
    } else if (daysSinceLastOrder !== null && daysSinceLastOrder >= 75) {
      followUpReason = "90 Day Cycle";
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
