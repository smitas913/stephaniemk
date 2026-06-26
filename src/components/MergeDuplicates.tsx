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
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command";
import { Loader2, GitMerge, CheckCircle2, AlertTriangle, ChevronsUpDown, Check } from "lucide-react";
import { cn } from "@/lib/utils";
import { toast } from "sonner";

interface DuplicatePair {
  customer: Customer;
  consultant: TeamConsultant;
  matchType: "email" | "phone" | "name";
}

interface CustomerDupGroup {
  primary: Customer;
  duplicate: Customer;
  matchType: "email" | "phone";
}

function normalize(s: string | null | undefined): string {
  return (s || "").toLowerCase().trim().replace(/\s+/g, " ");
}

function normalizePhone(p: string | null | undefined): string {
  return stripPhone(p);
}

export default function MergeDuplicates() {
  const queryClient = useQueryClient();
  const { data: customers = [], isLoading: loadingC } = useQuery({ queryKey: ["customers"], queryFn: fetchCustomers });
  const { data: consultants = [], isLoading: loadingT } = useQuery({ queryKey: ["team-consultants"], queryFn: fetchTeamConsultants });

  const [mergeTarget, setMergeTarget] = useState<DuplicatePair | null>(null);
  const [customerMergeTarget, setCustomerMergeTarget] = useState<CustomerDupGroup | null>(null);
  const [mergedIds, setMergedIds] = useState<Set<string>>(new Set());
  const [mergedCustomerIds, setMergedCustomerIds] = useState<Set<string>>(new Set());

  // Manual merge state
  const [manualKeepId, setManualKeepId] = useState<string>("");
  const [manualMergeId, setManualMergeId] = useState<string>("");
  const [keepOpen, setKeepOpen] = useState(false);
  const [mergeOpen, setMergeOpen] = useState(false);
  const [manualConfirmOpen, setManualConfirmOpen] = useState(false);

  const duplicates = useMemo(() => {
    const pairs: DuplicatePair[] = [];
    const usedCustomerIds = new Set<string>();

    for (const consultant of consultants) {
      if (consultant.email) {
        const emailMatch = customers.find(
          (c) => !usedCustomerIds.has(c.id) && c.email && normalize(c.email) === normalize(consultant.email)
        );
        if (emailMatch) {
          pairs.push({ customer: emailMatch, consultant, matchType: "email" });
          usedCustomerIds.add(emailMatch.id);
          continue;
        }
      }

      if (consultant.phone) {
        const phoneMatch = customers.find(
          (c) => !usedCustomerIds.has(c.id) && c.phone && normalizePhone(c.phone) === normalizePhone(consultant.phone) && normalizePhone(c.phone).length >= 7
        );
        if (phoneMatch) {
          pairs.push({ customer: phoneMatch, consultant, matchType: "phone" });
          usedCustomerIds.add(phoneMatch.id);
          continue;
        }
      }

      const nameMatch = customers.find(
        (c) => !usedCustomerIds.has(c.id) && normalize(c.full_name) === normalize(consultant.name) && normalize(c.full_name).length > 2
      );
      if (nameMatch) {
        pairs.push({ customer: nameMatch, consultant, matchType: "name" });
        usedCustomerIds.add(nameMatch.id);
      }
    }

    return pairs.filter((p) => !mergedIds.has(p.customer.id));
  }, [customers, consultants, mergedIds]);

  // Customer ↔ Customer duplicate detection (by normalized phone or email)
  const customerDuplicates = useMemo<CustomerDupGroup[]>(() => {
    const groups: CustomerDupGroup[] = [];
    const seen = new Set<string>();
    const phoneMap = new Map<string, Customer[]>();
    const emailMap = new Map<string, Customer[]>();
    for (const c of customers) {
      if (mergedCustomerIds.has(c.id)) continue;
      const p = normalizePhone(c.phone);
      const e = normalizeEmail(c.email);
      if (p && p.length >= 7) {
        if (!phoneMap.has(p)) phoneMap.set(p, []);
        phoneMap.get(p)!.push(c);
      }
      if (e) {
        if (!emailMap.has(e)) emailMap.set(e, []);
        emailMap.get(e)!.push(c);
      }
    }
    const pickPrimary = (arr: Customer[]) => {
      // Prefer the oldest record (earliest created_at); fall back to first.
      return [...arr].sort((a, b) => (a.created_at || "").localeCompare(b.created_at || ""))[0];
    };
    for (const [, arr] of phoneMap) {
      if (arr.length < 2) continue;
      const primary = pickPrimary(arr);
      for (const dup of arr) {
        if (dup.id === primary.id) continue;
        const key = [primary.id, dup.id].sort().join("|");
        if (seen.has(key)) continue;
        seen.add(key);
        groups.push({ primary, duplicate: dup, matchType: "phone" });
      }
    }
    for (const [, arr] of emailMap) {
      if (arr.length < 2) continue;
      const primary = pickPrimary(arr);
      for (const dup of arr) {
        if (dup.id === primary.id) continue;
        const key = [primary.id, dup.id].sort().join("|");
        if (seen.has(key)) continue;
        seen.add(key);
        groups.push({ primary, duplicate: dup, matchType: "email" });
      }
    }
    return groups;
  }, [customers, mergedCustomerIds]);

  const mergeMutation = useMutation({
    mutationFn: async (pair: DuplicatePair) => {
      const { customer, consultant } = pair;

      const updates: Record<string, any> = {};
      if (customer.email && normalize(customer.email) !== normalize(consultant.email)) {
        updates.secondary_email = customer.email;
      }
      if (customer.phone && normalizePhone(customer.phone) !== normalizePhone(consultant.phone)) {
        updates.secondary_phone = customer.phone;
      }

      if (customer.notes) {
        const existingNotes = consultant.notes || "";
        const mergedNotes = existingNotes
          ? `${existingNotes}\n\n--- Merged from customer record ---\n${customer.notes}`
          : `Merged from customer record:\n${customer.notes}`;
        updates.notes = mergedNotes;
      }

      if (!consultant.birthday && (customer as any).birthday) updates.birthday = (customer as any).birthday;
      if (!consultant.address_line_1 && customer.address_line_1) updates.address_line_1 = customer.address_line_1;
      if (!consultant.city && customer.city) updates.city = customer.city;
      if (!consultant.state_territory && customer.state_territory) updates.state_territory = customer.state_territory;
      if (!consultant.postal_code && customer.postal_code) updates.postal_code = customer.postal_code;

      if (Object.keys(updates).length > 0) {
        const { error: updateErr } = await supabase
          .from("team_consultants")
          .update(updates as any)
          .eq("id", consultant.id);
        if (updateErr) throw updateErr;
      }

      const { error: custErr } = await supabase
        .from("customers")
        .update({
          relationship_status: "Consultant",
          next_follow_up_date: null,
          follow_up_reason: null,
          new_follow_up_stage: null,
        } as any)
        .eq("id", customer.id);
      if (custErr) throw custErr;
    },
    onSuccess: (_, pair) => {
      setMergedIds((prev) => new Set(prev).add(pair.customer.id));
      queryClient.invalidateQueries({ queryKey: ["customers"] });
      queryClient.invalidateQueries({ queryKey: ["team-consultants"] });
      setMergeTarget(null);
      toast.success(`Merged ${pair.customer.full_name} into consultant record`);
    },
    onError: (err: any) => {
      toast.error(err.message || "Merge failed");
    },
  });

  const mergeAllMutation = useMutation({
    mutationFn: async () => {
      for (const pair of duplicates) {
        await mergeMutation.mutateAsync(pair);
      }
    },
    onSuccess: () => {
      toast.success("All duplicates merged");
    },
  });

  // Customer ↔ Customer merge: keep `primary`, re-point related rows from `duplicate`, then delete duplicate.
  const customerMergeMutation = useMutation({
    mutationFn: async (group: CustomerDupGroup) => {
      const { primary, duplicate } = group;

      const tablesToReassign: { table: string; col: string }[] = [
        { table: "orders", col: "customer_id" },
        { table: "customer_notes", col: "customer_id" },
        { table: "notes", col: "customer_id" },
        { table: "daily_plan_items", col: "customer_id" },
        { table: "catalog_campaign_customers", col: "customer_id" },
        { table: "event_guests", col: "converted_customer_id" },
        { table: "booking_leads", col: "converted_customer_id" },
      ];
      for (const { table, col } of tablesToReassign) {
        const { error } = await supabase.from(table as any).update({ [col]: primary.id } as any).eq(col, duplicate.id);
        if (error) throw error;
      }

      const fillUpdates: Record<string, any> = {};
      const cols = ["phone", "email", "address_line_1", "address_line_2", "city", "state_territory", "postal_code", "birthday"];
      for (const k of cols) {
        if (!(primary as any)[k] && (duplicate as any)[k]) fillUpdates[k] = (duplicate as any)[k];
      }
      if (duplicate.notes) {
        fillUpdates.notes = primary.notes
          ? `${primary.notes}\n\n--- Merged from duplicate record ---\n${duplicate.notes}`
          : `Merged from duplicate record:\n${duplicate.notes}`;
      }
      if (Object.keys(fillUpdates).length > 0) {
        const { error } = await supabase.from("customers").update(fillUpdates as any).eq("id", primary.id);
        if (error) throw error;
      }

      const { error: delErr } = await supabase.from("customers").delete().eq("id", duplicate.id);
      if (delErr) throw delErr;
    },
    onSuccess: (_, group) => {
      setMergedCustomerIds((prev) => new Set(prev).add(group.duplicate.id));
      queryClient.invalidateQueries({ queryKey: ["customers"] });
      queryClient.invalidateQueries({ queryKey: ["orders"] });
      setCustomerMergeTarget(null);
      toast.success(`Merged ${group.duplicate.full_name} into ${group.primary.full_name}`);
    },
    onError: (err: any) => toast.error(err.message || "Merge failed"),
  });

  const isLoading = loadingC || loadingT;

  const matchBadge = (type: string) => {
    if (type === "email") return <Badge className="text-[10px] bg-primary/15 text-primary">Email Match</Badge>;
    if (type === "phone") return <Badge className="text-[10px] bg-accent text-accent-foreground">Phone Match</Badge>;
    return <Badge variant="outline" className="text-[10px]">Name Match</Badge>;
  };

  return (
    <div className="space-y-4 max-w-2xl">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-sm font-semibold text-foreground">Merge Duplicates</h3>
          <p className="text-xs text-muted-foreground">Detect people who exist in both Customers and Consultants</p>
        </div>
        {duplicates.length > 1 && (
          <Button
            size="sm"
            variant="outline"
            className="gap-1.5"
            onClick={() => mergeAllMutation.mutate()}
            disabled={mergeAllMutation.isPending}
          >
            {mergeAllMutation.isPending && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
            Merge All ({duplicates.length})
          </Button>
        )}
      </div>

      {isLoading ? (
        <div className="flex items-center justify-center py-8">
          <Loader2 className="w-5 h-5 animate-spin text-muted-foreground" />
        </div>
      ) : duplicates.length === 0 ? (
        <Card className="border-border/50">
          <CardContent className="p-6 text-center">
            <CheckCircle2 className="w-8 h-8 text-primary mx-auto mb-2" />
            <p className="text-sm font-medium text-foreground">No duplicates found</p>
            <p className="text-xs text-muted-foreground mt-1">All customers and consultants are unique records</p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-2">
          <p className="text-xs text-muted-foreground">
            <AlertTriangle className="w-3.5 h-3.5 inline mr-1" />
            Found {duplicates.length} potential duplicate{duplicates.length !== 1 ? "s" : ""}. Consultant record will be kept as primary.
          </p>
          {duplicates.map((pair) => (
            <Card key={`${pair.customer.id}-${pair.consultant.id}`} className="border-border/50 shadow-sm">
              <CardContent className="p-4">
                <div className="flex items-start justify-between gap-3">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap mb-1">
                      <span className="text-sm font-semibold text-foreground">{pair.consultant.name}</span>
                      {matchBadge(pair.matchType)}
                    </div>
                    <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-xs">
                      <div>
                        <span className="text-muted-foreground">Customer:</span>
                        <p className="text-foreground">{pair.customer.full_name}</p>
                        {pair.customer.email && <p className="text-muted-foreground">{pair.customer.email}</p>}
                        {pair.customer.phone && <p className="text-muted-foreground">{pair.customer.phone}</p>}
                      </div>
                      <div>
                        <span className="text-muted-foreground">Consultant:</span>
                        <p className="text-foreground">{pair.consultant.name}</p>
                        {pair.consultant.email && <p className="text-muted-foreground">{pair.consultant.email}</p>}
                        {pair.consultant.phone && <p className="text-muted-foreground">{pair.consultant.phone}</p>}
                      </div>
                    </div>
                  </div>
                  <Button
                    size="sm"
                    variant="outline"
                    className="gap-1.5 shrink-0"
                    onClick={() => setMergeTarget(pair)}
                  >
                    <GitMerge className="w-3.5 h-3.5" />Merge
                  </Button>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* Customer ↔ Customer duplicates */}
      <div className="pt-4">
        <h3 className="text-sm font-semibold text-foreground">Duplicate Customers</h3>
        <p className="text-xs text-muted-foreground mb-2">Multiple customer records that share a phone number or email</p>
        {customerDuplicates.length === 0 ? (
          <Card className="border-border/50">
            <CardContent className="p-4 text-center">
              <CheckCircle2 className="w-6 h-6 text-primary mx-auto mb-1" />
              <p className="text-xs text-muted-foreground">No duplicate customer records found</p>
            </CardContent>
          </Card>
        ) : (
          <div className="space-y-2">
            <p className="text-xs text-muted-foreground">
              <AlertTriangle className="w-3.5 h-3.5 inline mr-1" />
              Found {customerDuplicates.length} duplicate{customerDuplicates.length !== 1 ? "s" : ""}. Older record kept as primary; orders &amp; notes will be re-pointed.
            </p>
            {customerDuplicates.map((g) => (
              <Card key={`${g.primary.id}-${g.duplicate.id}`} className="border-border/50 shadow-sm">
                <CardContent className="p-4">
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap mb-1">
                        <span className="text-sm font-semibold text-foreground">{g.primary.full_name}</span>
                        {matchBadge(g.matchType)}
                      </div>
                      <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-xs">
                        <div>
                          <span className="text-muted-foreground">Keep:</span>
                          <p className="text-foreground">{g.primary.full_name}</p>
                          {g.primary.phone && <p className="text-muted-foreground">{formatPhone(g.primary.phone)}</p>}
                          {g.primary.email && <p className="text-muted-foreground">{g.primary.email}</p>}
                        </div>
                        <div>
                          <span className="text-muted-foreground">Merge in:</span>
                          <p className="text-foreground">{g.duplicate.full_name}</p>
                          {g.duplicate.phone && <p className="text-muted-foreground">{formatPhone(g.duplicate.phone)}</p>}
                          {g.duplicate.email && <p className="text-muted-foreground">{g.duplicate.email}</p>}
                        </div>
                      </div>
                    </div>
                    <Button size="sm" variant="outline" className="gap-1.5 shrink-0" onClick={() => setCustomerMergeTarget(g)}>
                      <GitMerge className="w-3.5 h-3.5" />Merge
                    </Button>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </div>

      <AlertDialog open={!!mergeTarget} onOpenChange={(open) => !open && setMergeTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Merge Duplicate?</AlertDialogTitle>
            <AlertDialogDescription>
              This will merge <strong>{mergeTarget?.customer.full_name}</strong> (Customer) into <strong>{mergeTarget?.consultant.name}</strong> (Consultant).
              {"\n\n"}• Consultant contact info stays primary{"\n"}
              • Different customer email/phone saved as secondary{"\n"}
              • All order history preserved{"\n"}
              • Customer removed from follow-up workflows
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => mergeTarget && mergeMutation.mutate(mergeTarget)}
              disabled={mergeMutation.isPending}
            >
              {mergeMutation.isPending ? "Merging..." : "Merge"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={!!customerMergeTarget} onOpenChange={(open) => !open && setCustomerMergeTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Merge Duplicate Customers?</AlertDialogTitle>
            <AlertDialogDescription>
              Merge <strong>{customerMergeTarget?.duplicate.full_name}</strong> into <strong>{customerMergeTarget?.primary.full_name}</strong>.
              {"\n\n"}• Orders, notes, follow-ups & event guests are re-pointed to the primary{"\n"}
              • Missing fields on the primary are filled from the duplicate{"\n"}
              • The duplicate record is then deleted
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => customerMergeTarget && customerMergeMutation.mutate(customerMergeTarget)}
              disabled={customerMergeMutation.isPending}
            >
              {customerMergeMutation.isPending ? "Merging..." : "Merge"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
