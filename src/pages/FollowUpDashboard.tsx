import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { fetchCustomers, fetchOrders } from "@/lib/queries";
import { computeCustomerFields } from "@/lib/computedFields";
import type { Customer, CustomerComputed } from "@/lib/types";
import Layout from "@/components/Layout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useNavigate } from "react-router-dom";
import { cn } from "@/lib/utils";

type Enriched = Customer & CustomerComputed;

export default function FollowUpDashboard() {
  const navigate = useNavigate();
  const { data: customers = [] } = useQuery({ queryKey: ["customers"], queryFn: fetchCustomers });
  const { data: allOrders = [] } = useQuery({ queryKey: ["orders"], queryFn: () => fetchOrders() });

  const enriched: Enriched[] = useMemo(() => {
    return customers.map((c) => {
      const custOrders = allOrders.filter((o) => o.customer_id === c.id);
      return { ...c, ...computeCustomerFields(c, custOrders) };
    });
  }, [customers, allOrders]);

  const overdue = enriched.filter((c) => c.follow_up_status === "OVERDUE");
  const today = enriched.filter((c) => c.follow_up_status === "TODAY");
  const upcoming = enriched.filter((c) => c.follow_up_status === "UPCOMING");
  const vips = enriched.filter((c) => c.vip === "VIP");
  const newCustomers = enriched.filter((c) => c.new_first_90_days === "New");

  const summaryCards = [
    { label: "Overdue", count: overdue.length, color: "text-red-600", bg: "bg-red-50" },
    { label: "Today", count: today.length, color: "text-blue-600", bg: "bg-blue-50" },
    { label: "Upcoming", count: upcoming.length, color: "text-green-600", bg: "bg-green-50" },
    { label: "VIP", count: vips.length, color: "text-purple-600", bg: "bg-purple-50" },
    { label: "New (90d)", count: newCustomers.length, color: "text-sky-600", bg: "bg-sky-50" },
  ];

  return (
    <Layout>
      <div className="space-y-6">
        <h2 className="text-2xl font-bold tracking-tight text-foreground">Dashboard</h2>

        {/* Summary Cards */}
        <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
          {summaryCards.map((s) => (
            <Card key={s.label} className={cn("border-border/50 shadow-sm", s.bg)}>
              <CardContent className="p-4 text-center">
                <p className={cn("text-3xl font-bold", s.color)}>{s.count}</p>
                <p className="text-xs font-medium text-muted-foreground mt-1">{s.label}</p>
              </CardContent>
            </Card>
          ))}
        </div>

        {/* Overdue */}
        <QuickList title="Overdue Follow-Ups" customers={overdue} navigate={navigate} emptyText="No overdue follow-ups 🎉" accent="border-l-red-500" />

        {/* Today */}
        <QuickList title="Today's Follow-Ups" customers={today} navigate={navigate} emptyText="Nothing scheduled for today" accent="border-l-blue-500" />

        {/* VIP */}
        <QuickList title="VIP Customers" customers={vips} navigate={navigate} emptyText="No VIP customers yet" accent="border-l-purple-500" />

        {/* New */}
        <QuickList title="New Customers (First 90 Days)" customers={newCustomers} navigate={navigate} emptyText="No new customers" accent="border-l-sky-500" />
      </div>
    </Layout>
  );
}

function QuickList({ title, customers, navigate, emptyText, accent }: {
  title: string;
  customers: Enriched[];
  navigate: (path: string) => void;
  emptyText: string;
  accent: string;
}) {
  return (
    <Card className="border-border/50 shadow-sm">
      <CardHeader className="pb-2"><CardTitle className="text-base">{title} ({customers.length})</CardTitle></CardHeader>
      <CardContent>
        {customers.length === 0 ? (
          <p className="text-sm text-muted-foreground py-3">{emptyText}</p>
        ) : (
          <div className="space-y-1.5">
            {customers.slice(0, 15).map((c) => (
              <div
                key={c.id}
                className={cn("flex items-center justify-between p-2.5 rounded-lg border-l-4 bg-muted/30 cursor-pointer hover:bg-muted/60 transition-colors", accent)}
                onClick={() => navigate(`/customers/${c.id}`)}
              >
                <div>
                  <p className="text-sm font-medium text-foreground">{c.full_name}</p>
                  <p className="text-xs text-muted-foreground">
                    {c.next_follow_up ? `Follow-up: ${new Date(c.next_follow_up).toLocaleDateString()}` : ""}
                    {c.follow_up_reason ? ` · ${c.follow_up_reason}` : ""}
                  </p>
                </div>
                <div className="text-right text-xs text-muted-foreground">
                  {c.category && <span className="block">{c.category}</span>}
                  {c.retail_this_year > 0 && <span>${c.retail_this_year.toFixed(0)} YTD</span>}
                </div>
              </div>
            ))}
            {customers.length > 15 && <p className="text-xs text-muted-foreground text-center">+{customers.length - 15} more</p>}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
