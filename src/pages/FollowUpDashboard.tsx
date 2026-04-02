import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { fetchCustomers, fetchOrders, fetchExpenses, fetchEvents } from "@/lib/queries";
import { computeCustomerFields } from "@/lib/computedFields";
import type { Customer, CustomerComputed, OrderWithCustomer, Expense, EventRecord } from "@/lib/types";
import Layout from "@/components/Layout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { useNavigate } from "react-router-dom";
import { cn } from "@/lib/utils";
import { DollarSign, TrendingUp, CalendarIcon, Receipt, Wallet, Users, PartyPopper, Sparkles, Crown, Star, RefreshCw, Target } from "lucide-react";
import { parseISO, isWithinInterval, startOfWeek, endOfWeek, startOfMonth, endOfMonth, differenceInDays } from "date-fns";
import { Progress } from "@/components/ui/progress";
import { usePeriodFilter, getDateRange, getShortLabel, getPeriodLabel, MonthYearPicker, MONTHS, type PeriodValue } from "@/hooks/usePeriodFilter";

type Enriched = Customer & CustomerComputed;

function useMetrics(customers: Customer[], orders: OrderWithCustomer[], expenses: Expense[], events: EventRecord[], period: PeriodValue) {
  return useMemo(() => {
    const { start, end } = getDateRange(period);

    const periodOrders = orders.filter((o) => {
      const d = parseISO(o.order_date);
      return isWithinInterval(d, { start, end });
    });

    const periodRevenue = periodOrders.reduce((s, o) => s + Number(o.retail_amount || 0), 0);

    const periodEvents = events.filter((e) => {
      if (!e.event_date) return false;
      const d = parseISO(e.event_date);
      return isWithinInterval(d, { start, end });
    });

    const totalFaces = periodEvents.reduce((s, e) => s + Number(e.guest_count || 0), 0);
    const totalParties = periodEvents.filter((e) => e.event_type === "Party").length;
    const totalFacials = periodEvents.filter((e) => e.event_type === "Facial").length;

    // Sales by order_type
    const salesByType = (type: string) =>
      periodOrders.filter((o) => o.order_type === type).reduce((s, o) => s + Number(o.retail_amount || 0), 0);
    const reorderSales = salesByType("Reorder");
    const partySales = salesByType("Party");
    const facialSales = salesByType("Facial");
    const otherSales = periodRevenue - reorderSales - partySales - facialSales;

    // Avg Face: Party + Facial sales / Party + Facial guest_count
    const partyFacialEvents = periodEvents.filter((e) => e.event_type === "Party" || e.event_type === "Facial");
    const partyFacialGuests = partyFacialEvents.reduce((s, e) => s + Number(e.guest_count || 0), 0);
    const partyFacialSales = partySales + facialSales;
    const avgFace = partyFacialGuests > 0 ? partyFacialSales / partyFacialGuests : 0;

    const periodExpenses = expenses.filter((e) => {
      const d = parseISO(e.expense_date);
      return isWithinInterval(d, { start, end });
    });
    const totalExpenses = periodExpenses.reduce((s, e) => s + Number(e.amount || 0), 0);

    const periodProfit = periodOrders.reduce((s, o) => {
      if (o.payment_type === "MyShop") return s + Number((o as any).payout_amount || 0);
      return s + (Number(o.retail_amount || 0) - Number((o as any).wholesale_amount || 0));
    }, 0);
    const netProfit = periodProfit - totalExpenses;

    const totalOrderingGuests = periodEvents.reduce((s, e) => s + Number(e.ordering_guest_count || 0), 0);
    const conversionRate = totalFaces > 0 ? (totalOrderingGuests / totalFaces) * 100 : 0;

    const customerOrderCounts: Record<string, number> = {};
    for (const o of periodOrders) {
      customerOrderCounts[o.customer_id] = (customerOrderCounts[o.customer_id] || 0) + 1;
    }
    const totalOrderingCustomers = Object.keys(customerOrderCounts).length;
    const repeatCustomers = Object.values(customerOrderCounts).filter((c) => c >= 2).length;
    const reorderRate = totalOrderingCustomers > 0 ? (repeatCustomers / totalOrderingCustomers) * 100 : 0;

    const enriched: Enriched[] = customers.map((c) => {
      const custOrders = periodOrders.filter((o) => o.customer_id === c.id);
      const custRetail = custOrders.reduce((s, o) => s + Number(o.retail_amount || 0), 0);
      const computed = computeCustomerFields(c, orders.filter((o) => o.customer_id === c.id));
      return { ...c, ...computed, retail_this_year: custRetail, orders_this_year: custOrders.length };
    });

    const topCustomers = [...enriched]
      .sort((a, b) => b.retail_this_year - a.retail_this_year)
      .slice(0, 5)
      .filter((c) => c.retail_this_year > 0);

    const todayStr = new Date().toISOString().slice(0, 10);
    const hostessAllEventsMap = new Map<string, { totalEvents: number; hasFuture: boolean }>();
    for (const evt of events) {
      const name = evt.hostess_name?.trim();
      if (!name) continue;
      const entry = hostessAllEventsMap.get(name) || { totalEvents: 0, hasFuture: false };
      entry.totalEvents += 1;
      if (evt.event_date && evt.event_date > todayStr) entry.hasFuture = true;
      hostessAllEventsMap.set(name, entry);
    }

    const hostessMap = new Map<string, { events: number; sales: number }>();
    for (const evt of periodEvents) {
      const name = evt.hostess_name?.trim();
      if (!name) continue;
      const entry = hostessMap.get(name) || { events: 0, sales: 0 };
      entry.events += 1;
      const linkedSales = periodOrders
        .filter((o) => o.parent_event_id === evt.event_id || o.event_id === evt.event_id)
        .reduce((s, o) => s + Number(o.retail_amount || 0), 0);
      entry.sales += linkedSales;
      hostessMap.set(name, entry);
    }
    const topHostesses = [...hostessMap.entries()]
      .map(([name, data]) => {
        const allData = hostessAllEventsMap.get(name);
        const isRepeat = (allData?.totalEvents ?? 0) >= 2;
        const needsRebooking = (allData?.totalEvents ?? 0) >= 1 && !(allData?.hasFuture);
        return { name, ...data, isRepeat, needsRebooking };
      })
      .sort((a, b) => b.sales - a.sales)
      .slice(0, 5)
      .filter((h) => h.sales > 0 || h.events > 0);

    return { periodRevenue, totalFaces, totalParties, totalFacials, avgFace, reorderSales, partySales, facialSales, otherSales, totalExpenses, netProfit, conversionRate, reorderRate, topCustomers, topHostesses };
  }, [customers, orders, expenses, events, period]);
}

function useScoreboard(events: EventRecord[]) {
  return useMemo(() => {
    const now = new Date();
    const weekStart = startOfWeek(now, { weekStartsOn: 1 });
    const weekEnd = endOfWeek(now, { weekStartsOn: 1 });
    const monthStart = startOfMonth(now);
    const monthEnd = endOfMonth(now);

    const inRange = (dateStr: string | null, s: Date, e: Date) => {
      if (!dateStr) return false;
      return isWithinInterval(parseISO(dateStr), { start: s, end: e });
    };

    const weekEvents = events.filter((e) => inRange(e.event_date, weekStart, weekEnd));
    const monthEvents = events.filter((e) => inRange(e.event_date, monthStart, monthEnd));

    const weekFaces = weekEvents.reduce((s, e) => s + Number(e.guest_count || 0), 0);
    const weekSharing = weekEvents.reduce((s, e) => s + Number(e.sharing_appointments_count || 0), 0);
    const monthParties = monthEvents.filter((e) => e.event_type === "Party").length;
    const monthFaces = monthEvents.reduce((s, e) => s + Number(e.guest_count || 0), 0);

    const dayOfWeek = differenceInDays(now, weekStart) + 1;
    const weekPace = dayOfWeek / 7;
    const dayOfMonth = now.getDate();
    const daysInMonth = differenceInDays(monthEnd, monthStart) + 1;
    const monthPace = dayOfMonth / daysInMonth;

    const getStatus = (current: number, goalMin: number, pace: number): "green" | "yellow" | "red" => {
      const expected = goalMin * pace;
      if (current >= goalMin) return "green";
      if (current >= expected * 0.8) return "green";
      if (current >= expected * 0.5) return "yellow";
      return "red";
    };

    type ScoreItem = { label: string; current: number; goalLabel: string; goalMin: number; pct: number; status: "green" | "yellow" | "red" };

    const weekly: ScoreItem[] = [
      { label: "Faces", current: weekFaces, goalLabel: "10", goalMin: 10, pct: Math.min((weekFaces / 10) * 100, 100), status: getStatus(weekFaces, 10, weekPace) },
      { label: "Sharing Appts", current: weekSharing, goalLabel: "5", goalMin: 5, pct: Math.min((weekSharing / 5) * 100, 100), status: getStatus(weekSharing, 5, weekPace) },
    ];

    const monthly: ScoreItem[] = [
      { label: "Parties", current: monthParties, goalLabel: "6–10", goalMin: 6, pct: Math.min((monthParties / 6) * 100, 100), status: getStatus(monthParties, 6, monthPace) },
      { label: "Faces", current: monthFaces, goalLabel: "40", goalMin: 40, pct: Math.min((monthFaces / 40) * 100, 100), status: getStatus(monthFaces, 40, monthPace) },
    ];

    return { weekly, monthly };
  }, [events]);
}

const STATUS_COLORS = {
  green: "text-green-600",
  yellow: "text-yellow-600",
  red: "text-red-600",
} as const;

const PROGRESS_COLORS = {
  green: "[&>div]:bg-green-500",
  yellow: "[&>div]:bg-yellow-500",
  red: "[&>div]:bg-red-500",
} as const;

export default function FollowUpDashboard() {
  const navigate = useNavigate();
  const { period, setPeriod } = usePeriodFilter();
  const [monthPickerOpen, setMonthPickerOpen] = useState(false);

  const { data: customers = [], isLoading: cLoading } = useQuery({ queryKey: ["customers"], queryFn: fetchCustomers });
  const { data: allOrders = [], isLoading: oLoading } = useQuery({ queryKey: ["orders"], queryFn: () => fetchOrders() });
  const { data: allExpenses = [] } = useQuery({ queryKey: ["expenses"], queryFn: fetchExpenses });
  const { data: allEvents = [] } = useQuery({ queryKey: ["events"], queryFn: fetchEvents });
  const m = useMetrics(customers, allOrders, allExpenses, allEvents, period);
  const scoreboard = useScoreboard(allEvents);
  const isLoading = cLoading || oLoading;

  const periodLabel = getShortLabel(period);

    const row1Cards = [
      { label: "Total Faces", value: String(m.totalFaces), icon: Users, accent: "text-primary" },
      { label: "Total Parties", value: String(m.totalParties), icon: PartyPopper, accent: "text-primary" },
      { label: "Total Facials", value: String(m.totalFacials), icon: Sparkles, accent: "text-primary" },
    ];

    const row2Cards = [
      { label: "Reorder Sales", value: `$${m.reorderSales.toFixed(2)}`, icon: DollarSign, accent: "text-primary" },
      { label: "Party Sales", value: `$${m.partySales.toFixed(2)}`, icon: PartyPopper, accent: "text-primary" },
      { label: "Facial Sales", value: `$${m.facialSales.toFixed(2)}`, icon: Sparkles, accent: "text-primary" },
      { label: "Other Sales", value: `$${m.otherSales.toFixed(2)}`, icon: DollarSign, accent: "text-muted-foreground" },
      { label: "Avg / Face", value: `$${m.avgFace.toFixed(2)}`, icon: TrendingUp, accent: "text-primary" },
    ];

    const row3Cards = [
      { label: "Total Sales", value: `$${m.periodRevenue.toFixed(2)}`, icon: DollarSign, accent: "text-primary" },
      { label: "Expenses", value: `$${m.totalExpenses.toFixed(2)}`, icon: Receipt, accent: "text-muted-foreground" },
      { label: "Profit", value: `$${m.netProfit.toFixed(2)}`, icon: Wallet, accent: m.netProfit >= 0 ? "text-primary" : "text-destructive" },
    ];

    const row4Cards = [
      { label: "Conversion Rate", value: `${m.conversionRate.toFixed(1)}%`, icon: TrendingUp, accent: "text-primary" },
      { label: "Reorder Rate", value: `${m.reorderRate.toFixed(1)}%`, icon: Users, accent: "text-primary" },
    ];

    return (
      <Layout>
        <div className="space-y-6">
          <div className="flex flex-col sm:flex-row sm:items-center gap-3">
            <div className="flex-1">
              <h2 className="text-2xl font-bold tracking-tight text-foreground">Dashboard</h2>
              <p className="text-sm text-muted-foreground mt-0.5">{getPeriodLabel(period)}</p>
            </div>
            <div className="flex flex-wrap gap-1.5">
              <Button variant={period.type === "ytd" ? "default" : "outline"} size="sm" className="h-8 text-xs" onClick={() => setPeriod({ type: "ytd" })}>YTD</Button>
              <Button variant={period.type === "mtd" ? "default" : "outline"} size="sm" className="h-8 text-xs" onClick={() => setPeriod({ type: "mtd" })}>MTD</Button>
              <Button variant={period.type === "last-month" ? "default" : "outline"} size="sm" className="h-8 text-xs" onClick={() => setPeriod({ type: "last-month" })}>Last Month</Button>
              <Popover open={monthPickerOpen} onOpenChange={setMonthPickerOpen}>
                <PopoverTrigger asChild>
                  <Button variant={period.type === "month" ? "default" : "outline"} size="sm" className="h-8 text-xs">
                    <CalendarIcon className="w-3.5 h-3.5 mr-1" />
                    {period.type === "month" ? `${MONTHS[period.month].slice(0, 3)} ${period.year}` : "Select Month..."}
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-auto p-0" align="end">
                  <MonthYearPicker onSelect={(year, month) => { setPeriod({ type: "month", year, month }); setMonthPickerOpen(false); }} />
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
              {/* Row 1: Activity Volume - most prominent */}
               <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                {row1Cards.map((k) => (
                  <Card key={k.label} className="border-primary/20 shadow-md bg-primary/5">
                    <CardContent className="p-5">
                      <div className="flex items-center justify-between mb-3">
                        <k.icon className={cn("w-6 h-6", k.accent)} />
                      </div>
                      <p className={cn("text-3xl sm:text-4xl font-bold tracking-tight", k.accent)}>{k.value}</p>
                      <p className="text-xs font-semibold text-muted-foreground mt-1.5 uppercase tracking-wider">{k.label}</p>
                    </CardContent>
                  </Card>
                ))}
              </div>

              {/* Scoreboard */}
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                <Card className="border-border/50 shadow-sm">
                  <CardHeader className="pb-2">
                    <div className="flex items-center gap-2">
                      <Target className="w-4 h-4 text-primary" />
                      <CardTitle className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">Weekly Scoreboard</CardTitle>
                    </div>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    {scoreboard.weekly.map((item) => (
                      <div key={item.label} className="space-y-1.5">
                        <div className="flex items-center justify-between">
                          <span className="text-sm font-medium text-foreground">{item.label}</span>
                          <span className={cn("text-sm font-bold", STATUS_COLORS[item.status])}>
                            {item.current} / {item.goalLabel}
                          </span>
                        </div>
                        <Progress value={item.pct} className={cn("h-2", PROGRESS_COLORS[item.status])} />
                      </div>
                    ))}
                  </CardContent>
                </Card>
                <Card className="border-border/50 shadow-sm">
                  <CardHeader className="pb-2">
                    <div className="flex items-center gap-2">
                      <Target className="w-4 h-4 text-primary" />
                      <CardTitle className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">Monthly Scoreboard</CardTitle>
                    </div>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    {scoreboard.monthly.map((item) => (
                      <div key={item.label} className="space-y-1.5">
                        <div className="flex items-center justify-between">
                          <span className="text-sm font-medium text-foreground">{item.label}</span>
                          <span className={cn("text-sm font-bold", STATUS_COLORS[item.status])}>
                            {item.current} / {item.goalLabel}
                          </span>
                        </div>
                        <Progress value={item.pct} className={cn("h-2", PROGRESS_COLORS[item.status])} />
                      </div>
                    ))}
                  </CardContent>
                </Card>
              </div>

              <div className="grid grid-cols-3 lg:grid-cols-5 gap-3">
                {row2Cards.map((k) => (
                  <Card key={k.label} className="border-border/50 shadow-sm">
                    <CardContent className="p-3.5">
                      <div className="flex items-center justify-between mb-1.5">
                        <k.icon className={cn("w-4 h-4", k.accent)} />
                      </div>
                      <p className={cn("text-xl font-bold tracking-tight", k.accent)}>{k.value}</p>
                      <p className="text-[11px] font-medium text-muted-foreground mt-1 uppercase tracking-wider">{k.label}</p>
                    </CardContent>
                  </Card>
                ))}
              </div>

              {/* Row 3: Financial - medium emphasis */}
              <div className="grid grid-cols-3 gap-4">
                {row3Cards.map((k) => (
                  <Card key={k.label} className="border-border/50 shadow-sm">
                    <CardContent className="p-4">
                      <div className="flex items-center justify-between mb-2">
                        <k.icon className={cn("w-5 h-5", k.accent)} />
                      </div>
                      <p className={cn("text-2xl font-bold tracking-tight", k.accent)}>{k.value}</p>
                      <p className="text-xs font-medium text-muted-foreground mt-1 uppercase tracking-wider">{k.label}</p>
                    </CardContent>
                  </Card>
                ))}
              </div>

              {/* Row 4: Efficiency - lighter */}
              <div className="grid grid-cols-2 gap-4">
                {row4Cards.map((k) => (
                  <Card key={k.label} className="border-border/30 shadow-none bg-muted/30">
                    <CardContent className="p-3 flex items-center gap-3">
                      <k.icon className={cn("w-4 h-4 shrink-0", k.accent)} />
                      <div>
                        <p className={cn("text-lg font-semibold tracking-tight", k.accent)}>{k.value}</p>
                        <p className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider">{k.label}</p>
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>

              {/* Top Customers & Top Hostesses */}
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                <Card className="border-border/50 shadow-sm">
                  <CardHeader className="pb-3">
                    <CardTitle className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">Top Customers ({periodLabel})</CardTitle>
                  </CardHeader>
                  <CardContent>
                    {m.topCustomers.length === 0 ? (
                      <p className="text-sm text-muted-foreground py-2">No orders this period</p>
                    ) : (
                      <div className="space-y-1">
                        {m.topCustomers.map((c, i) => (
                          <div key={c.id} className="flex items-center justify-between p-2.5 rounded-lg hover:bg-muted/50 cursor-pointer transition-colors" onClick={() => navigate(`/customers/${c.id}`)}>
                            <div className="flex items-center gap-3">
                              <span className="text-xs font-bold text-muted-foreground w-5">{i + 1}</span>
                              <div>
                                <p className="text-sm font-medium text-foreground">{c.full_name}</p>
                                <p className="text-xs text-muted-foreground">{c.orders_this_year} orders</p>
                              </div>
                            </div>
                            <p className="text-sm font-bold text-foreground">${c.retail_this_year.toFixed(2)}</p>
                          </div>
                        ))}
                      </div>
                    )}
                  </CardContent>
                </Card>

                <Card className="border-border/50 shadow-sm">
                  <CardHeader className="pb-3">
                    <div className="flex items-center gap-2">
                      <Crown className="w-4 h-4 text-primary" />
                      <CardTitle className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">Top Hostesses ({periodLabel})</CardTitle>
                    </div>
                  </CardHeader>
                  <CardContent>
                    {m.topHostesses.length === 0 ? (
                      <p className="text-sm text-muted-foreground py-2">No events with hostesses this period</p>
                    ) : (
                      <div className="space-y-1">
                        {m.topHostesses.map((h, i) => (
                          <div key={h.name} className="flex items-center justify-between p-2.5 rounded-lg hover:bg-muted/50 transition-colors">
                            <div className="flex items-center gap-3">
                              <span className="text-xs font-bold text-muted-foreground w-5">{i + 1}</span>
                              <div>
                                <p className="text-sm font-medium text-foreground flex items-center gap-1.5">
                                  {h.name}
                                  {h.isRepeat && (
                                    <span className="inline-flex items-center gap-0.5 text-[10px] px-1.5 py-0.5 rounded-full font-medium bg-amber-100 text-amber-700">
                                      <Star className="w-3 h-3 fill-current" />Repeat
                                    </span>
                                  )}
                                </p>
                                <div className="flex items-center gap-2">
                                  <p className="text-xs text-muted-foreground">{h.events} event{h.events !== 1 ? "s" : ""}</p>
                                  {h.needsRebooking && (
                                    <span className="inline-flex items-center gap-0.5 text-[10px] px-1.5 py-0.5 rounded-full font-medium bg-blue-100 text-blue-700">
                                      <RefreshCw className="w-3 h-3" />Rebook
                                    </span>
                                  )}
                                </div>
                              </div>
                            </div>
                            <p className="text-sm font-bold text-foreground">${h.sales.toFixed(2)}</p>
                          </div>
                        ))}
                      </div>
                    )}
                  </CardContent>
                </Card>
              </div>
            </>
          )}
        </div>
      </Layout>
    );
}
