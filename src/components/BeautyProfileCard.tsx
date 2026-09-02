import { useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Sparkles, Pencil, Save, X, Loader2 } from "lucide-react";
import { updateCustomer } from "@/lib/queries";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import BeautyProfileFields from "@/components/BeautyProfileFields";
import {
  cleanBeautyProfile,
  isBeautyProfileEmpty,
  parseBeautyProfile,
  type BeautyProfile,
} from "@/lib/beautyProfile";
import { syncWishListReferrals } from "@/lib/beautyReferrals";
import BeautyProfileSummary from "@/components/BeautyProfileSummary";

/**
 * Digital Mary Kay Beauty Profile card (form 10-260112) for a customer.
 * Persists into the existing `beauty_notes` jsonb column.
 */
export default function BeautyProfileCard({
  customerId,
  customerName,
  value,
}: {
  customerId: string;
  customerName?: string;
  value: unknown;
}) {
  const qc = useQueryClient();
  const [editing, setEditing] = useState(false);
  const saved = parseBeautyProfile(value);
  const [draft, setDraft] = useState<BeautyProfile>(saved);

  useEffect(() => {
    setDraft(parseBeautyProfile(value));
  }, [value, editing]);

  const save = useMutation({
    mutationFn: async (next: BeautyProfile) => {
      const clean = cleanBeautyProfile(next);
      const { profile, created } = await syncWishListReferrals(clean, customerName || "");
      await updateCustomer(customerId, { beauty_notes: profile } as any);
      return created;
    },
    onSuccess: (created) => {
      qc.invalidateQueries({ queryKey: ["customer", customerId] });
      qc.invalidateQueries({ queryKey: ["customers"] });
      qc.invalidateQueries({ queryKey: ["booking-leads"] });
      toast.success(
        created ? `Beauty Profile saved — ${created} referral lead${created === 1 ? "" : "s"} added` : "Beauty Profile saved",
      );
      setEditing(false);
    },
    onError: (e: any) => toast.error(e.message || "Failed to save"),
  });

  return (
    <Card className="border-border/50 shadow-sm">
      <CardHeader className="flex flex-row items-center justify-between pb-2">
        <CardTitle className="text-base flex items-center gap-2">
          <Sparkles className="h-4 w-4 text-primary" />
          Beauty Profile
          {!isBeautyProfileEmpty(saved) && (
            <Badge variant="secondary" className="font-normal text-[10px]">On file</Badge>
          )}
        </CardTitle>
        {editing ? (
          <div className="flex gap-1">
            <Button size="sm" variant="ghost" onClick={() => setEditing(false)} disabled={save.isPending}>
              <X className="h-4 w-4" />
            </Button>
            <Button size="sm" onClick={() => save.mutate(draft)} disabled={save.isPending}>
              {save.isPending ? <Loader2 className="h-4 w-4 mr-1 animate-spin" /> : <Save className="h-4 w-4 mr-1" />}
              Save
            </Button>
          </div>
        ) : (
          <Button size="sm" variant="ghost" onClick={() => setEditing(true)}>
            <Pencil className="h-4 w-4 mr-1" /> Edit
          </Button>
        )}
      </CardHeader>
      <CardContent>
        {editing ? (
          <BeautyProfileFields value={draft} onChange={setDraft} />
        ) : isBeautyProfileEmpty(saved) ? (
          <p className="text-sm text-muted-foreground">
            No Beauty Profile yet. Click Edit to fill in the card — age range, skin care needs, foundation, interests and
            referrals — or scan a printed card to fill it in for you.
          </p>
        ) : (
          <BeautyProfileSummary profile={saved} />
        )}
      </CardContent>
    </Card>
  );
}
