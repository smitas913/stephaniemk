import { useMemo, useRef, useState } from "react";
import * as XLSX from "xlsx";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { fetchCustomers, fetchOrders } from "@/lib/queries";
import { supabase } from "@/integrations/supabase/client";
import { stripPhone, normalizePhoneForStorage } from "@/lib/phoneUtils";
import { toLocalDateKey } from "@/lib/dateOnly";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Upload, FileSpreadsheet, CheckCircle2, AlertTriangle, Info, ChevronDown, CheckCircle } from "lucide-react";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { Checkbox } from "@/components/ui/checkbox";
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

type Tier = 1 | 2 | 3 | "no_phone";

type MatchPlan = {
  row: ParsedRow;
  tier: Tier;
  candidateId?: string;
  candidateName?: string;
  candidatePhone?: string | null;
  candidateEmail?: string | null;
};

type Tier2Choice = "use_crm" | "update_from_intouch" | "skip";

type Step = "upload" | "preview" | "running" | "summary";

const SEASONS = ["Spring", "Summer", "Fall", "Holiday", "Winter"];

function parseSeason(program: string): string {
  const m = SEASONS.find((s) => program.toLowerCase().includes(s.toLowerCase()));
  return m || "Catalog";
}

function findCol(row: string[], matchers: ((c: string) => boolean)[]): number {
  for (const m of matchers) {
    const j = row.findIndex(m);
    if (j >= 0) return j;
  }
  return -1;
}

function pickHeaderRow(rows: any[][]): { idx: number; map: Record<string, number> } | null {
  for (let i = 0; i < Math.min(10, rows.length); i++) {
    if (!rows[i] || rows[i].every((c: any) => String(c ?? "").trim() === "")) continue;

    const row = (rows[i] || []).map((c) => String(c ?? "").toLowerCase().trim());
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

    if (map["first name"] >= 0 && map["last name"] >= 0) {
      const clean: Record<string, number> = {};
      Object.entries(map).forEach(([k, v]) => { if (v >= 0) clean[k] = v; });
      return { idx: i, map: clean };
    }
  }
  console.error("[PCP Import] Header detection failed. Rows dump:", JSON.stringify(rows.slice(0, 3)));
  return null;
}

function nameMatches(row: ParsedRow, c: any): boolean {
  const full = (c.full_name || "").toLowerCase().trim();
  const f = row.first_name.toLowerCase().trim();
  const l = row.last_name.toLowerCase().trim();
  if (!f || !l) return false;
  return full.includes(f) && full.includes(l);
}

function evaluateRow(row: ParsedRow, customers: any[], overridePhone?: string): MatchPlan {
  const phone = overridePhone ?? row.phone;
  const email = row.email.toLowerCase().trim();

  // Tier 1: phone+name OR email+name
  if (phone && phone.length === 10) {
    const m = customers.find((c) => stripPhone(c.phone) === phone && nameMatches(row, c));
    if (m) {
      return {
        row,
        tier: 1,
        candidateId: m.id,
        candidateName: m.full_name,
        candidatePhone: m.phone,
        candidateEmail: m.email,
      };
    }
  }
  if (email) {
    const m = customers.find(
      (c) => (c.email || "").toLowerCase().trim() === email && nameMatches(row, c),
    );
    if (m) {
      return {
        row,
        tier: 1,
        candidateId: m.id,
        candidateName: m.full_name,
        candidatePhone: m.phone,
        candidateEmail: m.email,
      };
    }
  }

  // Tier 2: name match only
  const nameOnly = customers.find((c) => nameMatches(row, c));
  if (nameOnly) {
    return {
      row,
      tier: 2,
      candidateId: nameOnly.id,
      candidateName: nameOnly.full_name,
      candidatePhone: nameOnly.phone,
      candidateEmail: nameOnly.email,
    };
  }

  // No phone bucket separately if blank
  if (!phone || phone.length < 10) {
    return { row, tier: "no_phone" };
  }

  return { row, tier: 3 };
}

export default function PCPImportDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (v: boolean) => void }) {
  const qc = useQueryClient();
  const fileRef = useRef<HTMLInputElement>(null);
  const [step, setStep] = useState<Step>("upload");
  const [fileName, setFileName] = useState("");
  const [plan, setPlan] = useState<MatchPlan[]>([]);
  const [mailingDate, setMailingDate] = useState(toLocalDateKey(addDays(new Date(), 30)));
  const [progress, setProgress] = useState(0);
  const [summary, setSummary] = useState({ matched: 0, created: 0, skipped: 0, removed: 0 });

  // User decisions
  const [approvedCreates, setApprovedCreates] = useState<Set<number>>(new Set());
  const [tier2Choices, setTier2Choices] = useState<Record<number, Tier2Choice>>({});
  const [noPhoneInputs, setNoPhoneInputs] = useState<Record<number, string>>({});

  const { data: customers = [] } = useQuery({ queryKey: ["customers"], queryFn: fetchCustomers });
  const { data: allOrders = [] } = useQuery({ queryKey: ["orders"], queryFn: () => fetchOrders() });

  // Effective plan: re-evaluate no_phone rows if user typed a phone
  const effectivePlan = useMemo<MatchPlan[]>(() => {
    return plan.map((p, i) => {
      if (p.tier !== "no_phone") return p;
      const typed = stripPhone(noPhoneInputs[i] || "");
      if (typed.length === 10) {
        return evaluateRow(p.row, customers, typed);
      }
      return p;
    });
  }, [plan, noPhoneInputs, customers]);

  const reset = () => {
    setStep("upload");
    setFileName("");
    setPlan([]);
    setProgress(0);
    setSummary({ matched: 0, created: 0, skipped: 0, removed: 0 });
    setMailingDate(toLocalDateKey(addDays(new Date(), 30)));
    setApprovedCreates(new Set());
    setTier2Choices({});
    setNoPhoneInputs({});
  };

  const handleFile = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;
    if (!file.name.toLowerCase().endsWith(".xlsx")) {
      toast.error("Please upload an .xlsx file");
      return;
    }
    setFileName(file.name);

    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const result = e.target!.result as ArrayBuffer;
        const data = new Uint8Array(result);
        const workbook = XLSX.read(data, { type: "array" });
        const sheetName = workbook.SheetNames[0];
        const worksheet = workbook.Sheets[sheetName];
        let raw: any[][] = XLSX.utils.sheet_to_json(worksheet, { header: 1, defval: "", raw: false });

        const firstRowEmpty = (rows: any[][]) =>
          !rows[0] || rows[0].every((c: any) => String(c ?? "").trim() === "");

        if (firstRowEmpty(raw)) {
          const denseWb = XLSX.read(data, { type: "array", dense: true });
          const denseWs = denseWb.Sheets[denseWb.SheetNames[0]];
          const range = XLSX.utils.decode_range(denseWs["!ref"] || "A1:L200");
          const denseRaw: any[][] = [];
          for (let R = range.s.r; R <= range.e.r; R++) {
            const row: any[] = [];
            for (let C = range.s.c; C <= range.e.c; C++) {
              const cell = (denseWs as any)[R]?.[C];
              row.push(cell ? (cell.w ?? cell.v ?? "") : "");
            }
            denseRaw.push(row);
          }
          raw = denseRaw;
        }

        const hdr = pickHeaderRow(raw);
        if (!hdr) {
          toast.error("Couldn't find required columns. Check browser console for the raw first row.");
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

        const built: MatchPlan[] = parsed.map((row) => evaluateRow(row, customers));
        setPlan(built);
        setApprovedCreates(new Set());
        setTier2Choices({});
        setNoPhoneInputs({});
        setStep("preview");
      } catch (err) {
        console.error("PCP Import - parse error:", err);
        toast.error("Could not read .xlsx file. Re-export from Excel and try again.");
      }
    };
    reader.onerror = (err) => {
      console.error("PCP Import - FileReader error:", err);
      toast.error("Could not read file.");
    };
    reader.readAsArrayBuffer(file);
  };

  // Derived counts on effective plan
  const tier1 = effectivePlan
    .map((p, i) => ({ p, i }))
    .filter((x) => x.p.tier === 1);
  const tier2 = effectivePlan
    .map((p, i) => ({ p, i }))
    .filter((x) => x.p.tier === 2);
  const tier3 = effectivePlan
    .map((p, i) => ({ p, i }))
    .filter((x) => x.p.tier === 3);
  const noPhone = effectivePlan
    .map((p, i) => ({ p, i }))
    .filter((x) => x.p.tier === "no_phone");

  const tier2NonSkipped = tier2.filter(({ i }) => tier2Choices[i] && tier2Choices[i] !== "skip").length;
  const approvedCreateCount = tier3.filter(({ i }) => approvedCreates.has(i)).length;
  // no-phone rows that successfully became a tier (i.e. phone entered) are already in tier1/2/3 buckets above
  const allTier2Decided = tier2.every(({ i }) => !!tier2Choices[i]);
  const importCount = tier1.length + tier2NonSkipped + approvedCreateCount;

  const handleImport = async () => {
    if (!mailingDate) {
      toast.error("Please set the Expected Mailing Date");
      return;
    }
    setStep("running");
    setProgress(0);

    const { data: userData } = await supabase.auth.getUser();
    const userId = userData.user?.id ?? null;

    type Imported = { id: string; first_name: string; last_order_date: string | null };
    const imported: Imported[] = [];
    let matchedCount = 0;
    let createdCount = 0;
    let skippedCount = 0;

    const total = effectivePlan.length;
    for (let i = 0; i < effectivePlan.length; i++) {
      const p = effectivePlan[i];
      try {
        // Decide effective action
        let action: "update" | "create" | "skip" = "skip";
        let updatePhone = false;
        let updateEmail = false;
        let targetId: string | undefined;

        if (p.tier === 1) {
          action = "update";
          targetId = p.candidateId;
        } else if (p.tier === 2) {
          const choice = tier2Choices[i];
          if (choice === "skip" || !choice) {
            action = "skip";
          } else if (choice === "use_crm") {
            action = "update";
            targetId = p.candidateId;
          } else if (choice === "update_from_intouch") {
            action = "update";
            targetId = p.candidateId;
            updatePhone = true;
            updateEmail = true;
          }
        } else if (p.tier === 3) {
          if (approvedCreates.has(i)) action = "create";
          else action = "skip";
        } else if (p.tier === "no_phone") {
          action = "skip";
        }

        if (action === "skip") {
          skippedCount++;
        } else if (action === "update" && targetId) {
          const cust = customers.find((c: any) => c.id === targetId) as any;
          const existingTags: string[] = Array.isArray(cust?.tags) ? cust.tags : [];
          const programTag = p.row.pcp_program ? `Program: ${p.row.pcp_program}` : null;
          const nextTags = Array.from(new Set([
            ...existingTags.filter((t) => !t.startsWith("Program: ")),
            "PCP",
            ...(programTag ? [programTag] : []),
          ]));
          const updatePayload: any = {
            tags: nextTags,
            is_active: true,
            updated_at: new Date().toISOString(),
          };
          if (updatePhone) {
            const newPhone = normalizePhoneForStorage(p.row.phoneRaw);
            if (newPhone) updatePayload.phone = newPhone;
          }
          if (updateEmail && p.row.email) {
            updatePayload.email = p.row.email;
          }
          await supabase.from("customers").update(updatePayload).eq("id", targetId);
          matchedCount++;
          const lastOrder = allOrders
            .filter((o: any) => o.customer_id === targetId)
            .map((o: any) => o.order_date)
            .sort()
            .pop() || null;
          imported.push({ id: targetId, first_name: p.row.first_name, last_order_date: lastOrder });
        } else if (action === "create") {
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

    // Cleanup: remove PCP + Program tags from customers tagged PCP who weren't in this import
    let removedCount = 0;
    try {
      const importedIds = new Set(imported.map((x) => x.id));
      const { data: currentPcp } = await supabase
        .from("customers")
        .select("id, tags")
        .contains("tags", ["PCP"]);
      const toClean = (currentPcp || []).filter((c: any) => !importedIds.has(c.id));
      for (const c of toClean) {
        const existing: string[] = Array.isArray((c as any).tags) ? (c as any).tags : [];
        const nextTags = existing.filter((t) => t !== "PCP" && !t.startsWith("Program: "));
        try {
          await supabase
            .from("customers")
            .update({ tags: nextTags, updated_at: new Date().toISOString() } as any)
            .eq("id", (c as any).id);
          removedCount++;
        } catch (e) {
          console.error("PCP cleanup failed for", (c as any).id, e);
        }
      }
    } catch (e) {
      console.error("PCP cleanup query failed", e);
    }

    setSummary({ matched: matchedCount, created: createdCount, skipped: skippedCount, removed: removedCount });
    qc.invalidateQueries({ queryKey: ["customers"] });
    setStep("summary");
    toast.success(`PCP import complete — ${matchedCount + createdCount} customers queued for follow-up`);
  };

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
              Upload your Mary Kay InTouch PCP export (.xlsx). We'll match on name + phone or email, tag matches as PCP,
              and let you review possible duplicates before creating new customers.
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
            <div className="flex gap-2 items-start rounded-md border border-blue-200 bg-blue-50 dark:border-blue-900/40 dark:bg-blue-950/30 p-2.5">
              <Info className="h-4 w-4 text-blue-600 dark:text-blue-400 shrink-0 mt-0.5" />
              <p className="text-xs text-blue-900 dark:text-blue-200 leading-relaxed">
                <span className="font-medium">Tip:</span> If your file fails to upload, open it in Excel first and re-save as
                Excel Workbook (.xlsx) before uploading. This clears formatting added by InTouch.
              </p>
            </div>
          </div>
        )}

        {step === "preview" && (
          <div className="space-y-4">
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

            {/* Section 1 — Matches (Tier 1) */}
            <Collapsible>
              <CollapsibleTrigger className="flex w-full items-center justify-between rounded-md border border-emerald-300 bg-emerald-50 dark:border-emerald-900/50 dark:bg-emerald-950/30 p-2.5 text-sm font-medium text-emerald-900 dark:text-emerald-200 hover:bg-emerald-100/70 dark:hover:bg-emerald-950/50 [&[data-state=open]>svg]:rotate-180">
                <span className="flex items-center gap-2">
                  <CheckCircle className="h-4 w-4" />
                  {tier1.length} match{tier1.length === 1 ? "" : "es"} — will tag as PCP
                </span>
                <ChevronDown className="h-4 w-4 transition-transform" />
              </CollapsibleTrigger>
              <CollapsibleContent>
                <div className="mt-2 border border-emerald-200 dark:border-emerald-900/40 rounded-md divide-y divide-emerald-100 dark:divide-emerald-900/30 max-h-72 overflow-y-auto bg-emerald-50/40 dark:bg-emerald-950/10">
                  {tier1.length === 0 && (
                    <div className="p-3 text-xs text-muted-foreground">No high-confidence matches.</div>
                  )}
                  {tier1.map(({ p, i }) => (
                    <div key={i} className="p-2.5 text-sm flex justify-between gap-3">
                      <span className="truncate">{p.row.first_name} {p.row.last_name}</span>
                      <span className="text-muted-foreground text-xs shrink-0">{p.row.phoneRaw || p.row.email || "—"}</span>
                    </div>
                  ))}
                </div>
              </CollapsibleContent>
            </Collapsible>

            {/* Section 2 — Possible Matches (Tier 2) */}
            {tier2.length > 0 && (
              <Collapsible defaultOpen>
                <CollapsibleTrigger className="flex w-full items-center justify-between rounded-md border border-amber-300 bg-amber-50 dark:border-amber-900/50 dark:bg-amber-950/30 p-2.5 text-sm font-medium text-amber-900 dark:text-amber-200 hover:bg-amber-100/70 dark:hover:bg-amber-950/50 [&[data-state=open]>svg]:rotate-180">
                  <span className="flex items-center gap-2">
                    <AlertTriangle className="h-4 w-4" />
                    {tier2.length} possible match{tier2.length === 1 ? "" : "es"} — needs review
                  </span>
                  <ChevronDown className="h-4 w-4 transition-transform" />
                </CollapsibleTrigger>
                <CollapsibleContent>
                  <div className="mt-2 space-y-2">
                    {tier2.map(({ p, i }) => {
                      const choice = tier2Choices[i];
                      return (
                        <div
                          key={i}
                          className="rounded-md border border-amber-200 dark:border-amber-900/40 bg-amber-50/40 dark:bg-amber-950/10 p-3 space-y-2"
                        >
                          <div className="grid grid-cols-3 gap-2 text-xs">
                            <div className="font-medium text-muted-foreground">&nbsp;</div>
                            <div className="font-medium text-foreground">InTouch</div>
                            <div className="font-medium text-foreground">Your CRM</div>

                            <div className="text-muted-foreground">Name</div>
                            <div className="truncate">{p.row.first_name} {p.row.last_name}</div>
                            <div className="truncate">{p.candidateName || "—"}</div>

                            <div className="text-muted-foreground">Phone</div>
                            <div className="truncate">{p.row.phoneRaw || "—"}</div>
                            <div className="truncate">{p.candidatePhone || "—"}</div>

                            <div className="text-muted-foreground">Email</div>
                            <div className="truncate">{p.row.email || "—"}</div>
                            <div className="truncate">{p.candidateEmail || "—"}</div>
                          </div>
                          <div className="flex flex-wrap gap-1.5 pt-1">
                            <Button
                              size="sm"
                              variant={choice === "use_crm" ? "default" : "outline"}
                              onClick={() => setTier2Choices((s) => ({ ...s, [i]: "use_crm" }))}
                            >
                              Use CRM data
                            </Button>
                            <Button
                              size="sm"
                              variant={choice === "update_from_intouch" ? "default" : "outline"}
                              onClick={() => setTier2Choices((s) => ({ ...s, [i]: "update_from_intouch" }))}
                            >
                              Update from InTouch
                            </Button>
                            <Button
                              size="sm"
                              variant={choice === "skip" ? "default" : "outline"}
                              onClick={() => setTier2Choices((s) => ({ ...s, [i]: "skip" }))}
                            >
                              Skip
                            </Button>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </CollapsibleContent>
              </Collapsible>
            )}

            {/* Section 3 — New customers (Tier 3) */}
            {tier3.length > 0 && (
              <Collapsible defaultOpen>
                <CollapsibleTrigger className="flex w-full items-center justify-between rounded-md border border-amber-300 bg-amber-50 dark:border-amber-900/50 dark:bg-amber-950/30 p-2.5 text-sm font-medium text-amber-900 dark:text-amber-200 hover:bg-amber-100/70 dark:hover:bg-amber-950/50 [&[data-state=open]>svg]:rotate-180">
                  <span className="flex items-center gap-2">
                    <AlertTriangle className="h-4 w-4" />
                    {tier3.length} new customer{tier3.length === 1 ? "" : "s"} — check to include
                  </span>
                  <ChevronDown className="h-4 w-4 transition-transform" />
                </CollapsibleTrigger>
                <CollapsibleContent>
                  <div className="mt-2 border border-amber-200 dark:border-amber-900/40 rounded-md divide-y divide-amber-100 dark:divide-amber-900/30 max-h-72 overflow-y-auto bg-amber-50/40 dark:bg-amber-950/10">
                    <div className="p-2 text-xs text-amber-900 dark:text-amber-200 bg-amber-100/60 dark:bg-amber-950/30">
                      Not found in CRM — may be a duplicate with a different phone number or name spelling.
                    </div>
                    {tier3.map(({ p, i }) => (
                      <label
                        key={i}
                        className="flex items-center gap-3 p-2.5 text-sm cursor-pointer hover:bg-amber-100/40 dark:hover:bg-amber-950/30"
                      >
                        <Checkbox
                          checked={approvedCreates.has(i)}
                          onCheckedChange={(checked) => {
                            setApprovedCreates((prev) => {
                              const next = new Set(prev);
                              if (checked) next.add(i);
                              else next.delete(i);
                              return next;
                            });
                          }}
                        />
                        <div className="flex-1 min-w-0 flex flex-wrap justify-between gap-x-3 gap-y-0.5">
                          <span className="truncate">{p.row.first_name} {p.row.last_name}</span>
                          <span className="text-muted-foreground text-xs shrink-0">
                            {p.row.phoneRaw || "—"}{p.row.email ? ` · ${p.row.email}` : ""}
                          </span>
                        </div>
                      </label>
                    ))}
                  </div>
                </CollapsibleContent>
              </Collapsible>
            )}

            {/* Section 4 — No phone on file */}
            {noPhone.length > 0 && (
              <Collapsible defaultOpen>
                <CollapsibleTrigger className="flex w-full items-center justify-between rounded-md border bg-muted/40 p-2.5 text-sm font-medium text-muted-foreground hover:bg-muted/60 [&[data-state=open]>svg]:rotate-180">
                  <span>{noPhone.length} no phone on file — add a phone to include</span>
                  <ChevronDown className="h-4 w-4 transition-transform" />
                </CollapsibleTrigger>
                <CollapsibleContent>
                  <div className="mt-2 border rounded-md divide-y max-h-72 overflow-y-auto">
                    {noPhone.map(({ p, i }) => (
                      <div key={i} className="p-2.5 text-sm flex flex-wrap items-center gap-2">
                        <div className="flex-1 min-w-0">
                          <div className="truncate font-medium">{p.row.first_name} {p.row.last_name}</div>
                          <div className="truncate text-xs text-muted-foreground">{p.row.email || "no email"}</div>
                        </div>
                        <Input
                          type="tel"
                          placeholder="Add phone"
                          value={noPhoneInputs[i] || ""}
                          onChange={(e) =>
                            setNoPhoneInputs((s) => ({ ...s, [i]: e.target.value }))
                          }
                          className="h-9 w-40"
                        />
                      </div>
                    ))}
                  </div>
                </CollapsibleContent>
              </Collapsible>
            )}

            <div className="flex flex-col gap-2">
              <div className="flex gap-2 justify-end">
                <Button variant="outline" onClick={reset}>Start Over</Button>
                <Button
                  onClick={handleImport}
                  disabled={!allTier2Decided || importCount === 0}
                >
                  Import {importCount} customer{importCount === 1 ? "" : "s"}
                </Button>
              </div>
              <p className="text-xs text-muted-foreground text-right">
                {tier1.length} matched · {tier2NonSkipped} possible match{tier2NonSkipped === 1 ? "" : "es"} · {approvedCreateCount} new
                {!allTier2Decided && tier2.length > 0 && (
                  <span className="text-amber-700 dark:text-amber-300"> · decide on all possible matches to enable import</span>
                )}
              </p>
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
                <p className="text-xs text-muted-foreground">Skipped</p>
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
