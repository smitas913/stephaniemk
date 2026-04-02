import { differenceInDays, addDays, addMonths, isWeekend, nextMonday, startOfYear, parseISO, format, isBefore, isEqual } from "date-fns";
import type { Customer, Order, CustomerComputed } from "./types";

function toBusinessDay(d: Date): Date {
  return isWeekend(d) ? nextMonday(d) : d;
}

export function computeCustomerFields(customer: Customer, orders: Order[]): CustomerComputed {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const yearStart = startOfYear(today);

  const lastOrderEffective = customer.last_order_date_order_log || customer.last_order_mk || null;
  const lastOrderDate = lastOrderEffective ? parseISO(lastOrderEffective) : null;

  let newFirst90 = "";
  if (customer.profile_date_first_order_date) {
    const pd = parseISO(customer.profile_date_first_order_date);
    if (differenceInDays(today, pd) <= 90) newFirst90 = "New";
  }
  const isNew = newFirst90 === "New";

  let category = "";
  if (lastOrderDate) {
    const days = differenceInDays(today, lastOrderDate);
    if (days <= 180) category = "Active";
    else if (days <= 540) category = "Warm";
    else category = "Dormant";
  } else {
    category = "New";
  }

  const thisYearOrders = orders.filter((o) => {
    const d = parseISO(o.order_date);
    return d >= yearStart && d <= today;
  });
  const ordersThisYear = thisYearOrders.length;
  const retailThisYear = thisYearOrders.reduce((s, o) => s + Number(o.retail_amount || 0), 0);

  const last365 = addDays(today, -365);
  const recentOrders = orders.filter((o) => parseISO(o.order_date) >= last365);
  const recentTotal = recentOrders.reduce((s, o) => s + Number(o.retail_amount || 0), 0);
  const vip = recentOrders.length >= 3 && recentTotal >= 300 ? "VIP" : "";

  const daysSinceLastOrder = lastOrderDate ? differenceInDays(today, lastOrderDate) : null;

  let nextFollowUp: Date | null = null;
  if (lastOrderDate) {
    const stage = customer.new_follow_up_stage;
    const lastContacted = customer.last_contacted ? parseISO(customer.last_contacted) : null;
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
        nextFollowUp = lastOrderDate >= yearStart ? addDays(lastOrderDate, 90) : today;
      }
    }
    if (nextFollowUp) nextFollowUp = toBusinessDay(nextFollowUp);
  }

  let followUpStatus = "";
  if (nextFollowUp) {
    const nf = new Date(nextFollowUp);
    nf.setHours(0, 0, 0, 0);
    if (isBefore(nf, today)) followUpStatus = "OVERDUE";
    else if (isEqual(nf, today)) followUpStatus = "TODAY";
    else followUpStatus = "UPCOMING";
  }

  return {
    new_first_90_days: newFirst90,
    activity_status: category,
    vip,
    last_order_effective: lastOrderEffective,
    days_since_last_order: daysSinceLastOrder,
    orders_this_year: ordersThisYear,
    retail_this_year: retailThisYear,
    next_follow_up: nextFollowUp ? format(nextFollowUp, "yyyy-MM-dd") : null,
    follow_up_status: followUpStatus,
  };
}
