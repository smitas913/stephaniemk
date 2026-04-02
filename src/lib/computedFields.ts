import { differenceInDays, addDays, addMonths, isWeekend, nextMonday, startOfYear, parseISO, format, isBefore, isEqual } from "date-fns";
import type { Customer, Order, CustomerComputed } from "./types";

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
  const lastOrderDate = lastOrderEffective ? parseISO(lastOrderEffective) : null;
  const lastContacted = customer.last_contacted ? parseISO(customer.last_contacted) : null;
  const daysSinceContact = lastContacted ? differenceInDays(today, lastContacted) : null;
  const recentlyContacted = daysSinceContact !== null && daysSinceContact <= RECENT_CONTACT_DAYS;

  // --- New customer flag ---
  let newFirst90 = "";
  if (customer.profile_date_first_order_date) {
    const pd = parseISO(customer.profile_date_first_order_date);
    if (differenceInDays(today, pd) <= 30) newFirst90 = "New";
  }
  const isNew = newFirst90 === "New";

  // --- Activity status (skip for Consultants) ---
  let category = "";
  if (!isConsultant) {
    if (lastOrderDate) {
      const days = differenceInDays(today, lastOrderDate);
      if (days <= 90) category = "Active";
      else if (days <= 179) category = "Warm";
      else category = "Dormant";
    } else {
      category = "New";
    }
  }

  // --- Year stats ---
  const thisYearOrders = orders.filter((o) => {
    const d = parseISO(o.order_date);
    return d >= yearStart && d <= today;
  });
  const ordersThisYear = thisYearOrders.length;
  const retailThisYear = thisYearOrders.reduce((s, o) => s + Number(o.retail_amount || 0), 0);

  // --- VIP ---
  const last365 = addDays(today, -365);
  const recentOrders = orders.filter((o) => parseISO(o.order_date) >= last365);
  const recentTotal = recentOrders.reduce((s, o) => s + Number(o.retail_amount || 0), 0);
  const vip = recentOrders.length >= 3 && recentTotal >= 300 ? "VIP" : "";

  const daysSinceLastOrder = lastOrderDate ? differenceInDays(today, lastOrderDate) : null;

  // --- Follow-up date calculation (skip for Consultants) ---
  let nextFollowUp: Date | null = null;
  const hasManualDate = !isConsultant && !!customer.next_follow_up_date;

  if (!isConsultant && hasManualDate) {
    nextFollowUp = parseISO(customer.next_follow_up_date!);
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
    } else {
      if (lastContacted) {
        nextFollowUp = addDays(lastContacted, 90);
      } else {
        // No contact history: use last order date to generate follow-up
        // regardless of whether the order is from this year
        nextFollowUp = addDays(lastOrderDate, 90);
      }
    }
    if (nextFollowUp) nextFollowUp = toBusinessDay(nextFollowUp);
  }

  // --- Follow-up status ---
  let followUpStatus = "";
  if (nextFollowUp) {
    const nf = new Date(nextFollowUp);
    nf.setHours(0, 0, 0, 0);
    if (isBefore(nf, today)) followUpStatus = "OVERDUE";
    else if (isEqual(nf, today)) followUpStatus = "TODAY";
    else followUpStatus = "UPCOMING";
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
    new_first_90_days: newFirst90,
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
