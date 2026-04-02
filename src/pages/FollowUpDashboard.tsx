import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { fetchCustomers, fetchOrders } from "@/lib/queries";
import { computeCustomerFields } from "@/lib/computedFields";
import type { Customer, CustomerComputed, OrderWithCustomer } from "@/lib/types";
import Layout from "@/components/Layout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useNavigate } from "react-router-dom";
import { cn } from "@/lib/utils";
import { DollarSign, ShoppingBag, TrendingUp, AlertCircle } from "lucide-react";
import { startOfMonth, endOfMonth, parseISO, isWithinInterval } from "date-fns";

type Enriched = Customer & CustomerComputed;

function useMetrics(customers: Customer[], orders: OrderWithCustomer[]) {
  return useMemo(() => {
    const today = new Date();
    const monthStart = startOfMonth(today);
    const monthEnd = endOfMonth(today);

    const monthOrders = orders.filter((o) => {
      const d = parseISO(o.order_date);
      return isWithinInterval(d, { start: monthStart, end: monthEnd });
    });

    const monthRevenue = monthOrders.reduce((s, o) => s + Number(o.retail_amount || 0), 0);
    const monthCount = monthOrders.length;
    const avgOrder = monthCount > 0 ? monthRevenue / monthCount : 0;

    const unpaidOrders = orders.filter((o) => !o.payment_type);
    const outstandingTotal = unpaidOrders.reduce((s, o) => s + Number(o.retail_amount || 0), 0);

    // Orders by order_type
    const typeMap: Record<string, number> = {};
    for (const o of monthOrders) {
      const t = o.order_type || "Other";
      typeMap[t] = (typeMap[t] || 0) + 1;
    }
    const ordersBySource = ["Reorder", "Party", "Facial", "Other"].map((s) => ({
      label: s,
      count: typeMap[s] || 0,
    }));

    // Revenue by payment method
    const payMap: Record<string, number> = {};
    for (const o of monthOrders) {
      const pt = o.payment_type || "None";
      payMap[pt] = (payMap[pt] || 0) + Number(o.retail_amount || 0);
    }
    const revenueByPayment = ["Cash", "Check", "Venmo", "Zelle", "Card", "Other", "None"]
      .map((p) => ({ label: p, amount: payMap[p] || 0 }))
      .filter((p) => p.amount > 0);

    const enriched: Enriched[] = customers.map((c) => {
      const custOrders = orders.filter((o) => o.customer_id === c.id);
      return { ...c, ...computeCustomerFields(c, custOrders) };
    });
    const topCustomers = [...enriched]
      .sort((a, b) => b.retail_this_year - a.retail_this_year)
      .slice(0, 5)
      .filter((c) => c.retail_this_year > 0);

    const needsFollowUp = enriched
      .filter((c) => c.follow_up_status === "OVERDUE" || c.follow_up_status === "TODAY" || (c.days_since_last_order !== null && c.days_since_last_order >= 45))
      .sort((a, b) => (b.days_since_last_order ?? 0) - (a.days_since_last_order ?? 0))
      .slice(0, 10);

    return { monthRevenue, monthCount, avgOrder, outstandingTotal, ordersBySource, revenueByPayment, topCustomers, needsFollowUp, enriched };
  }, [customers, orders]);
}

export default function FollowUpDashboard() {
  const navigate = useNavigate();
  const { data: customers = [], isLoading: cLoading } = useQuery({ queryKey: ["customers"], queryFn: fetchCustomers });
  const { data: allOrders = [], isLoading: oLoading } = useQuery({ queryKey: ["orders"], queryFn: () => fetchOrders() });
  const m = useMetrics(customers, allOrders);
  const isLoading = cLoading || oLoading;

  const kpiCards = [
    { label: "Revenue This Month", value: `$${m.monthRevenue.toFixed(2)}`, icon: DollarSign, accent: "text-green-600" },
    { label: "Orders This Month", value: String(m.monthCount), icon: ShoppingBag, accent: "text-blue-600" },
    { label: "Avg Order Value", value: `$${m.avgOrder.toFixed(2)}`, icon: TrendingUp, accent: "text-purple-600" },
    { label: "Outstanding", value: `$${m.outstandingTotal.toFixed(2)}`, icon: AlertCircle, accent: m.outstandingTotal > 0 ? "text-red-600" : "text-green-600" },
  ];

  return (
    <Layout>
      <div className="space-y-8">
        <div>
          <h2 className="text-2xl font-bold tracking-tight text-foreground">Dashboard</h2>
          <p className="text-sm text-muted-foreground mt-0.5">{new Date().toLocaleDateString("en-US", { month: "long", year: "numeric" })} overview</p>
        </div>

        {isLoading ? (
          <div className="flex items-center justify-center py-20">
            <div className="w-6 h-6 border-2 border-primary border-t-transparent rounded-full animate-spin" />
          </div>
        ) : (
          <>
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
              {kpiCards.map((k) => (
                <Card key={k.label} className="border-border/50 shadow-sm">
                  <CardContent className="p-5">
                    <div className="flex items-center justify-between mb-3">
                      <k.icon className={cn("w-5 h-5", k.accent)} />
                    </div>
                    <p className={cn("text-2xl sm:text-3xl font-bold tracking-tight", k.accent)}>{k.value}</p>
                    <p className="text-xs font-medium text-muted-foreground mt-1 uppercase tracking-wider">{k.label}</p>
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
                    <p className="text-sm text-muted-foreground py-2">No orders this month</p>
                  )}
                </CardContent>
              </Card>

              <Card className="border-border/50 shadow-sm">
                <CardHeader className="pb-3">
                  <CardTitle className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">Revenue by Payment Method</CardTitle>
                </CardHeader>
                <CardContent className="space-y-2.5">
                  {m.revenueByPayment.length === 0 ? (
                    <p className="text-sm text-muted-foreground py-2">No revenue this month</p>
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
                  <CardTitle className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">Top Customers (YTD)</CardTitle>
                </CardHeader>
                <CardContent>
                  {m.topCustomers.length === 0 ? (
                    <p className="text-sm text-muted-foreground py-2">No orders yet this year</p>
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
                          <div className="text-right">
                            <p className="text-sm font-bold text-foreground">${c.retail_this_year.toFixed(2)}</p>
                            {c.vip && <span className="text-[10px] px-1.5 py-0.5 rounded bg-purple-100 text-purple-700 font-medium">VIP</span>}
                          </div>
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
                            {c.category && <p className="text-[10px] text-muted-foreground mt-0.5">{c.category}</p>}
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
