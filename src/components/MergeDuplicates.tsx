import { useState, useMemo } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { fetchCustomers, fetchTeamConsultants } from "@/lib/queries";
import type { Customer, TeamConsultant } from "@/lib/types";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { Loader2, GitMerge, CheckCircle2, AlertTriangle } from "lucide-react";
import { toast } from "sonner";

interface DuplicatePair {
  customer: Customer;
  consultant: TeamConsultant;
  matchType: "email" | "phone" | "name";
}

function normalize(s: string | null | undefined): string {
  return (s || "").toLowerCase().trim().replace(/\s+/g, " ");
}

function normalizePhone(p: string | null | undefined): string {
  if (!p) return "";
  const digits = p.replace(/\D/g, "");
  return digits.length === 11 && digits.startsWith("1") ? digits.slice(1) : digits;
}

export default function MergeDuplicates() {
  const queryClient = useQueryClient();
  const { data: customers = [], isLoading: loadingC } = useQuery({ queryKey: ["customers"], queryFn: fetchCustomers });
  const { data: consultants = [], isLoading: loadingT } = useQuery({ queryKey: ["team-consultants"], queryFn: fetchTeamConsultants });

  const [mergeTarget, setMergeTarget] = useState<DuplicatePair | null>(null);
  const [mergedIds, setMergedIds] = useState<Set<string>>(new Set());

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
    </div>
  );
}
