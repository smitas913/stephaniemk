import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { fetchCustomers } from "@/lib/queries";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { cn } from "@/lib/utils";
import { Download, Contact } from "lucide-react";
import { MONTH_LABELS, birthdayMonthDay } from "@/lib/birthday";
import { toLocalDateKey } from "@/lib/dateOnly";
import { buildCustomersCsv, buildCustomersVcf, downloadText, toE164 } from "@/lib/customerExport";
import { toast } from "sonner";

export default function CustomerExportDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (v: boolean) => void }) {
  const { data: customers = [] } = useQuery({ queryKey: ["customers"], queryFn: fetchCustomers, enabled: open });
  const [mode, setMode] = useState<"all" | "tags">("all");
  const [tags, setTags] = useState<string[]>([]);
  const [month, setMonth] = useState<string>("any");
  const [phoneOnly, setPhoneOnly] = useState(true);
  const [excludeInactive, setExcludeInactive] = useState(true);

  const allTags = useMemo(() => {
    const s = new Set<string>();
    customers.forEach((c: any) => (c.tags || []).forEach((t: string) => t && s.add(t)));
    return [...s].sort((a, b) => a.localeCompare(b));
  }, [customers]);

  const matches = useMemo(() => {
    return customers.filter((c: any) => {
      if (excludeInactive && (!c.is_active || c.archived_at)) return false;
      if (mode === "tags" && tags.length > 0 && !(c.tags || []).some((t: string) => tags.includes(t))) return false;
      if (month !== "any") {
        const md = birthdayMonthDay(c);
        if (!md || md.month !== Number(month)) return false;
      }
      if (phoneOnly && !toE164(c.phone)) return false;
      return true;
    });
  }, [customers, mode, tags, month, phoneOnly, excludeInactive]);

  const stamp = toLocalDateKey();
  const download = (kind: "csv" | "vcf") => {
    if (!matches.length) return;
    if (kind === "csv") downloadText(buildCustomersCsv(matches as any), `charm-customers-${stamp}.csv`, "text/csv;charset=utf-8");
    else downloadText(buildCustomersVcf(matches as any), `charm-customers-${stamp}.vcf`, "text/vcard;charset=utf-8");
    toast.success(`Exported ${matches.length} customer${matches.length === 1 ? "" : "s"}`);
  };

  const toggleTag = (t: string) => setTags((p) => (p.includes(t) ? p.filter((x) => x !== t) : [...p, t]));

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Export customers</DialogTitle>
          <DialogDescription>For Phound Wave or your phone contacts.</DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          <div className="space-y-2">
            <Label>Who to export</Label>
            <div className="flex flex-wrap gap-2">
              {(["all", "tags"] as const).map((m) => (
                <Button key={m} type="button" size="sm" variant={mode === m ? "default" : "outline"} className="rounded-full" onClick={() => setMode(m)}>
                  {m === "all" ? "All active customers" : "Filter by tags"}
                </Button>
              ))}
            </div>
            {mode === "tags" && (
              <div className="flex flex-wrap gap-1.5 max-h-40 overflow-y-auto rounded-md border p-2">
                {allTags.length === 0 && <p className="text-xs text-muted-foreground">No tags yet.</p>}
                {allTags.map((t) => (
                  <button
                    key={t}
                    type="button"
                    onClick={() => toggleTag(t)}
                    aria-pressed={tags.includes(t)}
                    className={cn(
                      "px-2.5 py-1 rounded-full border text-xs font-medium",
                      tags.includes(t) ? "border-primary bg-primary text-primary-foreground" : "border-border bg-card text-muted-foreground",
                    )}
                  >
                    {t}
                  </button>
                ))}
              </div>
            )}
          </div>
          <div className="space-y-2">
            <Label>Birthday month (optional)</Label>
            <Select value={month} onValueChange={setMonth}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="any">Any month</SelectItem>
                {MONTH_LABELS.map((m, i) => <SelectItem key={m} value={String(i + 1)}>{m}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <label className="flex items-center gap-2 text-sm">
            <Checkbox checked={phoneOnly} onCheckedChange={(v) => setPhoneOnly(!!v)} />
            Only customers with a mobile phone
          </label>
          <label className="flex items-center gap-2 text-sm">
            <Checkbox checked={excludeInactive} onCheckedChange={(v) => setExcludeInactive(!!v)} />
            Exclude archived / inactive
          </label>
          <div className="rounded-md bg-accent/50 p-3 text-sm">
            <span className="font-semibold tabular-nums text-primary">{matches.length}</span> matching customer{matches.length === 1 ? "" : "s"}
          </div>
          <div className="flex flex-col sm:flex-row gap-2">
            <Button className="flex-1" disabled={!matches.length} onClick={() => download("csv")}>
              <Download className="w-4 h-4 mr-1" />Download CSV
            </Button>
            <Button className="flex-1" variant="outline" disabled={!matches.length} onClick={() => download("vcf")}>
              <Contact className="w-4 h-4 mr-1" />Download contacts (.vcf)
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
