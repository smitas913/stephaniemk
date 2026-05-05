import { useState, useRef } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { fetchCustomers } from "@/lib/queries";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Upload, FileSpreadsheet, CheckCircle2, AlertTriangle, Users, Calendar } from "lucide-react";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import { format, addDays, parseISO } from "date-fns";

// Follow-up reasons that PCP should NOT override.
// Only active booking conversations stay — everything else PCP wins.
const PROTECTED_REASONS = new Set(["Booking Follow-Up"]);

type MatchResult = {
  rowName: string;
  status: "matched" | "not_found" | "skipped";
  customerId?: string;
  customerName?: string;
  existingFollowUp?: string | null;
  existingReason?: string | null;
  willUpdate: boolean;
  reason: string;
};

type Step = "upload" | "preview" | "running" | "done";

export default function PCPCatalogUpload() {
  const qc = useQueryClient();
  const fileRef = useRef<HTMLInputElement>(null);
  const [step, setStep] = useState<Step>("upload");
  const [catalogEndDate, setCatalogEndDate] = useState("");
  const [results, setResults] = useState<MatchResult[]>([]);
  const [progress, setProgress] = useState(0);
  const [fileName, setFileName] = useState("");
  const [parsedNames, setParsedNames] = useState<{ first: string; last: string }[]>([]);

  const { data: customers = [] } = useQuery({ queryKey: ["customers"], queryFn: fetchCustomers });

  const normalize = (s: string) => (s || "").toLowerCase().trim();

  const handleFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setFileName(file.name);

    try {
      const XLSX: any = await import(/* @vite-ignore */ ("https://cdn.jsdelivr.net/npm/xlsx@0.18.5/+esm" as string));
      const ab = await file.arrayBuffer();
      const wb = XLSX.read(ab, { type: "array" });
      const ws = wb.Sheets[wb.SheetNames[0]];
      const rows: any[] = XLSX.utils.sheet_to_json(ws, { header: 1 });

      let headerIdx = -1;
      let firstCol = -1;
      let lastCol = -1;

      for (let i = 0; i < Math.min(10, rows.length); i++) {
        const row = (rows[i] || []).map((c: any) => normalize(String(c || "")));
        const fi = row.findIndex((c: string) => c.includes("first"));
        const li = row.findIndex((c: string) => c.includes("last"));
        if (fi >= 0 && li >= 0) {
          headerIdx = i;
          firstCol = fi;
          lastCol = li;
          break;
        }
      }

      if (headerIdx === -1) {
        toast.error("Could not find First Name / Last Name columns. Check your file.");
        return;
      }

      const names: { first: string; last: string }[] = [];
      for (let i = headerIdx + 1; i < rows.length; i++) {
        const row = rows[i] || [];
        const first = String(row[firstCol] || "").trim();
        const last = String(row[lastCol] || "").trim();
        if (first || last) names.push({ first, last });
      }

      setParsedNames(names);
      setStep("preview");
      toast.success(`Found ${names.length} names in ${file.name}`);
    } catch (err: any) {
      try {
        const Papa: any = await import("papaparse");
        const text = await file.text();
        const result = (Papa.default || Papa).parse(text, { header: true, skipEmptyLines: true });
        const rows = result.data as Record<string, any>[];
        if (!rows.length) throw new Error("Empty file");

        const firstKey = Object.keys(rows[0]).find((k) => normalize(k).includes("first"));
        const lastKey = Object.keys(rows[0]).find((k) => normalize(k).includes("last"));

        if (!firstKey || !lastKey) {
          toast.error("Could not find First Name / Last Name columns.");
          return;
        }

        const names = rows
          .map((r) => ({
            first: String(r[firstKey] || "").trim(),
            last: String(r[lastKey] || "").trim(),
          }))
          .filter((n) => n.first || n.last);

        setParsedNames(names);
        setStep("preview");
        toast.success(`Found ${names.length} names in ${file.name}`);
      } catch (e2) {
        toast.error("Could not read file. Please export as .xlsx or .csv from Excel.");
      }
    }
  };

  const buildPreview = (): MatchResult[] => {
    return parsedNames.map(({ first, last }) => {
      const fullName = `${first} ${last}`.toLowerCase().trim();
      const match = customers.find((c: any) => {
        const cn = normalize(c.full_name || "");
        return (
          cn === fullName ||
          (normalize(c.first_name || "") === normalize(first) &&
            normalize(c.last_name || "") === normalize(last))
        );
      }) as any;

      if (!match) {
        return {
          rowName: `${first} ${last}`.trim(),
          status: "not_found",
          willUpdate: false,
          reason: "Not found in your client list",
        };
      }

      const existingReason = match.follow_up_reason as string | null;
      const existingFollowUp = match.next_follow_up_date as string | null;
      const isProtected = !!existingReason && PROTECTED_REASONS.has(existingReason);

      if (isProtected) {
        return {
          rowName: `${first} ${last}`.trim(),
          status: "skipped",
          customerId: match.id,
          customerName: match.full_name,
          existingFollowUp,
          existingReason,
          willUpdate: false,
          reason: "Active booking conversation in progress — PCP will follow after",
        };
      }

      return {
        rowName: `${first} ${last}`.trim(),
        status: "matched",
        customerId: match.id,
        customerName: match.full_name,
        existingFollowUp,
        existingReason,
        willUpdate: true,
        reason: existingReason ? `Replacing "${existingReason}" with PCP Follow-Up` : "Will set PCP Follow-Up",
      };
    });
  };

  const handlePreview = () => {
    if (!catalogEndDate) {
      toast.error("Please enter the catalog period end date first.");
      return;
    }
    setResults(buildPreview());
  };

  const handleRun = async () => {
    if (!catalogEndDate) return;
    setStep("running");
    setProgress(0);

    const followUpDate = format(addDays(parseISO(catalogEndDate), 3), "yyyy-MM-dd");
    const toUpdate = results.filter((r) => r.willUpdate && r.customerId);
    let done = 0;

    for (const r of toUpdate) {
      try {
        await supabase
          .from("customers")
          .update({
            next_follow_up_date: followUpDate,
            follow_up_reason: "PCP Follow-Up",
            updated_at: new Date().toISOString(),
          } as any)
          .eq("id", r.customerId!);
      } catch (e) {
        console.error("Failed to update", r.customerName, e);
      }
      done++;
      setProgress(Math.round((done / Math.max(toUpdate.length, 1)) * 100));
    }

    qc.invalidateQueries({ queryKey: ["customers"] });
    setStep("done");
    toast.success(`PCP Follow-Up set for ${toUpdate.length} customers — due ${followUpDate}`);
  };

  const matched = results.filter((r) => r.willUpdate).length;
  const skipped = results.filter((r) => r.status === "skipped").length;
  const notFound = results.filter((r) => r.status === "not_found").length;

  const resetAll = () => {
    setStep("upload");
    setResults([]);
    setParsedNames([]);
    setFileName("");
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <FileSpreadsheet className="h-5 w-5 text-primary" />
          PCP Catalog Upload
        </CardTitle>
        <p className="text-sm text-muted-foreground">
          Upload your quarterly Preferred Customer list. Customers who received a catalog will be queued for PCP
          Follow-Up at the end of the catalog period.
        </p>
      </CardHeader>
      <CardContent className="space-y-6">
        {(step === "upload" || step === "preview") && (
          <div className="space-y-4">
            <div>
              <label className="text-sm font-medium flex items-center gap-1">
                <Calendar className="h-4 w-4" />
                Catalog Period End Date
              </label>
              <Input
                type="date"
                value={catalogEndDate}
                onChange={(e) => setCatalogEndDate(e.target.value)}
                className="h-10 mt-1 max-w-xs"
              />
              <p className="text-xs text-muted-foreground mt-1">
                Follow-ups will be set for 3 days after this date.
              </p>
            </div>

            <div
              className={cn(
                "border-2 border-dashed rounded-lg p-6 text-center cursor-pointer hover:bg-muted/50 transition-colors",
                fileName && "border-primary/50 bg-primary/5",
              )}
              onClick={() => fileRef.current?.click()}
            >
              <Upload className="h-8 w-8 mx-auto text-muted-foreground mb-2" />
              <p className="text-sm font-medium">
                {fileName ? fileName : "Click to upload Mary Kay PCP Excel file"}
              </p>
              <p className="text-xs text-muted-foreground mt-1">
                .xlsx or .csv — needs First Name and Last Name columns
              </p>
              <input
                ref={fileRef}
                type="file"
                accept=".xlsx,.xls,.csv"
                className="hidden"
                onChange={handleFile}
              />
            </div>

            {parsedNames.length > 0 && step === "upload" && (
              <div className="flex items-center justify-between">
                <p className="text-sm">
                  <Users className="inline h-4 w-4 mr-1" />
                  {parsedNames.length} names found in file
                </p>
                <Button onClick={handlePreview}>Preview Matches</Button>
              </div>
            )}
          </div>
        )}

        {step === "preview" && results.length > 0 && (
          <div className="space-y-4">
            <div className="grid grid-cols-3 gap-3">
              <div className="rounded-lg border p-3 text-center">
                <p className="text-2xl font-semibold text-primary">{matched}</p>
                <p className="text-xs text-muted-foreground">Will update</p>
              </div>
              <div className="rounded-lg border p-3 text-center">
                <p className="text-2xl font-semibold text-muted-foreground">{skipped}</p>
                <p className="text-xs text-muted-foreground">Keeping active cycle</p>
              </div>
              <div className="rounded-lg border p-3 text-center">
                <p className="text-2xl font-semibold text-destructive">{notFound}</p>
                <p className="text-xs text-muted-foreground">Not in client list</p>
              </div>
            </div>

            <p className="text-sm">
              Follow-ups will be set to{" "}
              <span className="font-medium">
                {catalogEndDate ? format(addDays(parseISO(catalogEndDate), 3), "MMM d, yyyy") : "—"}
              </span>{" "}
              with reason <span className="font-medium">PCP Follow-Up</span>.
            </p>

            <div className="max-h-80 overflow-y-auto border rounded-lg divide-y">
              {results.map((r, i) => (
                <div key={i} className="flex items-center gap-3 p-2.5">
                  {r.status === "matched" ? (
                    <CheckCircle2 className="h-4 w-4 text-primary shrink-0" />
                  ) : r.status === "skipped" ? (
                    <AlertTriangle className="h-4 w-4 text-muted-foreground shrink-0" />
                  ) : (
                    <AlertTriangle className="h-4 w-4 text-destructive shrink-0" />
                  )}
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium truncate">{r.customerName || r.rowName}</p>
                    <p className="text-xs text-muted-foreground truncate">{r.reason}</p>
                  </div>
                  {r.status === "matched" && <Badge variant="secondary">PCP</Badge>}
                </div>
              ))}
            </div>

            <div className="flex items-center justify-between gap-2">
              <Button onClick={handleRun} disabled={matched === 0}>
                <CheckCircle2 className="h-4 w-4" />
                Set PCP Follow-Ups for {matched} customers
              </Button>
              <Button variant="outline" onClick={resetAll}>
                Start Over
              </Button>
            </div>
          </div>
        )}

        {step === "running" && (
          <div className="text-center py-8 space-y-3">
            <p className="text-sm font-medium">Updating follow-ups...</p>
            <div className="w-full bg-muted rounded-full h-2 overflow-hidden">
              <div className="bg-primary h-full transition-all" style={{ width: `${progress}%` }} />
            </div>
            <p className="text-xs text-muted-foreground">{progress}%</p>
          </div>
        )}

        {step === "done" && (
          <div className="text-center py-8 space-y-3">
            <CheckCircle2 className="h-10 w-10 text-primary mx-auto" />
            <p className="font-semibold">PCP Follow-Ups Set!</p>
            <p className="text-sm text-muted-foreground">
              {matched} customers queued for follow-up on{" "}
              {catalogEndDate ? format(addDays(parseISO(catalogEndDate), 3), "MMM d, yyyy") : ""}
            </p>
            {skipped > 0 && (
              <p className="text-xs text-muted-foreground">
                {skipped} customers kept their active follow-up cycle and will flow into PCP after.
              </p>
            )}
            <Button
              variant="outline"
              onClick={() => {
                resetAll();
                setCatalogEndDate("");
              }}
            >
              Upload Another Quarter
            </Button>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
