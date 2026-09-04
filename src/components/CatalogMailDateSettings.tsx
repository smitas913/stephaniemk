import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { fetchUserPreferences, upsertUserPreferences } from "@/lib/queries";
import {
  CATALOG_HEADS_UP_LEAD_DAYS,
  CATALOG_FOLLOW_UP_LAG_DAYS,
} from "@/lib/computedFields";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { BookOpen } from "lucide-react";
import { toast } from "sonner";

/**
 * Single global "Next Catalog Mail Date". Stephanie updates this each time
 * Mary Kay announces a new catalog (~4x/year); it drives the catalog
 * heads-up / follow-up / virtual-catalog touchpoints for Active & Warm customers.
 */
export default function CatalogMailDateSettings() {
  const qc = useQueryClient();
  const { data: prefs } = useQuery({ queryKey: ["user-preferences"], queryFn: fetchUserPreferences });
  const [value, setValue] = useState("");

  useEffect(() => {
    setValue(prefs?.next_catalog_mail_date ? prefs.next_catalog_mail_date.slice(0, 10) : "");
  }, [prefs?.next_catalog_mail_date]);

  const saveMut = useMutation({
    mutationFn: () => upsertUserPreferences({ next_catalog_mail_date: value || null }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["user-preferences"] });
      qc.invalidateQueries({ queryKey: ["customers"] });
      toast.success(value ? "Catalog mail date saved" : "Catalog mail date cleared");
    },
    onError: (e: any) => toast.error(e?.message || "Could not save"),
  });

  const dirty = (prefs?.next_catalog_mail_date?.slice(0, 10) || "") !== value;

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-base flex items-center gap-2">
          <BookOpen className="w-4 h-4 text-primary" />
          Catalog Schedule
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="space-y-1.5 max-w-xs">
          <Label htmlFor="catalog-mail-date">Next Catalog Mail Date</Label>
          <Input
            id="catalog-mail-date"
            type="date"
            value={value}
            onChange={(e) => setValue(e.target.value)}
          />
          <p className="text-xs text-muted-foreground">
            Find this on InTouch under Preferred Customer Program.
          </p>
        </div>
        <p className="text-xs text-muted-foreground">
          Customers on the PCP list get a heads-up text 7 days before and a follow-up text 5 days after.
          Everyone else who's Active or Warm gets a virtual catalog text on the mail date.
        </p>
        <Button size="sm" disabled={!dirty || saveMut.isPending} onClick={() => saveMut.mutate()}>
          {saveMut.isPending ? "Saving…" : "Save"}
        </Button>
      </CardContent>
    </Card>
  );
}
