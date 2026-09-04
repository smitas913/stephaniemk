import { useState, useMemo } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { fetchCustomers, fetchTeamConsultants } from "@/lib/queries";
import { stripPhone, normalizeEmail, formatPhone } from "@/lib/phoneUtils";
import type { Customer, TeamConsultant } from "@/lib/types";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { Loader2, GitMerge, CheckCircle2, AlertTriangle, ArrowRight } from "lucide-react";
import { toast } from "sonner";

interface Pair {
  customer: Customer;
  consultant: TeamConsultant;
  matchType: "email" | "phone" | "name";
}

const norm = (s?: string | null) => (s || "").toLowerCase().trim().replace(/\s+/g, " ");

export default function MigrateDuplicatesToConsultants() {
  const qc = useQueryClient();
  const { data: customers = [], isLoading: lc } = useQuery({ queryKey: ["customers"], queryFn: fetchCustomers });
  const { data: consultants = [], isLoading: lt } = useQuery({ queryKey: ["team-consultants"], queryFn: fetchTeamConsultants });
  const [target, setTarget] = useState<Pair | null>(null);
  const [counts, setCounts] = useState<Record<string, number> | null>(null);
  const [done, setDone] = useState<Set<string>>(new Set());

  const pairs = useMemo<Pair[]>(() => {
    const out: Pair[] = [];
    const used = new Set<string>();
    for (const t of consultants) {
      let match: Customer | undefined;
      let mt: Pair["matchType"] = "name";
      if (t.email) {
        match = customers.find((c) => !used.has(c.id) && c.email && normalizeEmail(c.email) === normalizeEmail(t.email));
        if (match) mt = "email";
      }
      if (!match && t.phone) {
        const tp = stripPhone(t.phone);
        if (tp.length >= 7) {
          match = customers.find((c) => !used.has(c.id) && c.phone && stripPhone(c.phone) === tp);
          if (match) mt = "phone";
        }
      }
      if (!match) {
        match = customers.find((c) => !used.has(c.id) && norm(c.full_name) === norm(t.name) && norm(c.full_name).length > 2);
        if (match) mt = "name";
      }
      if (match && !done.has(match.id)) {
        out.push({ customer: match, consultant: t, matchType: mt });
        used.add(match.id);
      }
    }
    return out;
  }, [customers, consultants, done]);

  const previewCounts = async (customerId: string) => {
    const tables: { name: string; col: string; label: string }[] = [
      { name: "orders", col: "customer_id", label: "Orders" },
      { name: "customer_notes", col: "customer_id", label: "Notes" },
      { name: "daily_plan_items", col: "customer_id", label: "Plan items" },
      { name: "catalog_campaign_customers", col: "customer_id", label: "Campaign entries" },
      { name: "event_guests", col: "converted_customer_id", label: "Event guests" },
    ];
    const result: Record<string, number> = {};
    for (const t of tables) {
      const { count } = await supabase.from(t.name as any).select("id", { count: "exact", head: true }).eq(t.col, customerId);
      result[t.label] = count || 0;
    }
    setCounts(result);
  };

  const migrate = useMutation({
    mutationFn: async (p: Pair) => {
      const { data, error } = await supabase.rpc("merge_customer_into_consultant" as any, {
        _customer_id: p.customer.id,
        _consultant_id: p.consultant.id,
      });
      if (error) throw error;
      return data;
    },
    onSuccess: (_, p) => {
      setDone((prev) => new Set(prev).add(p.customer.id));
      qc.invalidateQueries({ queryKey: ["customers"] });
      qc.invalidateQueries({ queryKey: ["team-consultants"] });
      qc.invalidateQueries({ queryKey: ["orders"] });
      setTarget(null);
      setCounts(null);
      toast.success(`Migrated ${p.customer.full_name} → ${p.consultant.name}`);
    },
    onError: (e: any) => toast.error(e.message || "Migration failed"),
  });

  const open = async (p: Pair) => {
    setTarget(p);
    setCounts(null);
    await previewCounts(p.customer.id);
  };

  const badge = (m: string) =>
    m === "email" ? <Badge className="text-[10px] bg-primary/15 text-primary">Email</Badge>
    : m === "phone" ? <Badge className="text-[10px] bg-accent text-accent-foreground">Phone</Badge>
    : <Badge variant="outline" className="text-[10px]">Name</Badge>;

  if (lc || lt) return <div className="flex justify-center py-8"><Loader2 className="w-5 h-5 animate-spin text-muted-foreground" /></div>;

  return (
    <div className="space-y-4 max-w-3xl">
      <div>
        <h3 className="text-sm font-semibold text-foreground">Migrate Duplicate Customers → Consultants</h3>
        <p className="text-xs text-muted-foreground">Merges all customer data (orders, notes, follow-ups, tags, address, beauty notes) onto the existing consultant record, then deletes the customer duplicate. Preview each pair before approving.</p>
      </div>

      {pairs.length === 0 ? (
        <Card className="border-border/50">
          <CardContent className="p-6 text-center">
            <CheckCircle2 className="w-8 h-8 text-primary mx-auto mb-2" />
            <p className="text-sm font-medium">No duplicate pairs remaining</p>
          </CardContent>
        </Card>
      ) : (
        <>
          <p className="text-xs text-muted-foreground">
            <AlertTriangle className="w-3.5 h-3.5 inline mr-1" />
            {pairs.length} pair{pairs.length !== 1 ? "s" : ""} remaining. Consultant record is kept as primary.
          </p>
          <div className="space-y-2">
            {pairs.map((p) => (
              <Card key={`${p.customer.id}-${p.consultant.id}`} className="border-border/50 shadow-sm">
                <CardContent className="p-4">
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap mb-2">
                        <span className="text-sm font-semibold">{p.consultant.name}</span>
                        {badge(p.matchType)}
                      </div>
                      <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-3 text-xs">
                        <div>
                          <div className="text-muted-foreground text-[10px] uppercase tracking-wide mb-0.5">Customer (will be merged + deleted)</div>
                          <p className="text-foreground">{p.customer.full_name}</p>
                          {p.customer.email && <p className="text-muted-foreground truncate">{p.customer.email}</p>}
                          {p.customer.phone && <p className="text-muted-foreground">{formatPhone(p.customer.phone)}</p>}
                        </div>
                        <ArrowRight className="w-4 h-4 text-muted-foreground" />
                        <div>
                          <div className="text-muted-foreground text-[10px] uppercase tracking-wide mb-0.5">Consultant (kept)</div>
                          <p className="text-foreground">{p.consultant.name}</p>
                          {p.consultant.email && <p className="text-muted-foreground truncate">{p.consultant.email}</p>}
                          {p.consultant.phone && <p className="text-muted-foreground">{formatPhone(p.consultant.phone)}</p>}
                        </div>
                      </div>
                    </div>
                    <Button size="sm" variant="outline" className="gap-1.5 shrink-0" onClick={() => open(p)}>
                      <GitMerge className="w-3.5 h-3.5" />Review
                    </Button>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        </>
      )}

      <AlertDialog open={!!target} onOpenChange={(o) => { if (!o) { setTarget(null); setCounts(null); } }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Migrate {target?.customer.full_name}?</AlertDialogTitle>
            <AlertDialogDescription asChild>
              <div className="space-y-3 text-sm">
                <p>All data from the customer record will be merged onto consultant <strong>{target?.consultant.name}</strong>, then the customer record will be deleted.</p>
                <div className="border border-border rounded-md p-3 bg-muted/30">
                  <div className="text-xs font-semibold mb-2">Records that will be re-pointed:</div>
                  {counts === null ? (
                    <div className="flex items-center gap-2 text-xs text-muted-foreground"><Loader2 className="w-3 h-3 animate-spin" /> Counting…</div>
                  ) : (
                    <ul className="text-xs space-y-0.5">
                      {Object.entries(counts).map(([k, v]) => (
                        <li key={k} className="flex justify-between"><span>{k}</span><span className="font-mono">{v}</span></li>
                      ))}
                    </ul>
                  )}
                </div>
                <p className="text-xs text-muted-foreground">Consultant fields that are empty will be filled from the customer. Tags are merged. Notes are appended. Different email/phone is saved as secondary.</p>
              </div>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={() => target && migrate.mutate(target)} disabled={migrate.isPending || counts === null}>
              {migrate.isPending ? "Migrating…" : "Migrate"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
