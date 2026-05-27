import { useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { fetchCustomers, fetchOrders } from "@/lib/queries";
import { supabase } from "@/integrations/supabase/client";
import { stripPhone, normalizePhoneForStorage } from "@/lib/phoneUtils";
import { toLocalDateKey } from "@/lib/dateOnly";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Upload, FileSpreadsheet, CheckCircle2, AlertTriangle } from "lucide-react";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import { addDays, format } from "date-fns";

type ParsedRow = {
  first_name: string;
  last_name: string;
  phone: string; // normalized digits
  phoneRaw: string;
  email: string;
  street: string;
  street2: string;
  city: string;
  state: string;
  zip: string;
  pcp_program: string;
};

type MatchPlan = {
  row: ParsedRow;
  action: "update" | "create" | "skip";
  customerId?: string;
  customerName?: string;
  reason: string;
};

type Step = "upload" | "preview" | "running" | "summary";

const SEASONS = ["Spring", "Summer", "Fall", "Holiday", "Winter"];

function parseSeason(program: string): string {
  const m = SEASONS.find((s) => program.toLowerCase().includes(s.toLowerCase()));
  return m || "Catalog";
}

// Find column index by trying matchers in order; first match wins.
function findCol(row: string[], matchers: ((c: string) => boolean)[]): number {
  for (const m of matchers) {
    const j = row.findIndex(m);
    if (j >= 0) return j;
  }
  return -1;
}

function pickHeaderRow(rows: any[][]): { idx: number; map: Record<string, number> } | null {
  for (let i = 0; i < Math.min(5, rows.length); i++) {
    const row = (rows[i] || []).map((c) => String(c ?? "").toLowerCase().trim());
    // Header row must contain "first name" (exact, trimmed, case-insensitive)
    if (!row.some((c) => c === "first name")) continue;

    const eq = (s: string) => (c: string) => c === s;
    const has = (s: string) => (c: string) => c.includes(s);

    const map: Record<string, number> = {
      "first name": findCol(row, [eq("first name")]),
      "last name": findCol(row, [eq("last name")]),
      "phone": findCol(row, [
        eq("phone"),
        eq("phone number"),
        eq("mobile phone"),
        eq("cell phone"),
        eq("home phone"),
        has("phone"),
      ]),
      "personal email address": findCol(row, [
        eq("personal email address"),
        eq("email address"),
        eq("email"),
        has("email"),
      ]),
      "street": findCol(row, [eq("street"), eq("address"), eq("address 1"), eq("street 1"), eq("address line 1")]),
      "street 2": findCol(row, [eq("street 2"), eq("address 2"), eq("address line 2")]),
      "city": findCol(row, [eq("city")]),
      "state": findCol(row, [eq("state"), eq("state/province"), eq("province")]),
      "zip code": findCol(row, [eq("zip code"), eq("zip"), eq("postal code")]),
      "pcp program": findCol(row, [eq("pcp program"), eq("program"), has("pcp")]),
    };

    if (map["first name"] >= 0 && map["last name"] >= 0 && map["phone"] >= 0) {
      // Strip out -1s so caller's `key in map` check still works correctly
      const clean: Record<string, number> = {};
      Object.entries(map).forEach(([k, v]) => { if (v >= 0) clean[k] = v; });
      return { idx: i, map: clean };
    }
  }
  return null;
}

export default function PCPImportDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (v: boolean) => void }) {
  const qc = useQueryClient();
  const fileRef = useRef<HTMLInputElement>(null);
  const [step, setStep] = useState<Step>("upload");
  const [fileName, setFileName] = useState("");
  const [rows, setRows] = useState<ParsedRow[]>([]);
  const [plan, setPlan] = useState<MatchPlan[]>([]);
  const [mailingDate, setMailingDate] = useState(toLocalDateKey(addDays(new Date(), 30)));
  const [progress, setProgress] = useState(0);
  const [summary, setSummary] = useState({ matched: 0, created: 0, skipped: 0 });

  const { data: customers = [] } = useQuery({ queryKey: ["customers"], queryFn: fetchCustomers });
  const { data: allOrders = [] } = useQuery({ queryKey: ["orders"], queryFn: () => fetchOrders() });

  const reset = () => {
    setStep("upload");
    setFileName("");
    setRows([]);
    setPlan([]);
    setProgress(0);
    setSummary({ matched: 0, created: 0, skipped: 0 });
    setMailingDate(toLocalDateKey(addDays(new Date(), 30)));
  };

  const handleFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!file.name.toLowerCase().endsWith(".xlsx")) {
      toast.error("Please upload an .xlsx file");
      return;
    }
    setFileName(file.name);

    try {
      const XLSX: any = await import(/* @vite-ignore */ ("https://cdn.jsdelivr.net/npm/xlsx@0.18.5/+esm" as string));
      const ab = await file.arrayBuffer();
      const wb = XLSX.read(ab, { type: "array" });
      const ws = wb.Sheets[wb.SheetNames[0]];
      const raw: any[][] = XLSX.utils.sheet_to_json(ws, { header: 1 });
      const hdr = pickHeaderRow(raw);
      if (!hdr) {
        toast.error("Couldn't find required columns. Need First Name, Last Name, Phone.");
        return;
      }
      const col = (key: string) => (key in hdr.map ? hdr.map[key] : -1);
      const parsed: ParsedRow[] = [];
      for (let i = hdr.idx + 1; i < raw.length; i++) {
        const r = raw[i] || [];
        const first = String(r[col("first name")] ?? "").trim();
        const last = String(r[col("last name")] ?? "").trim();
        if (!first && !last) continue;
        const phoneRaw = String(r[col("phone")] ?? "").trim();
        parsed.push({
          first_name: first,
          last_name: last,
          phoneRaw,
          phone: stripPhone(phoneRaw),
          email: String(r[col("personal email address")] ?? "").trim(),
          street: String(r[col("street")] ?? "").trim(),
          street2: String(r[col("street 2")] ?? "").trim(),
          city: String(r[col("city")] ?? "").trim(),
          state: String(r[col("state")] ?? "").trim(),
          zip: String(r[col("zip code")] ?? "").trim(),
          pcp_program: String(r[col("pcp program")] ?? "").trim(),
        });
      }
      setRows(parsed);

      // Build match plan
      const built: MatchPlan[] = parsed.map((row) => {
        if (!row.phone || row.phone.length < 10) {
          return { row, action: "skip", reason: "No phone on row — skipped" };
        }
        const match = customers.find((c: any) => {
          const cp = stripPhone(c.phone);
          if (cp !== row.phone) return false;
          const full = (c.full_name || "").toLowerCase().trim();
          const targetFirst = row.first_name.toLowerCase();
          const targetLast = row.last_name.toLowerCase();
          return full.includes(targetFirst) && full.includes(targetLast);
        });
        if (match) {
          return {
            row,
            action: "update",
            customerId: (match as any).id,
            customerName: (match as any).full_name,
            reason: "Existing customer — will tag PCP & refresh",
          };
        }
        return { row, action: "create", reason: "New customer — will create with PCP tag" };
      });
      setPlan(built);
      setStep("preview");
    } catch (err) {
      console.error(err);
      toast.error("Could not read .xlsx file. Re-export from Excel and try again.");
    }
  };

  const handleImport = async () => {
    if (!mailingDate) {
      toast.error("Please set the Expected Mailing Date");
      return;
    }
    setStep("running");
    setProgress(0);

    const { data: userData } = await supabase.auth.getUser();
    const userId = userData.user?.id ?? null;

    // Apply all updates/creates. Track resulting customer ids.
    type Imported = { id: string; first_name: string; last_order_date: string | null };
    const imported: Imported[] = [];
    let matchedCount = 0;
    let createdCount = 0;
    let skippedCount = 0;

    const total = plan.length;
    for (let i = 0; i < plan.length; i++) {
      const p = plan[i];
      try {
        if (p.action === "skip") {
          skippedCount++;
        } else if (p.action === "update" && p.customerId) {
          const cust = customers.find((c: any) => c.id === p.customerId) as any;
          const existingTags: string[] = Array.isArray(cust?.tags) ? cust.tags : [];
          const programTag = p.row.pcp_program ? `Program: ${p.row.pcp_program}` : null;
          const nextTags = Array.from(new Set([
            ...existingTags.filter((t) => !t.startsWith("Program: ")),
            "PCP",
            ...(programTag ? [programTag] : []),
          ]));
          await supabase
            .from("customers")
            .update({
              tags: nextTags,
              is_active: true,
              updated_at: new Date().toISOString(),
            } as any)
            .eq("id", p.customerId);
          matchedCount++;
          const lastOrder = allOrders
            .filter((o: any) => o.customer_id === p.customerId)
            .map((o: any) => o.order_date)
            .sort()
            .pop() || null;
          imported.push({ id: p.customerId, first_name: p.row.first_name, last_order_date: lastOrder });
        } else if (p.action === "create") {
          const programTag = p.row.pcp_program ? `Program: ${p.row.pcp_program}` : null;
          const fullName = `${p.row.first_name} ${p.row.last_name}`.trim();
          const insertPayload: any = {
            full_name: fullName,
            phone: normalizePhoneForStorage(p.row.phoneRaw),
            email: p.row.email || null,
            address_line_1: p.row.street || null,
            address_line_2: p.row.street2 || null,
            city: p.row.city || null,
            state_territory: p.row.state || null,
            postal_code: p.row.zip || null,
            tags: ["PCP", ...(programTag ? [programTag] : [])],
            is_active: true,
            relationship_status: "Customer",
            owner_user_id: userId,
            customer_source: "PCP Import",
          };
          const { data: created, error } = await supabase
            .from("customers")
            .insert(insertPayload)
            .select("id")
            .single();
          if (error) throw error;
          createdCount++;
          if (created) imported.push({ id: (created as any).id, first_name: p.row.first_name, last_order_date: null });
        }
      } catch (e) {
        console.error("Import row failed", p.row, e);
      }
      setProgress(Math.round(((i + 1) / Math.max(total, 1)) * 100));
    }

    // Staggered follow-ups: customers with orders first (days 7-11), no-order last (days 12-17)
    const withOrders = imported
      .filter((x) => !!x.last_order_date)
      .sort((a, b) => (b.last_order_date! > a.last_order_date! ? 1 : -1));
    const withoutOrders = imported.filter((x) => !x.last_order_date);

    const mailingBase = new Date(mailingDate + "T00:00:00");
    const assignSpread = (list: Imported[], dayMin: number, dayMax: number) => {
      const span = dayMax - dayMin + 1;
      const out: { id: string; first_name: string; offset: number }[] = [];
      list.forEach((item, idx) => {
        const offset = list.length <= 1 ? dayMin : dayMin + Math.floor((idx * span) / list.length);
        out.push({ id: item.id, first_name: item.first_name, offset: Math.min(dayMax, offset) });
      });
      return out;
    };
    const earlyAssign = assignSpread(withOrders, 7, 11);
    const lateAssign = assignSpread(withoutOrders, 12, 17);

    for (const a of [...earlyAssign, ...lateAssign]) {
      const due = format(addDays(mailingBase, a.offset), "yyyy-MM-dd");
      const seasonLabel = (() => {
        const c = customers.find((x: any) => x.id === a.id) as any;
        const tags: string[] = Array.isArray(c?.tags) ? c.tags : [];
        const prog = tags.find((t) => t.startsWith("Program: "))?.replace("Program: ", "") || "";
        return parseSeason(prog);
      })();
      try {
        await supabase
          .from("customers")
          .update({
            next_follow_up_date: due,
            follow_up_reason: `${seasonLabel} Catalog Follow-Up`,
            updated_at: new Date().toISOString(),
          } as any)
          .eq("id", a.id);
      } catch (e) {
        console.error("follow-up assign failed", a, e);
      }
    }

    setSummary({ matched: matchedCount, created: createdCount, skipped: skippedCount });
    qc.invalidateQueries({ queryKey: ["customers"] });
    setStep("summary");
    toast.success(`PCP import complete — ${matchedCount + createdCount} customers queued for follow-up`);
  };

  const previewRows = plan.slice(0, 5);
  const toUpdate = plan.filter((p) => p.action === "update").length;
  const toCreate = plan.filter((p) => p.action === "create").length;
  const toSkip = plan.filter((p) => p.action === "skip").length;

  return (
    <Dialog
      open={open}
      onOpenChange={(v) => {
        if (!v) reset();
        onOpenChange(v);
      }}
    >
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <FileSpreadsheet className="h-5 w-5 text-primary" />
            Import PCP List
          </DialogTitle>
        </DialogHeader>

        {step === "upload" && (
          <div className="space-y-4">
            <p className="text-sm text-muted-foreground">
              Upload your Mary Kay InTouch PCP export (.xlsx). We'll match on name + phone, tag matches as PCP, create
              new customers for unmatched rows, and queue follow-ups around your mailing date.
            </p>
            <div
              className={cn(
                "border-2 border-dashed rounded-lg p-8 text-center cursor-pointer hover:bg-muted/50 transition-colors",
                fileName && "border-primary/50 bg-primary/5",
              )}
              onClick={() => fileRef.current?.click()}
            >
              <Upload className="h-8 w-8 mx-auto text-muted-foreground mb-2" />
              <p className="text-sm font-medium">{fileName || "Click to upload .xlsx file"}</p>
              <p className="text-xs text-muted-foreground mt-1">Only .xlsx — exported from InTouch PCP list</p>
              <input ref={fileRef} type="file" accept=".xlsx" className="hidden" onChange={handleFile} />
            </div>
          </div>
        )}

        {step === "preview" && (
          <div className="space-y-4">
            <div className="grid grid-cols-3 gap-2">
              <div className="rounded-lg border p-3 text-center">
                <p className="text-2xl font-semibold text-primary">{toUpdate}</p>
                <p className="text-xs text-muted-foreground">Will match & update</p>
              </div>
              <div className="rounded-lg border p-3 text-center">
                <p className="text-2xl font-semibold text-foreground">{toCreate}</p>
                <p className="text-xs text-muted-foreground">Will create new</p>
              </div>
              <div className="rounded-lg border p-3 text-center">
                <p className="text-2xl font-semibold text-muted-foreground">{toSkip}</p>
                <p className="text-xs text-muted-foreground">Skipped (no phone)</p>
              </div>
            </div>

            <div>
              <label className="text-sm font-medium">Expected Mailing Date</label>
              <Input
                type="date"
                value={mailingDate}
                onChange={(e) => setMailingDate(e.target.value)}
                className="h-10 mt-1 max-w-xs"
              />
              <p className="text-xs text-muted-foreground mt-1">
                Follow-ups will be staggered across 7–17 days after this date.
              </p>
            </div>

            <div>
              <p className="text-sm font-medium mb-2">Preview — first 5 rows</p>
              <div className="border rounded-lg overflow-hidden">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Name</TableHead>
                      <TableHead>Phone</TableHead>
                      <TableHead>Program</TableHead>
                      <TableHead>Action</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {previewRows.map((p, i) => (
                      <TableRow key={i}>
                        <TableCell className="text-sm">{p.row.first_name} {p.row.last_name}</TableCell>
                        <TableCell className="text-sm">{p.row.phoneRaw || "—"}</TableCell>
                        <TableCell className="text-xs text-muted-foreground">{p.row.pcp_program || "—"}</TableCell>
                        <TableCell>
                          {p.action === "update" && <Badge variant="secondary">Match</Badge>}
                          {p.action === "create" && <Badge>New</Badge>}
                          {p.action === "skip" && <Badge variant="outline">Skip</Badge>}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            </div>

            <div className="flex gap-2 justify-end">
              <Button variant="outline" onClick={reset}>Start Over</Button>
              <Button onClick={handleImport} disabled={toUpdate + toCreate === 0}>
                Import {toUpdate + toCreate} customers
              </Button>
            </div>
          </div>
        )}

        {step === "running" && (
          <div className="text-center py-8 space-y-3">
            <p className="text-sm font-medium">Importing PCP list...</p>
            <div className="w-full bg-muted rounded-full h-2 overflow-hidden">
              <div className="bg-primary h-full transition-all" style={{ width: `${progress}%` }} />
            </div>
            <p className="text-xs text-muted-foreground">{progress}%</p>
          </div>
        )}

        {step === "summary" && (
          <div className="text-center py-6 space-y-4">
            <CheckCircle2 className="h-10 w-10 text-primary mx-auto" />
            <p className="font-semibold text-lg">PCP Import Complete</p>
            <div className="grid grid-cols-3 gap-3 max-w-md mx-auto">
              <div className="rounded-lg border p-3">
                <p className="text-2xl font-semibold text-primary">{summary.matched}</p>
                <p className="text-xs text-muted-foreground">Matched & updated</p>
              </div>
              <div className="rounded-lg border p-3">
                <p className="text-2xl font-semibold text-foreground">{summary.created}</p>
                <p className="text-xs text-muted-foreground">New customers</p>
              </div>
              <div className="rounded-lg border p-3">
                <p className="text-2xl font-semibold text-muted-foreground">{summary.skipped}</p>
                <p className="text-xs text-muted-foreground">Skipped (no phone)</p>
              </div>
            </div>
            <p className="text-xs text-muted-foreground max-w-sm mx-auto">
              Follow-ups queued between {format(addDays(new Date(mailingDate + "T00:00:00"), 7), "MMM d")} and{" "}
              {format(addDays(new Date(mailingDate + "T00:00:00"), 17), "MMM d, yyyy")}.
            </p>
            <Button onClick={() => { reset(); onOpenChange(false); }}>Done</Button>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
