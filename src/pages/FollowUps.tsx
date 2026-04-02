import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { fetchCustomers, fetchOrders } from "@/lib/queries";
import { computeCustomerFields } from "@/lib/computedFields";
import type { Customer, CustomerComputed, OrderWithCustomer } from "@/lib/types";
import Layout from "@/components/Layout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useNavigate } from "react-router-dom";
import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { Clock, AlertTriangle, CalendarCheck, Star } from "lucide-react";

type Enriched = Customer & CustomerComputed;

export default function FollowUps() {
  const navigate = useNavigate();
  const { data: customers = [], isLoading: cLoading } = useQuery({ queryKey: ["customers"], queryFn: fetchCustomers });
  const { data: allOrders = [], isLoading: oLoading } = useQuery({ queryKey: ["orders"], queryFn: () => fetchOrders() });
  const isLoading = cLoading || oLoading;

  const { overdue, today, upcoming, noOrders } = useMemo(() => {
    const enriched: Enriched[] = customers.map((c) => {
      const custOrders = allOrders.filter((o) => o.customer_id === c.id);
      return { ...c, ...computeCustomerFields(c, custOrders) };
    });

    const overdue = enriched
      .filter((c) => c.follow_up_status === "OVERDUE")
      .sort((a, b) => (b.days_since_last_order ?? 0) - (a.days_since_last_order ?? 0));

    const today = enriched.filter((c) => c.follow_up_status === "TODAY");

    const upcoming = enriched
      .filter((c) => c.follow_up_status === "UPCOMING")
      .sort((a, b) => (a.days_since_last_order ?? 0) - (b.days_since_last_order ?? 0));

    const noOrders = enriched
      .filter((c) => c.days_since_last_order === null && !c.follow_up_status)
      .slice(0, 20);

    return { overdue, today, upcoming, noOrders };
  }, [customers, allOrders]);

  const sections = [
    { title: "Overdue", items: overdue, icon: AlertTriangle, color: "text-red-600", bgColor: "bg-red-50 dark:bg-red-950/30" },
    { title: "Today", items: today, icon: CalendarCheck, color: "text-blue-600", bgColor: "bg-blue-50 dark:bg-blue-950/30" },
    { title: "Upcoming", items: upcoming, icon: Clock, color: "text-amber-600", bgColor: "bg-amber-50 dark:bg-amber-950/30" },
    { title: "No Orders Yet", items: noOrders, icon: Star, color: "text-muted-foreground", bgColor: "bg-muted/30" },
  ];

  return (
    <Layout>
      <div className="space-y-6">
        <div>
          <h2 className="text-2xl font-bold tracking-tight text-foreground">Follow-Ups</h2>
          <p className="text-sm text-muted-foreground mt-0.5">Customers needing attention</p>
        </div>

        {isLoading ? (
          <div className="flex items-center justify-center py-20">
            <div className="w-6 h-6 border-2 border-primary border-t-transparent rounded-full animate-spin" />
          </div>
        ) : (
          <div className="grid gap-6 lg:grid-cols-2">
            {sections.map(({ title, items, icon: Icon, color, bgColor }) => (
              <Card key={title} className="border-border/50 shadow-sm">
                <CardHeader className="pb-3">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <div className={cn("p-1.5 rounded-md", bgColor)}>
                        <Icon className={cn("w-4 h-4", color)} />
                      </div>
                      <CardTitle className="text-sm font-semibold text-foreground">{title}</CardTitle>
                    </div>
                    <Badge variant="secondary" className="text-xs">{items.length}</Badge>
                  </div>
                </CardHeader>
                <CardContent>
                  {items.length === 0 ? (
                    <p className="text-sm text-muted-foreground py-4 text-center">All caught up! 🎉</p>
                  ) : (
                    <div className="space-y-1 max-h-80 overflow-y-auto">
                      {items.map((c) => (
                        <div
                          key={c.id}
                          className="flex items-center justify-between p-2.5 rounded-lg hover:bg-muted/50 cursor-pointer transition-colors"
                          onClick={() => navigate(`/customers/${c.id}`)}
                        >
                          <div className="min-w-0">
                            <p className="text-sm font-medium text-foreground truncate">{c.full_name}</p>
                            <p className="text-xs text-muted-foreground">
                              {c.days_since_last_order !== null ? `${c.days_since_last_order}d since last order` : "No orders yet"}
                            </p>
                          </div>
                          <div className="text-right shrink-0 ml-2">
                            {c.activity_status && (
                              <span className="text-[10px] px-1.5 py-0.5 rounded bg-accent text-accent-foreground font-medium">
                                {c.activity_status}
                              </span>
                            )}
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </div>
    </Layout>
  );
}
