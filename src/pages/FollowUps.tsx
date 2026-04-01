import { useMemo, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import { fetchCustomers, fetchOrders, updateCustomer } from "@/lib/queries";
import Layout from "@/components/Layout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { Bell, BellOff, Clock, Crown, Phone, MessageSquare, Gift, RotateCcw, Check, ChevronRight } from "lucide-react";
import { toast } from "sonner";

type Tab = "needs-attention" | "high-value" | "all-flagged";

export default function FollowUps() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [tab, setTab] = useState<Tab>("needs-attention");

  const { data: customers = [] } = useQuery({ queryKey: ["customers"], queryFn: fetchCustomers });
  const { data: orders = [] } = useQuery({ queryKey: ["orders"], queryFn: () => fetchOrders() });

  const toggleFollowUp = useMutation({
    mutationFn: ({ id, value }: { id: string; value: boolean }) =>
      updateCustomer(id, { follow_up_needed: value }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["customers"] });
      toast.success("Updated");
    },
  });

  const markContacted = useMutation({
    mutationFn: (id: string) =>
      updateCustomer(id, { last_contact_date: new Date().toISOString(), follow_up_needed: false }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["customers"] });
      toast.success("Marked as contacted");
    },
  });

  const insights = useMemo(() => {
    const fortyFiveDaysAgo = new Date();
    fortyFiveDaysAgo.setDate(fortyFiveDaysAgo.getDate() - 45);

    const inactive = customers.filter((c) => {
      if (!c.last_order_date) return true;
      return new Date(c.last_order_date) < fortyFiveDaysAgo;
    });

    const highValue = customers.filter((c) => Number(c.total_spent) >= 500);

    const flagged = customers.filter((c) => c.follow_up_needed);

    // Suggested follow-ups: inactive OR high-value without recent contact
    const needsAttention = customers.filter((c) => {
      const isInactive = !c.last_order_date || new Date(c.last_order_date) < fortyFiveDaysAgo;
      const isHighValue = Number(c.total_spent) >= 500;
      const wasContactedRecently = c.last_contact_date && new Date(c.last_contact_date) > fortyFiveDaysAgo;
      return (isInactive || isHighValue) && !wasContactedRecently;
    });

    return { inactive, highValue, flagged, needsAttention };
  }, [customers]);

  const tabs: { key: Tab; label: string; count: number }[] = [
    { key: "needs-attention", label: "Needs Attention", count: insights.needsAttention.length },
    { key: "high-value", label: "VIP ($500+)", count: insights.highValue.length },
    { key: "all-flagged", label: "Flagged", count: insights.flagged.length },
  ];

  const displayList = tab === "needs-attention" ? insights.needsAttention
    : tab === "high-value" ? insights.highValue
    : insights.flagged;

  return (
    <Layout>
      <div className="max-w-2xl mx-auto space-y-5 pb-8">
        <div>
          <h2 className="text-2xl font-bold tracking-tight text-foreground">Follow-Ups</h2>
          <p className="text-sm text-muted-foreground">Stay connected with your customers</p>
        </div>

        {/* Summary cards */}
        <div className="grid grid-cols-3 gap-2">
          <Card className="border-border/50 shadow-sm">
            <CardContent className="p-3 text-center">
              <Clock className="w-4 h-4 text-primary mx-auto mb-1" />
              <p className="text-lg font-bold text-foreground">{insights.inactive.length}</p>
              <p className="text-[10px] uppercase tracking-wider text-muted-foreground">45+ Days Inactive</p>
            </CardContent>
          </Card>
          <Card className="border-border/50 shadow-sm">
            <CardContent className="p-3 text-center">
              <Crown className="w-4 h-4 text-primary mx-auto mb-1" />
              <p className="text-lg font-bold text-foreground">{insights.highValue.length}</p>
              <p className="text-[10px] uppercase tracking-wider text-muted-foreground">VIP Customers</p>
            </CardContent>
          </Card>
          <Card className="border-border/50 shadow-sm">
            <CardContent className="p-3 text-center">
              <Bell className="w-4 h-4 text-primary mx-auto mb-1" />
              <p className="text-lg font-bold text-foreground">{insights.flagged.length}</p>
              <p className="text-[10px] uppercase tracking-wider text-muted-foreground">Flagged</p>
            </CardContent>
          </Card>
        </div>

        {/* Automation-ready cards */}
        <Card className="border-border/50 shadow-sm bg-muted/30">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm text-muted-foreground uppercase tracking-wider">Coming Soon — Automation</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-3 gap-2">
              <div className="flex flex-col items-center gap-1 p-3 rounded-xl bg-card border border-border/50 opacity-60">
                <MessageSquare className="w-5 h-5 text-primary" />
                <span className="text-[10px] text-center text-muted-foreground font-medium">SMS Follow-Ups</span>
              </div>
              <div className="flex flex-col items-center gap-1 p-3 rounded-xl bg-card border border-border/50 opacity-60">
                <Gift className="w-5 h-5 text-primary" />
                <span className="text-[10px] text-center text-muted-foreground font-medium">Promotions</span>
              </div>
              <div className="flex flex-col items-center gap-1 p-3 rounded-xl bg-card border border-border/50 opacity-60">
                <RotateCcw className="w-5 h-5 text-primary" />
                <span className="text-[10px] text-center text-muted-foreground font-medium">Reorder Reminders</span>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Tabs */}
        <div className="flex gap-1.5 overflow-x-auto pb-1">
          {tabs.map((t) => (
            <button
              key={t.key}
              onClick={() => setTab(t.key)}
              className={cn(
                "px-3 py-1.5 rounded-lg text-xs font-medium transition-all active:scale-95 whitespace-nowrap shrink-0",
                tab === t.key
                  ? "bg-primary text-primary-foreground shadow-sm"
                  : "bg-muted text-muted-foreground"
              )}
            >
              {t.label} ({t.count})
            </button>
          ))}
        </div>

        {/* List */}
        {displayList.length === 0 ? (
          <div className="text-center py-12">
            <Check className="w-10 h-10 text-primary/30 mx-auto mb-3" />
            <p className="text-muted-foreground">All caught up! 🎉</p>
          </div>
        ) : (
          <div className="grid gap-2">
            {displayList.map((c) => {
              const isInactive = !c.last_order_date || new Date(c.last_order_date) < new Date(Date.now() - 45 * 86400000);
              const isVIP = Number(c.total_spent) >= 500;
              const daysSinceOrder = c.last_order_date
                ? Math.floor((Date.now() - new Date(c.last_order_date).getTime()) / 86400000)
                : null;

              return (
                <Card key={c.id} className={cn(
                  "border-border/50 shadow-sm transition-all",
                  c.follow_up_needed && "border-primary/40 bg-primary/5"
                )}>
                  <CardContent className="p-4">
                    <div className="flex items-start gap-3">
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span
                            className="font-semibold text-foreground cursor-pointer hover:text-primary transition-colors"
                            onClick={() => navigate(`/customers/${c.id}`)}
                          >
                            {c.name}
                          </span>
                          {isVIP && (
                            <span className="text-[10px] px-1.5 py-0.5 rounded bg-primary/15 text-primary font-semibold uppercase">VIP</span>
                          )}
                          {isInactive && (
                            <span className="text-[10px] px-1.5 py-0.5 rounded bg-destructive/10 text-destructive font-semibold uppercase">
                              {daysSinceOrder !== null ? `${daysSinceOrder}d inactive` : "Never ordered"}
                            </span>
                          )}
                        </div>
                        <div className="flex flex-wrap gap-x-3 gap-y-0.5 mt-1 text-xs text-muted-foreground">
                          {c.phone && <span className="flex items-center gap-1"><Phone className="w-3 h-3" />{c.phone}</span>}
                          <span>Lifetime: ${Number(c.total_spent).toFixed(2)}</span>
                          {c.last_contact_date && (
                            <span>Contacted: {new Date(c.last_contact_date).toLocaleDateString()}</span>
                          )}
                        </div>
                      </div>

                      <div className="flex items-center gap-1 shrink-0">
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-8 w-8"
                          title="Mark as contacted today"
                          onClick={() => markContacted.mutate(c.id)}
                        >
                          <Check className="w-4 h-4 text-primary" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-8 w-8"
                          title={c.follow_up_needed ? "Remove flag" : "Flag for follow-up"}
                          onClick={() => toggleFollowUp.mutate({ id: c.id, value: !c.follow_up_needed })}
                        >
                          {c.follow_up_needed
                            ? <BellOff className="w-4 h-4 text-muted-foreground" />
                            : <Bell className="w-4 h-4 text-primary" />
                          }
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-8 w-8"
                          onClick={() => navigate(`/orders/new?customer=${c.id}`)}
                          title="Create order"
                        >
                          <ChevronRight className="w-4 h-4 text-muted-foreground" />
                        </Button>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        )}
      </div>
    </Layout>
  );
}
