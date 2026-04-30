import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  fetchCustomers,
  fetchOrders,
  fetchEvents,
  fetchAllLatestNotes,
} from "@/lib/queries";
import type { Customer, OrderWithCustomer, EventRecord, Note } from "@/lib/types";
import Layout from "@/components/Layout";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { useNavigate } from "react-router-dom";
import { cn } from "@/lib/utils";
import {
  TrendingUp,
  CalendarIcon,
  Users,
  MessageSquare,
  Calendar as CalendarLucide,
  Target,
  CheckCircle2,
  Gauge,
  ArrowRight,
} from "lucide-react";
import { parseISO, isWithinInterval, differenceInCalendarDays } from "date-fns";

import {
  usePeriodFilter,
  getDateRange,
  getPeriodLabel,
  MonthYearPicker,
  MONTHS,
  type PeriodValue,
} from "@/hooks/usePeriodFilter";

// ─── Helpers ───
function inRange(dateStr: string | null | undefined, start: Date, end: Date): boolean {
  if (!dateStr) return false;
  try {
    return isWithinInterval(parseISO(dateStr), { start, end });
  } catch {
    return false;
  }
}

function weeksInRange(start: Date, end: Date): number {
  const days = Math.max(1, differenceInCalendarDays(end, start) + 1);
  return Math.max(1, days / 7);
}

function useEfficiencyMetrics(
  customers: Customer[],
  orders: OrderWithCustomer[],
  events: EventRecord[],
  notes: Note[],
  period: PeriodValue,
) {
  return useMemo(() => {
    const { start, end } = getDateRange(period);
    const weeks = weeksInRange(start, end);

    // Period slices
    const periodEvents = events.filter((e) => inRange(e.event_date, start, end));
    const periodNotes = notes.filter((n) => inRange(n.note_date, start, end));

    // Bookings = newly created event records in the period
    const periodBookings = events.filter((e) => inRange(e.created_at, start, end));

    // ─── Activity averages (per week) ───
    const totalFacesHeld = periodEvents
      .filter((e) => e.event_status === "Held")
      .reduce((s, e) => s + Number(e.guest_count || 0), 0);
    const careerChats = periodNotes.filter((n) => n.result_type === "Career Chat").length;
    const bookingsCount = periodBookings.length;

    const avgFacesPerWeek = totalFacesHeld / weeks;
    const avgCareerChatsPerWeek = careerChats / weeks;
    const avgBookingsPerWeek = bookingsCount / weeks;

    // ─── Avg Faces per Event (held only) ───
    const heldEvents = periodEvents.filter((e) => e.event_status === "Held");
    const avgFacesPerEvent = heldEvents.length > 0 ? totalFacesHeld / heldEvents.length : 0;

    // ─── Booking Conversion Rate ───
    // Booking attempts logged → resulting booked events created within 30 days
    const bookingAttempts = periodNotes.filter(
      (n) => n.is_booking_attempt || n.result_type === "Booking Conversation",
    ).length;
    const conversionRate = bookingAttempts > 0 ? (bookingsCount / bookingAttempts) * 100 : 0;

    // ─── Follow-up Completion Rate ───
    // Customers + prospects whose next_follow_up_date fell in this period:
    // completed = had any non-dismissal note logged on/after the due date.
    // Approximation using customers (the most common follow-up surface).
    let dueCount = 0;
    let completedCount = 0;
    for (const c of customers) {
      if (!c.next_follow_up_date) continue;
      if (!inRange(c.next_follow_up_date, start, end)) continue;
      dueCount += 1;
      const due = parseISO(c.next_follow_up_date);
      const lastTouch = c.last_contacted ? parseISO(c.last_contacted) : null;
      if (lastTouch && lastTouch >= due) completedCount += 1;
    }
    const followUpCompletionRate = dueCount > 0 ? (completedCount / dueCount) * 100 : 0;

    // ─── Hold Rate (efficiency, not a duplicate of Dashboard actuals) ───
    const evBooked = periodEvents.length;
    const evHeld = heldEvents.length;
    const evCancelled = periodEvents.filter((e) => e.event_status === "Cancelled").length;
    const holdRate = evBooked > 0 ? (evHeld / evBooked) * 100 : 0;

    // ─── Reorder Rate ───
    const consultantIds = new Set(
      customers.filter((c) => c.relationship_status === "Consultant").map((c) => c.id),
    );
    const periodOrders = orders.filter((o) => inRange(o.order_date, start, end));
    const periodCustomerIds = new Set(
      periodOrders.map((o) => o.customer_id).filter((cid) => !consultantIds.has(cid)),
    );
    const lifetimeOrderCounts: Record<string, number> = {};
    for (const o of orders) {
      if (!consultantIds.has(o.customer_id)) {
        lifetimeOrderCounts[o.customer_id] = (lifetimeOrderCounts[o.customer_id] || 0) + 1;
      }
    }
    const totalOrderingCustomers = periodCustomerIds.size;
    const repeatCustomers = [...periodCustomerIds].filter(
      (cid) => (lifetimeOrderCounts[cid] || 0) >= 2,
    ).length;
    const reorderRate =
      totalOrderingCustomers > 0 ? (repeatCustomers / totalOrderingCustomers) * 100 : 0;

    return {
      weeks,
      avgFacesPerWeek,
      avgCareerChatsPerWeek,
      avgBookingsPerWeek,
      avgFacesPerEvent,
      conversionRate,
      bookingAttempts,
      bookingsCount,
      followUpCompletionRate,
      dueCount,
      completedCount,
      holdRate,
      evBooked,
      evHeld,
      evCancelled,
      reorderRate,
      repeatCustomers,
      totalOrderingCustomers,
      heldEventsCount: heldEvents.length,
      totalFacesHeld,
      careerChats,
    };
  }, [customers, orders, events, notes, period]);
}

// ─── Card primitives ───
function AverageCard({
  label,
  value,
  subtitle,
  icon: Icon,
}: {
  label: string;
  value: string;
  subtitle?: string;
  icon: React.ComponentType<{ className?: string }>;
}) {
  return (
    <Card className="border-border/50 shadow-sm">
      <CardContent className="p-4">
        <div className="flex items-center justify-between mb-2">
          <Icon className="w-5 h-5 text-primary" />
        </div>
        <p className="text-2xl font-bold tracking-tight text-foreground tabular-nums">{value}</p>
        <p className="text-[11px] font-semibold text-muted-foreground mt-1 uppercase tracking-wider">
          {label}
        </p>
        {subtitle && <p className="text-[11px] text-muted-foreground mt-1">{subtitle}</p>}
      </CardContent>
    </Card>
  );
}

function EfficiencyCard({
  label,
  value,
  subtitle,
  icon: Icon,
  emphasis,
}: {
  label: string;
  value: string;
  subtitle?: string;
  icon: React.ComponentType<{ className?: string }>;
  emphasis?: "good" | "warn" | "neutral";
}) {
  const accent =
    emphasis === "warn"
      ? "text-destructive"
      : emphasis === "good"
        ? "text-primary"
        : "text-foreground";
  return (
    <Card className="border-border/50 shadow-sm">
      <CardContent className="p-4">
        <div className="flex items-center justify-between mb-2">
          <Icon className={cn("w-5 h-5", accent)} />
        </div>
        <p className={cn("text-2xl font-bold tracking-tight tabular-nums", accent)}>{value}</p>
        <p className="text-[11px] font-semibold text-muted-foreground mt-1 uppercase tracking-wider">
          {label}
        </p>
        {subtitle && <p className="text-[11px] text-muted-foreground mt-1">{subtitle}</p>}
      </CardContent>
    </Card>
  );
}

// ─── Page ───
export default function FollowUpDashboard() {
  const navigate = useNavigate();
  const { period, setPeriod } = usePeriodFilter();
  const [monthPickerOpen, setMonthPickerOpen] = useState(false);

  const { data: customers = [], isLoading: cLoading } = useQuery({
    queryKey: ["customers"],
    queryFn: fetchCustomers,
  });
  const { data: allOrders = [], isLoading: oLoading } = useQuery({
    queryKey: ["orders"],
    queryFn: () => fetchOrders(),
  });
  const { data: allEvents = [] } = useQuery({ queryKey: ["events"], queryFn: fetchEvents });
  const { data: allNotes = [] } = useQuery({
    queryKey: ["notes-all"],
    queryFn: fetchAllLatestNotes,
  });
  const m = useEfficiencyMetrics(customers, allOrders, allEvents, allNotes, period);

  const isLoading = cLoading || oLoading;
  const weeksLabel = m.weeks >= 1 ? `${m.weeks.toFixed(1)} wk` : `${(m.weeks * 7).toFixed(0)} d`;

  return (
    <Layout>
      <div className="space-y-6">
        {/* Header */}
        <Card className="border-primary/20 shadow-sm bg-gradient-to-br from-primary/10 via-primary/5 to-transparent">
          <CardContent className="p-5 flex flex-col sm:flex-row sm:items-start gap-4">
            <div className="flex-1 space-y-1 min-w-0">
              <div className="flex items-center gap-2 text-primary">
                <Gauge className="w-4 h-4" />
                <span className="text-[11px] font-semibold uppercase tracking-wider">
                  Averages &amp; Efficiency
                </span>
              </div>
              <h2 className="text-xl font-bold tracking-tight text-foreground">
                How efficient is your business?
              </h2>
              <p className="text-xs text-muted-foreground">
                Trends and ratios over time. For current totals, see the{" "}
                <button
                  className="underline hover:text-primary"
                  onClick={() => navigate("/dashboard")}
                >
                  Dashboard
                </button>
                . For deeper breakdowns, see{" "}
                <button
                  className="underline hover:text-primary"
                  onClick={() => navigate("/analytics")}
                >
                  Analytics
                </button>
                .
              </p>
            </div>
            <Button
              onClick={() => navigate("/dashboard")}
              size="sm"
              variant="outline"
              className="text-xs shrink-0"
            >
              Back to Dashboard
              <ArrowRight className="w-3.5 h-3.5 ml-1" />
            </Button>
          </CardContent>
        </Card>

        {/* Period filter */}
        <div className="flex flex-col sm:flex-row sm:items-center gap-3">
          <div className="flex-1">
            <p className="text-sm text-muted-foreground">{getPeriodLabel(period)} · {weeksLabel}</p>
          </div>
          <div className="flex flex-wrap gap-1.5">
            <Button
              variant={period.type === "ytd" ? "default" : "outline"}
              size="sm"
              className="h-8 text-xs"
              onClick={() => setPeriod({ type: "ytd" })}
            >
              YTD
            </Button>
            <Button
              variant={period.type === "mtd" ? "default" : "outline"}
              size="sm"
              className="h-8 text-xs"
              onClick={() => setPeriod({ type: "mtd" })}
            >
              MTD
            </Button>
            <Button
              variant={period.type === "last-month" ? "default" : "outline"}
              size="sm"
              className="h-8 text-xs"
              onClick={() => setPeriod({ type: "last-month" })}
            >
              Last Month
            </Button>
            <Popover open={monthPickerOpen} onOpenChange={setMonthPickerOpen}>
              <PopoverTrigger asChild>
                <Button
                  variant={period.type === "month" ? "default" : "outline"}
                  size="sm"
                  className="h-8 text-xs"
                >
                  <CalendarIcon className="w-3.5 h-3.5 mr-1" />
                  {period.type === "month"
                    ? `${MONTHS[period.month].slice(0, 3)} ${period.year}`
                    : "Select Month..."}
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-auto p-0" align="end">
                <MonthYearPicker
                  onSelect={(year, month) => {
                    setPeriod({ type: "month", year, month });
                    setMonthPickerOpen(false);
                  }}
                />
              </PopoverContent>
            </Popover>
          </div>
        </div>

        {isLoading ? (
          <div className="flex items-center justify-center py-20">
            <div className="w-6 h-6 border-2 border-primary border-t-transparent rounded-full animate-spin" />
          </div>
        ) : (
          <>
            {/* Weekly Averages */}
            <Card className="border-border/50 shadow-sm">
              <CardHeader className="pb-3">
                <div className="flex items-center gap-2">
                  <TrendingUp className="w-5 h-5 text-primary" />
                  <CardTitle className="text-base font-semibold text-foreground">
                    Weekly Averages
                  </CardTitle>
                </div>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  <AverageCard
                    label="Avg Faces / Week"
                    value={m.avgFacesPerWeek.toFixed(1)}
                    subtitle={`${m.totalFacesHeld} held over ${weeksLabel}`}
                    icon={Users}
                  />
                  <AverageCard
                    label="Avg Career Chats / Week"
                    value={m.avgCareerChatsPerWeek.toFixed(1)}
                    subtitle={`${m.careerChats} chats over ${weeksLabel}`}
                    icon={MessageSquare}
                  />
                  <AverageCard
                    label="Avg Bookings / Week"
                    value={m.avgBookingsPerWeek.toFixed(1)}
                    subtitle={`${m.bookingsCount} new over ${weeksLabel}`}
                    icon={CalendarLucide}
                  />
                </div>
              </CardContent>
            </Card>

            {/* Efficiency Ratios */}
            <Card className="border-border/50 shadow-sm">
              <CardHeader className="pb-3">
                <div className="flex items-center gap-2">
                  <Target className="w-5 h-5 text-primary" />
                  <CardTitle className="text-base font-semibold text-foreground">
                    Efficiency Ratios
                  </CardTitle>
                </div>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                  <EfficiencyCard
                    label="Avg Faces / Event"
                    value={m.avgFacesPerEvent.toFixed(1)}
                    subtitle={`${m.totalFacesHeld} faces / ${m.heldEventsCount} held events`}
                    icon={Users}
                    emphasis="good"
                  />
                  <EfficiencyCard
                    label="Booking Conversion"
                    value={`${m.conversionRate.toFixed(1)}%`}
                    subtitle={`${m.bookingsCount} booked / ${m.bookingAttempts} attempts`}
                    icon={TrendingUp}
                    emphasis="good"
                  />
                  <EfficiencyCard
                    label="Follow-up Completion"
                    value={`${m.followUpCompletionRate.toFixed(1)}%`}
                    subtitle={`${m.completedCount} completed / ${m.dueCount} due`}
                    icon={CheckCircle2}
                    emphasis={
                      m.followUpCompletionRate >= 70
                        ? "good"
                        : m.followUpCompletionRate >= 40
                          ? "neutral"
                          : "warn"
                    }
                  />
                  <EfficiencyCard
                    label="Hold Rate"
                    value={`${m.holdRate.toFixed(1)}%`}
                    subtitle={`${m.evHeld} held / ${m.evBooked} booked · ${m.evCancelled} cancelled`}
                    icon={CalendarLucide}
                  />
                  <EfficiencyCard
                    label="Reorder Rate"
                    value={`${m.reorderRate.toFixed(1)}%`}
                    subtitle={`${m.repeatCustomers} / ${m.totalOrderingCustomers} customers`}
                    icon={Users}
                  />
                </div>
              </CardContent>
            </Card>

            {/* Footer hint */}
            <p className="text-xs text-muted-foreground text-center">
              Looking for raw totals or revenue? Visit the{" "}
              <button className="underline hover:text-primary" onClick={() => navigate("/dashboard")}>
                Dashboard
              </button>{" "}
              or{" "}
              <button className="underline hover:text-primary" onClick={() => navigate("/analytics")}>
                Analytics
              </button>
              .
            </p>
          </>
        )}
      </div>
    </Layout>
  );
}
