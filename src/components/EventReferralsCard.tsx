import { useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { Checkbox } from "@/components/ui/checkbox";
import { Users, ChevronDown, ChevronRight, Trash2, Plane } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { createBookingLead } from "@/lib/queries";
import { toast } from "sonner";
import { formatPhone } from "@/lib/phoneUtils";

type Referral = {
  id: string;
  event_id: string;
  name: string;
  phone: string | null;
  referred_by: string | null;
  out_of_town: boolean;
  added_to_leads: boolean;
};

interface Props {
  eventId: string;
  hostessName?: string | null;
}

export default function EventReferralsCard({ eventId, hostessName }: Props) {
  const [open, setOpen] = useState(true);
  const [referrals, setReferrals] = useState<Referral[]>([]);
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [referredBy, setReferredBy] = useState("");
  const [outOfTown, setOutOfTown] = useState(false);
  const [saving, setSaving] = useState(false);

  const load = async () => {
    const { data, error } = await (supabase as any)
      .from("event_referrals")
      .select("id, event_id, name, phone, referred_by, out_of_town, added_to_leads")
      .eq("event_id", eventId)
      .order("created_at", { ascending: false });
    if (error) { console.error(error); return; }
    setReferrals((data as Referral[]) || []);
  };

  useEffect(() => { load(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [eventId]);

  const handleAdd = async () => {
    const trimmed = name.trim();
    if (!trimmed) return;
    setSaving(true);
    const userId = (await supabase.auth.getUser()).data.user?.id;
    const { error } = await (supabase as any).from("event_referrals").insert({
      event_id: eventId,
      name: trimmed,
      phone: phone.trim() || null,
      referred_by: referredBy.trim() || null,
      out_of_town: outOfTown,
      owner_user_id: userId,
    });
    setSaving(false);
    if (error) {
      toast.error(error.message || "Couldn't add referral");
      return;
    }
    setName(""); setPhone(""); setReferredBy(""); setOutOfTown(false);
    load();
  };

  const handleAddToLeads = async (ref: Referral) => {
    try {
      const noteHost = hostessName?.trim() || "the party";
      const refBy = ref.referred_by?.trim();
      const notes = refBy
        ? `Referred by ${refBy} at ${noteHost}'s party`
        : `Referred at ${noteHost}'s party`;
      await createBookingLead({
        name: ref.name,
        phone: ref.phone || undefined,
        lead_source: "Referral",
        status: "New Contact",
        notes,
      } as any);
      await (supabase as any)
        .from("event_referrals")
        .update({ added_to_leads: true })
        .eq("id", ref.id);
      toast.success(`${ref.name} added to booking leads`);
      load();
    } catch (e: any) {
      toast.error(e.message || "Failed to add to booking leads");
    }
  };

  const handleDelete = async (id: string) => {
    await (supabase as any).from("event_referrals").delete().eq("id", id);
    load();
  };

  return (
    <Card className="border-border/50">
      <Collapsible open={open} onOpenChange={setOpen}>
        <CardHeader className="pb-2">
          <CollapsibleTrigger className="flex items-center gap-2 w-full text-left">
            {open ? <ChevronDown className="w-4 h-4 text-muted-foreground" /> : <ChevronRight className="w-4 h-4 text-muted-foreground" />}
            <Users className="w-4 h-4 text-primary" />
            <CardTitle className="text-sm">Referrals from this event</CardTitle>
            {referrals.length > 0 && (
              <span className="text-xs text-muted-foreground ml-auto">{referrals.length}</span>
            )}
          </CollapsibleTrigger>
        </CardHeader>
        <CollapsibleContent>
          <CardContent className="space-y-3">
            {/* Add form */}
            <div className="grid grid-cols-1 sm:grid-cols-12 gap-2">
              <Input
                placeholder="Name *"
                value={name}
                onChange={(e) => setName(e.target.value)}
                className="h-9 text-sm sm:col-span-3"
              />
              <Input
                placeholder="Phone"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                className="h-9 text-sm sm:col-span-3"
              />
              <Input
                placeholder="Referred by"
                value={referredBy}
                onChange={(e) => setReferredBy(e.target.value)}
                className="h-9 text-sm sm:col-span-3"
              />
              <label className="flex items-center gap-1.5 text-xs text-muted-foreground sm:col-span-2">
                <Checkbox checked={outOfTown} onCheckedChange={(v) => setOutOfTown(!!v)} />
                Out of town
              </label>
              <Button
                size="sm"
                className="h-9 sm:col-span-1"
                disabled={!name.trim() || saving}
                onClick={handleAdd}
              >
                Add
              </Button>
            </div>

            {/* List */}
            {referrals.length === 0 ? (
              <p className="text-xs text-muted-foreground py-1">No referrals yet — capture them above as guests mention friends.</p>
            ) : (
              <ul className="divide-y divide-border/40">
                {referrals.map((r) => (
                  <li key={r.id} className="py-2 flex items-center gap-2">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <p className="text-sm font-medium text-foreground">{r.name}</p>
                        {r.phone && <span className="text-xs text-muted-foreground">{formatPhone(r.phone)}</span>}
                        {r.out_of_town && (
                          <span className="inline-flex items-center gap-1 text-[10px] px-1.5 py-0.5 rounded bg-amber-100 text-amber-700">
                            <Plane className="w-3 h-3" /> Out of town
                          </span>
                        )}
                        {r.added_to_leads && (
                          <span className="text-[10px] px-1.5 py-0.5 rounded bg-green-100 text-green-700 font-medium">In leads ✓</span>
                        )}
                      </div>
                      {r.referred_by && (
                        <p className="text-[11px] text-muted-foreground mt-0.5">Referred by {r.referred_by}</p>
                      )}
                    </div>
                    {!r.added_to_leads && (
                      <Button size="sm" variant="outline" className="h-7 text-xs" onClick={() => handleAddToLeads(r)}>
                        Add to Booking Leads
                      </Button>
                    )}
                    <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => handleDelete(r.id)} aria-label="Delete">
                      <Trash2 className="w-3.5 h-3.5 text-destructive" />
                    </Button>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </CollapsibleContent>
      </Collapsible>
    </Card>
  );
}
