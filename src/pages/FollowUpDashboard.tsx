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
import { DollarSign, TrendingUp, CalendarIcon, Receipt, Wallet, Users, PartyPopper, Sparkles } from "lucide-react";
import { parseISO, isWithinInterval } from "date-fns";
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
    const avgFace = totalFaces > 0 ? periodRevenue / totalFaces : 0;

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

    // Conversion rate: ordering guests / total guests
    const totalOrderingGuests = periodEvents.reduce((s, e) => s + Number(e.ordering_guest_count || 0), 0);
    const conversionRate = totalFaces > 0 ? (totalOrderingGuests / totalFaces) * 100 : 0;

    // Reorder rate: customers with 2+ orders in period / customers with any orders
    const customerOrderCounts: Record<string, number> = {};
    for (const o of periodOrders) {
      customerOrderCounts[o.customer_id] = (customerOrderCounts[o.customer_id] || 0) + 1;
    }
    const totalOrderingCustomers = Object.keys(customerOrderCounts).length;
    const repeatCustomers = Object.values(customerOrderCounts).filter((c) => c >= 2).length;
    const reorderRate = totalOrderingCustomers > 0 ? (repeatCustomers / totalOrderingCustomers) * 100 : 0;

    const typeMap: Record<string, number> = {};
    for (const o of periodOrders) {
      const t = o.order_type || "Other";
      typeMap[t] = (typeMap[t] || 0) + 1;
    }
    const ordersBySource = ["Reorder", "Party", "Facial", "Other"].map((s) => ({
      label: s,
      count: typeMap[s] || 0,
    }));

    const payMap: Record<string, number> = {};
    for (const o of periodOrders) {
      const pt = o.payment_type || "None";
      payMap[pt] = (payMap[pt] || 0) + Number(o.retail_amount || 0);
    }
    const revenueByPayment = ["Cash", "Check", "Venmo", "Zelle", "Credit Card", "CashApp", "Paypal", "Other", "None"]
      .map((p) => ({ label: p, amount: payMap[p] || 0 }))
      .filter((p) => p.amount > 0);

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

    const needsFollowUp = enriched
      .filter((c) => c.follow_up_status === "OVERDUE" || c.follow_up_status === "TODAY" || (c.days_since_last_order !== null && c.days_since_last_order >= 45))
      .sort((a, b) => (b.days_since_last_order ?? 0) - (a.days_since_last_order ?? 0))
      .slice(0, 10);

    return { periodRevenue, totalFaces, totalParties, totalFacials, avgFace, totalExpenses, netProfit, conversionRate, reorderRate, ordersBySource, revenueByPayment, topCustomers, needsFollowUp };
  }, [customers, orders, expenses, events, period]);
}

export default function FollowUpDashboard() {
  const navigate = useNavigate();
  const { period, setPeriod } = usePeriodFilter();
  const [monthPickerOpen, setMonthPickerOpen] = useState(false);

  const { data: customers = [], isLoading: cLoading } = useQuery({ queryKey: ["customers"], queryFn: fetchCustomers });
  const { data: allOrders = [], isLoading: oLoading } = useQuery({ queryKey: ["orders"], queryFn: () => fetchOrders() });
  const { data: allExpenses = [] } = useQuery({ queryKey: ["expenses"], queryFn: fetchExpenses });
  const { data: allEvents = [] } = useQuery({ queryKey: ["events"], queryFn: fetchEvents });
  const m = useMetrics(customers, allOrders, allExpenses, allEvents, period);
  const isLoading = cLoading || oLoading;

  const periodLabel = getShortLabel(period);

  const activityCards = [
    { label: "Total Faces", value: String(m.totalFaces), icon: Users, accent: "text-primary" },
    { label: "Total Parties", value: String(m.totalParties), icon: PartyPopper, accent: "text-primary" },
    { label: "Total Facials", value: String(m.totalFacials), icon: Sparkles, accent: "text-primary" },
    { label: "Avg / Face", value: `$${m.avgFace.toFixed(2)}`, icon: TrendingUp, accent: "text-primary" },
  ];

  const financialCards = [
    { label: "Total Sales", value: `$${m.periodRevenue.toFixed(2)}`, icon: DollarSign, accent: "text-primary" },
    { label: "Expenses", value: `$${m.totalExpenses.toFixed(2)}`, icon: Receipt, accent: "text-muted-foreground" },
    { label: "Net Profit", value: `$${m.netProfit.toFixed(2)}`, icon: Wallet, accent: m.netProfit >= 0 ? "text-primary" : "text-destructive" },
  ];

  const performanceCards = [
    { label: "Conversion Rate", value: `${m.conversionRate.toFixed(1)}%`, icon: TrendingUp, accent: "text-primary" },
    { label: "Reorder Rate", value: `${m.reorderRate.toFixed(1)}%`, icon: Users, accent: "text-primary" },
  ];

  return (
    <Layout>
      <div className="space-y-8">
        <div className="flex flex-col sm:flex-row sm:items-center gap-3">
          <div className="flex-1">
            <h2 className="text-2xl font-bold tracking-tight text-foreground">Dashboard</h2>
            <p className="text-sm text-muted-foreground mt-0.5">{getPeriodLabel(period)}</p>
          </div>
          <div className="flex gap-1.5">
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
                  {period.type === "month" ? `${MONTHS[period.month].slice(0, 3)} ${period.year}` : "Select Month..."}
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-auto p-0" align="end">
                <MonthYearPicker onSelect={(year, month) => {
                  setPeriod({ type: "month", year, month });
                  setMonthPickerOpen(false);
                }} />
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
            {/* Row 1: Activity - most prominent */}
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
              {activityCards.map((k) => (
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

            {/* Row 2: Financial - medium emphasis */}
            <div className="grid grid-cols-3 gap-4">
              {financialCards.map((k) => (
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

            {/* Row 3: Performance - lighter */}
            <div className="grid grid-cols-2 gap-4">
              {performanceCards.map((k) => (
                <Card key={k.label} className="border-border/30 shadow-none bg-muted/30">
                  <CardContent className="p-3.5 flex items-center gap-3">
                    <k.icon className={cn("w-4 h-4 shrink-0", k.accent)} />
                    <div>
                      <p className={cn("text-lg font-semibold tracking-tight", k.accent)}>{k.value}</p>
                      <p className="text-[11px] font-medium text-muted-foreground uppercase tracking-wider">{k.label}</p>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              <Card className="border-border/50 shadow-sm">
                <CardHeader className="pb-3">
                  <CardTitle className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">Orders by Type</CardTitle>
                </CardHeader>
                <CardContent className="space-y-2.5">
                  {m.ordersBySource.map((s) => {
                    const max = Math.max(...m.ordersBySource.map((x) => x.count), 1);
                    return (
                      <div key={s.label} className="flex items-center gap-3">
                        <span className="text-sm text-foreground w-20 shrink-0">{s.label}</span>
                        <div className="flex-1 h-6 bg-muted rounded-md overflow-hidden">
                          <div className="h-full bg-primary/70 rounded-md transition-all" style={{ width: `${(s.count / max) * 100}%` }} />
                        </div>
                        <span className="text-sm font-semibold text-foreground w-8 text-right">{s.count}</span>
                      </div>
                    );
                  })}
                  {m.ordersBySource.every((s) => s.count === 0) && (
                    <p className="text-sm text-muted-foreground py-2">No orders this period</p>
                  )}
                </CardContent>
              </Card>

              <Card className="border-border/50 shadow-sm">
                <CardHeader className="pb-3">
                  <CardTitle className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">Revenue by Payment Method</CardTitle>
                </CardHeader>
                <CardContent className="space-y-2.5">
                  {m.revenueByPayment.length === 0 ? (
                    <p className="text-sm text-muted-foreground py-2">No revenue this period</p>
                  ) : (
                    m.revenueByPayment.map((p) => {
                      const max = Math.max(...m.revenueByPayment.map((x) => x.amount), 1);
                      return (
                        <div key={p.label} className="flex items-center gap-3">
                          <span className="text-sm text-foreground w-20 shrink-0">{p.label}</span>
                          <div className="flex-1 h-6 bg-muted rounded-md overflow-hidden">
                            <div className="h-full bg-green-500/60 rounded-md transition-all" style={{ width: `${(p.amount / max) * 100}%` }} />
                          </div>
                          <span className="text-sm font-semibold text-foreground w-20 text-right">${p.amount.toFixed(0)}</span>
                        </div>
                      );
                    })
                  )}
                </CardContent>
              </Card>
            </div>

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
                  <CardTitle className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">Needs Follow-Up</CardTitle>
                </CardHeader>
                <CardContent>
                  {m.needsFollowUp.length === 0 ? (
                    <p className="text-sm text-muted-foreground py-2">All caught up! 🎉</p>
                  ) : (
                    <div className="space-y-1">
                      {m.needsFollowUp.map((c) => (
                        <div key={c.id} className="flex items-center justify-between p-2.5 rounded-lg hover:bg-muted/50 cursor-pointer transition-colors" onClick={() => navigate(`/customers/${c.id}`)}>
                          <div>
                            <p className="text-sm font-medium text-foreground">{c.full_name}</p>
                            <p className="text-xs text-muted-foreground">
                              {c.days_since_last_order !== null ? `${c.days_since_last_order}d since last order` : "No orders"}
                            </p>
                          </div>
                          <div className="text-right">
                            {c.follow_up_status && (
                              <span className={cn("text-[10px] px-1.5 py-0.5 rounded font-medium",
                                c.follow_up_status === "OVERDUE" ? "bg-red-100 text-red-700" :
                                c.follow_up_status === "TODAY" ? "bg-blue-100 text-blue-700" :
                                "bg-accent text-accent-foreground"
                              )}>
                                {c.follow_up_status}
                              </span>
                            )}
                            {c.activity_status && <p className="text-[10px] text-muted-foreground mt-0.5">{c.activity_status}</p>}
                          </div>
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
