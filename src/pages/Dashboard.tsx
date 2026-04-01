import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import { fetchCustomers, fetchOrders } from "@/lib/queries";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { DollarSign, ShoppingBag, TrendingUp, AlertCircle, Phone, Globe, MessageSquare, PartyPopper, UserX } from "lucide-react";
import Layout from "@/components/Layout";
import { cn } from "@/lib/utils";

function StatCard({ label, value, sub, icon: Icon, accent }: { label: string; value: string; sub?: string; icon: React.ElementType; accent?: boolean }) {
  return (
    <Card className="border-border/50 shadow-sm">
      <CardContent className="p-4">
        <div className="flex items-start justify-between">
          <div>
            <p className="text-[10px] uppercase tracking-wider font-semibold text-muted-foreground">{label}</p>
            <p className={cn("text-2xl font-bold mt-1", accent ? "text-destructive" : "text-foreground")}>{value}</p>
            {sub && <p className="text-xs text-muted-foreground mt-0.5">{sub}</p>}
          </div>
          <div className={cn("p-2 rounded-xl", accent ? "bg-destructive/10" : "bg-primary/10")}>
            <Icon className={cn("w-5 h-5", accent ? "text-destructive" : "text-primary")} />
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

function BarRow({ label, value, max, color }: { label: string; value: number; max: number; color?: string }) {
  const pct = max > 0 ? (value / max) * 100 : 0;
  return (
    <div className="space-y-1">
      <div className="flex items-center justify-between text-sm">
        <span className="text-foreground font-medium">{label}</span>
        <span className="text-muted-foreground">{value}</span>
      </div>
      <div className="h-2 rounded-full bg-muted overflow-hidden">
        <div className={cn("h-full rounded-full transition-all", color || "bg-primary")} style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}

function RevenueBarRow({ label, value, max }: { label: string; value: number; max: number }) {
  const pct = max > 0 ? (value / max) * 100 : 0;
  return (
    <div className="space-y-1">
      <div className="flex items-center justify-between text-sm">
        <span className="text-foreground font-medium">{label}</span>
        <span className="font-semibold text-foreground">${value.toFixed(2)}</span>
      </div>
      <div className="h-2 rounded-full bg-muted overflow-hidden">
        <div className="h-full rounded-full bg-primary/70 transition-all" style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}

export default function Dashboard() {
  const navigate = useNavigate();
  const { data: customers = [] } = useQuery({ queryKey: ["customers"], queryFn: fetchCustomers });
  const { data: orders = [] } = useQuery({ queryKey: ["orders"], queryFn: () => fetchOrders() });

  const metrics = useMemo(() => {
    const now = new Date();
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);

    const monthOrders = orders.filter((o) => new Date(o.order_date) >= monthStart);
    const monthRevenue = monthOrders.reduce((s, o) => s + Number(o.total_amount), 0);
    const avgOrder = monthOrders.length > 0 ? monthRevenue / monthOrders.length : 0;

    const outstanding = orders
      .filter((o) => o.payment_status !== "Paid")
      .reduce((s, o) => s + Number(o.total_amount), 0);

    // Orders by source
    const sourceMap: Record<string, number> = {};
    monthOrders.forEach((o) => { sourceMap[o.order_source] = (sourceMap[o.order_source] || 0) + 1; });
    const sourceEntries = Object.entries(sourceMap).sort((a, b) => b[1] - a[1]);
    const maxSource = sourceEntries.length > 0 ? sourceEntries[0][1] : 0;

    // Revenue by payment method
    const methodMap: Record<string, number> = {};
    orders.filter((o) => o.payment_method).forEach((o) => {
      const m = o.payment_method!;
      methodMap[m] = (methodMap[m] || 0) + Number(o.total_amount);
    });
    const methodEntries = Object.entries(methodMap).sort((a, b) => b[1] - a[1]);
    const maxMethod = methodEntries.length > 0 ? methodEntries[0][1] : 0;

    // Top 5 customers
    const topCustomers = [...customers].sort((a, b) => Number(b.total_spent) - Number(a.total_spent)).slice(0, 5);

    // Inactive customers (no order in 60 days)
    const sixtyDaysAgo = new Date();
    sixtyDaysAgo.setDate(sixtyDaysAgo.getDate() - 60);
    const inactive = customers.filter((c) => {
      if (!c.last_order_date) return true;
      return new Date(c.last_order_date) < sixtyDaysAgo;
    });

    return { monthRevenue, monthOrderCount: monthOrders.length, avgOrder, outstanding, sourceEntries, maxSource, methodEntries, maxMethod, topCustomers, inactive };
  }, [orders, customers]);

  return (
    <Layout>
      <div className="max-w-3xl mx-auto space-y-6 pb-8">
        <div>
          <h2 className="text-2xl font-bold tracking-tight text-foreground">Dashboard</h2>
          <p className="text-sm text-muted-foreground">Welcome back, Director! ✨</p>
        </div>

        {/* Summary Stats */}
        <div className="grid grid-cols-2 gap-3">
          <StatCard label="Revenue (This Month)" value={`$${metrics.monthRevenue.toFixed(2)}`} icon={DollarSign} />
          <StatCard label="Orders (This Month)" value={metrics.monthOrderCount.toString()} icon={ShoppingBag} />
          <StatCard label="Avg Order Value" value={`$${metrics.avgOrder.toFixed(2)}`} icon={TrendingUp} />
          <StatCard label="Outstanding" value={`$${metrics.outstanding.toFixed(2)}`} icon={AlertCircle} accent />
        </div>

        {/* Breakdowns */}
        <div className="grid gap-4 md:grid-cols-2">
          <Card className="border-border/50 shadow-sm">
            <CardHeader className="pb-3">
              <CardTitle className="text-base text-foreground">Orders by Source</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              {metrics.sourceEntries.length === 0 ? (
                <p className="text-sm text-muted-foreground">No orders this month</p>
              ) : (
                metrics.sourceEntries.map(([source, count]) => (
                  <BarRow key={source} label={source} value={count} max={metrics.maxSource} />
                ))
              )}
            </CardContent>
          </Card>

          <Card className="border-border/50 shadow-sm">
            <CardHeader className="pb-3">
              <CardTitle className="text-base text-foreground">Revenue by Payment Method</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              {metrics.methodEntries.length === 0 ? (
                <p className="text-sm text-muted-foreground">No payment data yet</p>
              ) : (
                metrics.methodEntries.map(([method, amount]) => (
                  <RevenueBarRow key={method} label={method} value={amount} max={metrics.maxMethod} />
                ))
              )}
            </CardContent>
          </Card>
        </div>

        {/* Customer Insights */}
        <div className="grid gap-4 md:grid-cols-2">
          <Card className="border-border/50 shadow-sm">
            <CardHeader className="pb-3">
              <CardTitle className="text-base text-foreground">Top 5 Customers</CardTitle>
            </CardHeader>
            <CardContent>
              {metrics.topCustomers.length === 0 ? (
                <p className="text-sm text-muted-foreground">No customers yet</p>
              ) : (
                <div className="space-y-2">
                  {metrics.topCustomers.map((c, i) => (
                    <div
                      key={c.id}
                      className="flex items-center justify-between p-2.5 rounded-xl bg-muted/40 cursor-pointer hover:bg-muted active:scale-[0.99] transition-all"
                      onClick={() => navigate(`/customers/${c.id}`)}
                    >
                      <div className="flex items-center gap-2.5 min-w-0">
                        <span className="w-6 h-6 rounded-full bg-primary/10 text-primary text-xs font-bold flex items-center justify-center shrink-0">
                          {i + 1}
                        </span>
                        <span className="font-medium text-foreground text-sm truncate">{c.name}</span>
                      </div>
                      <span className="font-bold text-foreground text-sm shrink-0">${Number(c.total_spent).toFixed(2)}</span>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>

          <Card className="border-border/50 shadow-sm">
            <CardHeader className="pb-3 flex flex-row items-center gap-2">
              <UserX className="w-4 h-4 text-muted-foreground" />
              <CardTitle className="text-base text-foreground">Needs Follow-Up</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-xs text-muted-foreground mb-3">No orders in 60+ days</p>
              {metrics.inactive.length === 0 ? (
                <p className="text-sm text-muted-foreground">All customers are active 🎉</p>
              ) : (
                <div className="space-y-2 max-h-64 overflow-y-auto">
                  {metrics.inactive.slice(0, 10).map((c) => (
                    <div
                      key={c.id}
                      className="flex items-center justify-between p-2.5 rounded-xl bg-muted/40 cursor-pointer hover:bg-muted active:scale-[0.99] transition-all"
                      onClick={() => navigate(`/customers/${c.id}`)}
                    >
                      <div className="min-w-0">
                        <p className="font-medium text-foreground text-sm truncate">{c.name}</p>
                        <p className="text-[11px] text-muted-foreground">
                          {c.last_order_date ? `Last: ${new Date(c.last_order_date).toLocaleDateString()}` : "Never ordered"}
                        </p>
                      </div>
                      <span className="text-xs text-muted-foreground shrink-0">${Number(c.total_spent).toFixed(2)}</span>
                    </div>
                  ))}
                  {metrics.inactive.length > 10 && (
                    <p className="text-xs text-muted-foreground text-center pt-1">+{metrics.inactive.length - 10} more</p>
                  )}
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </Layout>
  );
}
