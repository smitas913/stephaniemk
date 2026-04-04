import { useState, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { fetchEvents, fetchProspects, fetchCustomers } from "@/lib/queries";
import type { EventRecord, Prospect, Customer } from "@/lib/types";
import { supabase } from "@/integrations/supabase/client";
import { toLocalDateKey } from "@/lib/dateOnly";
import Layout from "@/components/Layout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { TrendingUp, BarChart3, Repeat } from "lucide-react";
import { cn } from "@/lib/utils";
import {
  parseISO, isWithinInterval, startOfMonth, endOfMonth, startOfYear, subMonths, format,
  differenceInCalendarMonths,
} from "date-fns";

type TimeView = "this-month" | "ytd" | "all-time";

type MonthRow = {
  label: string;
  faces: number;
  parties: number;
  facials: number;
  sharings: number;
  newTeam: number;
  sales: number;
};

const inRange = (dateStr: string | null | undefined, s: Date, e: Date) => {
  if (!dateStr) return false;
  try {
    return isWithinInterval(parseISO(dateStr), { start: s, end: e });
  } catch {
    return false;
  }
};

export default function Analytics() {
  const [timeView, setTimeView] = useState<TimeView>("ytd");
  const { data: events = [], isLoading: evL } = useQuery({ queryKey: ["events"], queryFn: fetchEvents });
  const { data: orders = [], isLoading: orL } = useQuery({
    queryKey: ["all-orders-analytics"],
    queryFn: async () => {
      const { data, error } = await supabase.from("orders").select("customer_id, order_date, retail_amount").order("order_date", { ascending: false });
      if (error) throw error;
      return data as { customer_id: string; order_date: string; retail_amount: number }[];
    },
  });
  const { data: prospects = [], isLoading: prL } = useQuery({ queryKey: ["prospects"], queryFn: fetchProspects });
  const { data: customers = [], isLoading: cuL } = useQuery({ queryKey: ["customers"], queryFn: fetchCustomers });
  const isLoading = evL || orL || prL || cuL;

  const analytics = useMemo(() => {
    const now = new Date();

    // Determine how many months to show
    let monthCount: number;
    if (timeView === "this-month") {
      monthCount = 1;
    } else if (timeView === "ytd") {
      monthCount = now.getMonth() + 1; // Jan = 1, etc.
    } else {
      // all-time: find earliest event or order date
      let earliest = now;
      events.forEach((e) => {
        if (e.event_date) {
          const d = parseISO(e.event_date);
          if (d < earliest) earliest = d;
        }
      });
      orders.forEach((o) => {
        if (o.order_date) {
          const d = parseISO(o.order_date);
          if (d < earliest) earliest = d;
        }
      });
      monthCount = Math.max(differenceInCalendarMonths(now, earliest) + 1, 1);
      if (monthCount > 60) monthCount = 60; // cap at 5 years
    }

    // Build monthly rows
    const months: MonthRow[] = [];
    for (let i = monthCount - 1; i >= 0; i--) {
      const refDate = subMonths(now, i);
      const mStart = startOfMonth(refDate);
      const mEnd = endOfMonth(refDate);
      const mLabel = format(mStart, "MMM yyyy");
      // Count events as "held" if status is Held OR if date has passed and status is still Booked
      const isEffectivelyHeld = (e: EventRecord) =>
        e.event_status === "Held" || (e.event_status === "Booked" && e.event_date && e.event_date < toLocalDateKey());
      const mEvents = events.filter((e) => isEffectivelyHeld(e) && inRange(e.event_date, mStart, mEnd));
      const mOrders = orders.filter((o) => inRange(o.order_date, mStart, mEnd));
      const mSales = mOrders.reduce((s, o) => s + Number(o.retail_amount || 0), 0);

      months.push({
        label: mLabel,
        faces: mEvents.filter((e) => e.event_type === "Party" || e.event_type === "Facial").reduce((s, e) => s + Number(e.guest_count || 0), 0),
        parties: mEvents.filter((e) => e.event_type === "Party").length,
        facials: mEvents.filter((e) => e.event_type === "Facial").length,
        sharings: mEvents.reduce((s, e) => s + Number(e.sharing_appointments_count || 0), 0),
        newTeam: prospects.filter((p) =>
          (p.opportunity_status === "Joined" || p.opportunity_status === "Converted") && inRange(p.updated_at, mStart, mEnd)
        ).length,
        sales: mSales,
      });
    }

    // Compute averages
    const computeAvg = (rows: MonthRow[]): MonthRow => {
      const n = rows.length || 1;
      return {
        label: "",
        faces: Math.round(rows.reduce((s, r) => s + r.faces, 0) / n),
        parties: Math.round((rows.reduce((s, r) => s + r.parties, 0) / n) * 10) / 10,
        facials: Math.round((rows.reduce((s, r) => s + r.facials, 0) / n) * 10) / 10,
        sharings: Math.round((rows.reduce((s, r) => s + r.sharings, 0) / n) * 10) / 10,
        newTeam: Math.round((rows.reduce((s, r) => s + r.newTeam, 0) / n) * 10) / 10,
        sales: Math.round(rows.reduce((s, r) => s + r.sales, 0) / n),
      };
    };

    const averages: { label: string; data: MonthRow }[] = [];
    if (months.length >= 3) averages.push({ label: "3-Mo Avg", data: computeAvg(months.slice(-3)) });
    if (months.length >= 6) averages.push({ label: "6-Mo Avg", data: computeAvg(months.slice(-6)) });
    if (months.length >= 12) averages.push({ label: "12-Mo Avg", data: computeAvg(months.slice(-12)) });
    averages.push({ label: "All-Time Avg", data: computeAvg(months) });

    // Totals for selected view
    const totals: MonthRow = {
      label: "Total",
      faces: months.reduce((s, r) => s + r.faces, 0),
      parties: months.reduce((s, r) => s + r.parties, 0),
      facials: months.reduce((s, r) => s + r.facials, 0),
      sharings: months.reduce((s, r) => s + r.sharings, 0),
      newTeam: months.reduce((s, r) => s + r.newTeam, 0),
      sales: months.reduce((s, r) => s + r.sales, 0),
    };

    // Reorder rate: customers who ordered in selected period with 2+ lifetime orders / total unique customers in period
    // Determine date range for selected view
    let rangeStart: Date;
    const rangeEnd = endOfMonth(now);
    if (timeView === "this-month") {
      rangeStart = startOfMonth(now);
    } else if (timeView === "ytd") {
      rangeStart = startOfYear(now);
    } else {
      rangeStart = new Date(2000, 0, 1);
    }

    // Event conversion stats for period
    const todayStr = toLocalDateKey();
    const periodAllEvents = events.filter((e) => inRange(e.event_date, rangeStart, rangeEnd));
    const evBooked = periodAllEvents.length;
    const evHeld = periodAllEvents.filter((e) => e.event_status === "Held" || (e.event_status === "Booked" && e.event_date && e.event_date < todayStr)).length;
    const evCancelled = periodAllEvents.filter((e) => e.event_status === "Cancelled").length;
    const holdRate = evBooked > 0 ? Math.round((evHeld / evBooked) * 1000) / 10 : 0;
    const cancelRate = evBooked > 0 ? Math.round((evCancelled / evBooked) * 1000) / 10 : 0;

    const periodOrders = orders.filter((o) => inRange(o.order_date, rangeStart, rangeEnd) && Number(o.retail_amount || 0) > 0);
    const uniqueCustomerIds = [...new Set(periodOrders.map((o) => o.customer_id))];
    const consultantIds = new Set(
      customers.filter((c) => c.relationship_status === "Consultant" || c.relationship_status === "Former Consultant").map((c) => c.id)
    );
    const eligibleIds = uniqueCustomerIds.filter((id) => !consultantIds.has(id));
    const allOrdersByCustomer: Record<string, number> = {};
    orders.forEach((o) => {
      if (Number(o.retail_amount || 0) > 0) {
        allOrdersByCustomer[o.customer_id] = (allOrdersByCustomer[o.customer_id] || 0) + 1;
      }
    });
    const repeatCustomers = eligibleIds.filter((id) => (allOrdersByCustomer[id] || 0) >= 2).length;
    const reorderRate = eligibleIds.length > 0 ? Math.round((repeatCustomers / eligibleIds.length) * 1000) / 10 : 0;

    return { months, averages, totals, reorderRate, repeatCustomers, eligibleCount: eligibleIds.length, evBooked, evHeld, evCancelled, holdRate, cancelRate };
  }, [events, orders, prospects, customers, timeView]);

  const formatCurrency = (n: number) => `$${n.toLocaleString("en-US", { minimumFractionDigits: 0 })}`;

  const TIME_VIEW_LABELS: Record<TimeView, string> = {
    "this-month": "This Month",
    "ytd": "Year-to-Date",
    "all-time": "All-Time",
  };

  return (
    <Layout>
      <div className="max-w-5xl mx-auto space-y-6 pb-8">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
          <div>
            <h1 className="text-2xl font-bold text-foreground">Analytics</h1>
            <p className="text-sm text-muted-foreground mt-0.5">Long-term trends and performance patterns</p>
          </div>
          <Select value={timeView} onValueChange={(v) => setTimeView(v as TimeView)}>
            <SelectTrigger className="w-[180px]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="this-month">This Month</SelectItem>
              <SelectItem value="ytd">Year-to-Date</SelectItem>
              <SelectItem value="all-time">All-Time</SelectItem>
            </SelectContent>
          </Select>
        </div>

        {isLoading ? (
          <div className="flex items-center justify-center py-16">
            <div className="w-6 h-6 border-2 border-primary border-t-transparent rounded-full animate-spin" />
          </div>
        ) : (
          <div className="space-y-5">
            {/* Summary Cards */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              <Card className="border-border/50 shadow-sm">
                <CardContent className="p-4 text-center">
                  <p className="text-xs text-muted-foreground font-medium">Total Sales</p>
                  <p className="text-xl font-bold text-foreground mt-1">{formatCurrency(analytics.totals.sales)}</p>
                </CardContent>
              </Card>
              <Card className="border-border/50 shadow-sm">
                <CardContent className="p-4 text-center">
                  <p className="text-xs text-muted-foreground font-medium">Total Faces</p>
                  <p className="text-xl font-bold text-foreground mt-1">{analytics.totals.faces}</p>
                </CardContent>
              </Card>
              <Card className="border-border/50 shadow-sm">
                <CardContent className="p-4 text-center">
                  <p className="text-xs text-muted-foreground font-medium">Total Parties</p>
                  <p className="text-xl font-bold text-foreground mt-1">{analytics.totals.parties}</p>
                </CardContent>
              </Card>
              <Card className="border-border/50 shadow-sm">
                <CardContent className="p-4 text-center">
                  <p className="text-xs text-muted-foreground font-medium">Reorder Rate</p>
                  <p className="text-xl font-bold text-foreground mt-1">{analytics.reorderRate}%</p>
                  <p className="text-[10px] text-muted-foreground">{analytics.repeatCustomers} / {analytics.eligibleCount}</p>
                </CardContent>
              </Card>
            </div>

            {/* Event Pipeline */}
            <Card className="border-border/50 shadow-sm">
              <CardHeader className="pb-3">
                <div className="flex items-center gap-2">
                  <TrendingUp className="w-5 h-5 text-primary" />
                  <CardTitle className="text-base font-semibold text-foreground">Event Pipeline</CardTitle>
                </div>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-2 sm:grid-cols-5 gap-4">
                  <div className="text-center">
                    <p className="text-xl font-bold text-foreground tabular-nums">{analytics.evBooked}</p>
                    <p className="text-xs text-muted-foreground font-medium">Booked</p>
                  </div>
                  <div className="text-center">
                    <p className="text-xl font-bold text-primary tabular-nums">{analytics.evHeld}</p>
                    <p className="text-xs text-muted-foreground font-medium">Held</p>
                  </div>
                  <div className="text-center">
                    <p className="text-xl font-bold text-destructive tabular-nums">{analytics.evCancelled}</p>
                    <p className="text-xs text-muted-foreground font-medium">Cancelled</p>
                  </div>
                  <div className="text-center">
                    <p className="text-xl font-bold text-primary tabular-nums">{analytics.holdRate}%</p>
                    <p className="text-xs text-muted-foreground font-medium">Hold Rate</p>
                  </div>
                  <div className="text-center">
                    <p className="text-xl font-bold text-destructive tabular-nums">{analytics.cancelRate}%</p>
                    <p className="text-xs text-muted-foreground font-medium">Cancel Rate</p>
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* Monthly Trends Table */}
            <Card className="border-border/50 shadow-sm">
              <CardHeader className="pb-3">
                <div className="flex items-center gap-2">
                  <TrendingUp className="w-5 h-5 text-primary" />
                  <CardTitle className="text-base font-semibold text-foreground">
                    Monthly Trends — {TIME_VIEW_LABELS[timeView]}
                  </CardTitle>
                </div>
              </CardHeader>
              <CardContent className="p-0">
                <div className="overflow-auto">
                  <Table>
                    <TableHeader>
                      <TableRow className="bg-muted/30">
                        <TableHead className="text-xs">Month</TableHead>
                        <TableHead className="text-xs text-center">Faces</TableHead>
                        <TableHead className="text-xs text-center">Parties</TableHead>
                        <TableHead className="text-xs text-center">Sharings</TableHead>
                        <TableHead className="text-xs text-center">New Team</TableHead>
                        <TableHead className="text-xs text-right">Sales</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {analytics.months.map((row) => (
                        <TableRow key={row.label}>
                          <TableCell className="text-sm font-medium text-foreground whitespace-nowrap">{row.label}</TableCell>
                          <TableCell className="text-sm text-center tabular-nums">{row.faces}</TableCell>
                          <TableCell className="text-sm text-center tabular-nums">{row.parties}</TableCell>
                          <TableCell className="text-sm text-center tabular-nums">{row.sharings}</TableCell>
                          <TableCell className="text-sm text-center tabular-nums">{row.newTeam}</TableCell>
                          <TableCell className="text-sm text-right tabular-nums">{formatCurrency(row.sales)}</TableCell>
                        </TableRow>
                      ))}
                      {/* Totals row */}
                      <TableRow className="border-t-2 border-border bg-muted/30">
                        <TableCell className="text-sm font-bold text-foreground">Total</TableCell>
                        <TableCell className="text-sm text-center font-bold tabular-nums">{analytics.totals.faces}</TableCell>
                        <TableCell className="text-sm text-center font-bold tabular-nums">{analytics.totals.parties}</TableCell>
                        <TableCell className="text-sm text-center font-bold tabular-nums">{analytics.totals.sharings}</TableCell>
                        <TableCell className="text-sm text-center font-bold tabular-nums">{analytics.totals.newTeam}</TableCell>
                        <TableCell className="text-sm text-right font-bold tabular-nums">{formatCurrency(analytics.totals.sales)}</TableCell>
                      </TableRow>
                    </TableBody>
                  </Table>
                </div>
              </CardContent>
            </Card>

            {/* Averages */}
            <Card className="border-border/50 shadow-sm">
              <CardHeader className="pb-3">
                <div className="flex items-center gap-2">
                  <BarChart3 className="w-5 h-5 text-primary" />
                  <CardTitle className="text-base font-semibold text-foreground">Monthly Averages</CardTitle>
                </div>
              </CardHeader>
              <CardContent className="p-0">
                <div className="overflow-auto">
                  <Table>
                    <TableHeader>
                      <TableRow className="bg-muted/30">
                        <TableHead className="text-xs">Period</TableHead>
                        <TableHead className="text-xs text-center">Faces</TableHead>
                        <TableHead className="text-xs text-center">Parties</TableHead>
                        <TableHead className="text-xs text-center">Sharings</TableHead>
                        <TableHead className="text-xs text-center">New Team</TableHead>
                        <TableHead className="text-xs text-right">Sales</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {analytics.averages.map((avg) => (
                        <TableRow key={avg.label}>
                          <TableCell className="text-sm font-semibold text-foreground whitespace-nowrap">{avg.label}</TableCell>
                          <TableCell className="text-sm text-center tabular-nums">{avg.data.faces}</TableCell>
                          <TableCell className="text-sm text-center tabular-nums">{avg.data.parties}</TableCell>
                          <TableCell className="text-sm text-center tabular-nums">{avg.data.sharings}</TableCell>
                          <TableCell className="text-sm text-center tabular-nums">{avg.data.newTeam}</TableCell>
                          <TableCell className="text-sm text-right tabular-nums">{formatCurrency(avg.data.sales)}</TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              </CardContent>
            </Card>

            {/* Reorder Rate Detail */}
            <Card className="border-border/50 shadow-sm">
              <CardHeader className="pb-3">
                <div className="flex items-center gap-2">
                  <Repeat className="w-5 h-5 text-primary" />
                  <CardTitle className="text-base font-semibold text-foreground">Reorder Rate</CardTitle>
                </div>
              </CardHeader>
              <CardContent className="space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-sm text-muted-foreground">Repeat customers (2+ lifetime orders)</span>
                  <span className="text-sm font-semibold text-foreground">{analytics.repeatCustomers}</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-sm text-muted-foreground">Total unique customers in period</span>
                  <span className="text-sm font-semibold text-foreground">{analytics.eligibleCount}</span>
                </div>
                <div className="flex items-center justify-between pt-2 border-t border-border/30">
                  <span className="text-sm font-medium text-foreground">Reorder Rate</span>
                  <Badge variant="secondary" className="text-sm font-bold">{analytics.reorderRate}%</Badge>
                </div>
                <p className="text-xs text-muted-foreground">Excludes consultants. Based on customers who ordered in the selected period.</p>
              </CardContent>
            </Card>
          </div>
        )}
      </div>
    </Layout>
  );
}
