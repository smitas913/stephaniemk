import { useState, useCallback, useMemo } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { fetchCustomers } from "@/lib/queries";
import {
  parseCSV,
  autoMapHeaders,
  processRows,
  findDuplicate,
  buildCustomerRecord,
  DESTINATION_FIELDS,
  type DestField,
  type ParsedRow,
  type DuplicateMode,
  type ImportResult,
} from "@/lib/csvImport";
import type { Customer } from "@/lib/types";
import Layout from "@/components/Layout";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { ArrowLeft, Upload, FileText, AlertTriangle, CheckCircle2, XCircle, ArrowRight } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

type Step = "upload" | "mapping" | "review" | "importing" | "results";

export default function ImportCustomers() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  const [step, setStep] = useState<Step>("upload");
  const [file, setFile] = useState<File | null>(null);
  const [csvHeaders, setCsvHeaders] = useState<string[]>([]);
  const [csvRows, setCsvRows] = useState<Record<string, string>[]>([]);
  const [mapping, setMapping] = useState<Record<string, DestField | "">>({});
  const [processedRows, setProcessedRows] = useState<ParsedRow[]>([]);
  const [duplicateMode, setDuplicateMode] = useState<DuplicateMode>("skip");
  const [result, setResult] = useState<ImportResult | null>(null);
  const [dragOver, setDragOver] = useState(false);

  // --- Upload ---
  const handleFile = useCallback(async (f: File) => {
    if (!f.name.endsWith(".csv")) {
      toast.error("Please upload a CSV file");
      return;
    }
    try {
      setFile(f);
      const { headers, rows } = await parseCSV(f);
      if (headers.length === 0 || rows.length === 0) {
        toast.error("CSV appears to be empty");
        return;
      }
      setCsvHeaders(headers);
      setCsvRows(rows);
      setMapping(autoMapHeaders(headers));
      setStep("mapping");
    } catch (err: any) {
      toast.error(`Failed to parse CSV: ${err.message}`);
    }
  }, []);

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      setDragOver(false);
      const f = e.dataTransfer.files[0];
      if (f) handleFile(f);
    },
    [handleFile]
  );

  // --- Mapping validation ---
  const hasMappedName = useMemo(() => {
    const vals = Object.values(mapping);
    return vals.includes("full_name") || (vals.includes("first_name") && vals.includes("last_name"));
  }, [mapping]);

  // --- Process & Preview ---
  const handlePreview = () => {
    const rows = processRows(csvRows, mapping);
    setProcessedRows(rows);
    setStep("review");
  };

  const validRows = useMemo(() => processedRows.filter((r) => r.errors.length === 0), [processedRows]);
  const invalidRows = useMemo(() => processedRows.filter((r) => r.errors.length > 0), [processedRows]);
  const warningRows = useMemo(() => processedRows.filter((r) => r.warnings.length > 0), [processedRows]);

  // --- Import ---
  const runImport = async () => {
    setStep("importing");
    const existing = await fetchCustomers();
    const details: ImportResult["details"] = [];
    let imported = 0,
      updated = 0,
      skipped = 0,
      errored = 0;
    let contactDataWarnings = 0;

    for (const row of validRows) {
      const duplicate = findDuplicate(row, existing);
      const record = buildCustomerRecord(row);
      const legacyNotes = row.mapped.legacy_notes?.trim() || null;

      try {
        let customerId: string | null = null;

        if (duplicate) {
          if (duplicateMode === "skip") {
            skipped++;
            details.push({ rowIndex: row.rowIndex, status: "skipped", reason: `Duplicate: ${duplicate.full_name}` });
            continue;
          }
          if (duplicateMode === "update") {
            // Only update fields that are empty on the existing record
            const updates: Record<string, any> = {};
            for (const [k, v] of Object.entries(record)) {
              if (v !== null && v !== "" && k !== "full_name") {
                const existingVal = (duplicate as any)[k];
                // For last_contacted: don't overwrite newer dates with older ones
                if (k === "last_contacted" && existingVal && v) {
                  const existingDate = new Date(existingVal);
                  const newDate = new Date(v as string);
                  if (newDate > existingDate) {
                    updates[k] = v;
                  }
                } else if (existingVal === null || existingVal === undefined || existingVal === "") {
                  updates[k] = v;
                }
              }
            }
            if (record.full_name && !duplicate.full_name) updates.full_name = record.full_name;
            const { error } = await supabase.from("customers").update(updates as any).eq("id", duplicate.id);
            if (error) throw error;
            customerId = duplicate.id;
            updated++;

            // Flag if last_contacted could not be mapped
            const hasContactWarning = row.warnings.some(w => w.includes("last contacted"));
            if (hasContactWarning) contactDataWarnings++;

            details.push({ rowIndex: row.rowIndex, status: "updated", reason: hasContactWarning ? "⚠ Could not parse last contacted date" : undefined });
            Object.assign(duplicate, updates);
          } else {
            // create_new — fall through below
            customerId = null;
          }
        }

        if (!duplicate || duplicateMode === "create_new") {
          const insertData = { ...record, relationship_status: "Customer" } as any;
          const { data: inserted, error } = await supabase.from("customers").insert(insertData).select("id").single();
          if (error) throw error;
          customerId = inserted?.id || null;
          imported++;
          const hasContactWarning = row.warnings.some(w => w.includes("last contacted"));
          if (hasContactWarning) contactDataWarnings++;
          details.push({ rowIndex: row.rowIndex, status: "imported", reason: hasContactWarning ? "⚠ Could not parse last contacted date" : undefined });
          existing.push({ id: customerId || "new", ...record, created_at: "", updated_at: "" } as any);
        }

        // Insert legacy notes as a customer note if available
        if (customerId && legacyNotes) {
          await supabase.from("customer_notes").insert({
            customer_id: customerId,
            note_text: legacyNotes,
            note_type: "General",
          });
        }
      } catch (err: any) {
        errored++;
        details.push({ rowIndex: row.rowIndex, status: "error", reason: err.message });
      }
    }

    // Count invalid rows as errored
    for (const row of invalidRows) {
      errored++;
      details.push({ rowIndex: row.rowIndex, status: "error", reason: row.errors.join("; ") });
    }

    const res: ImportResult = {
      total: processedRows.length,
      imported,
      updated,
      skipped,
      errored,
      details,
    };
    setResult(res);
    setStep("results");
    queryClient.invalidateQueries({ queryKey: ["customers"] });
    queryClient.invalidateQueries({ queryKey: ["customer-notes"] });
    queryClient.invalidateQueries({ queryKey: ["orders"] });
    queryClient.invalidateQueries({ queryKey: ["follow-up-queue"] });
    queryClient.invalidateQueries({ queryKey: ["all-notes"] });
    const warnings = contactDataWarnings > 0 ? ` (${contactDataWarnings} rows had unparseable contact dates)` : "";
    toast.success(`Import complete: ${imported} imported, ${updated} updated${warnings}`);
  };

  return (
    <Layout>
      <div className="max-w-4xl mx-auto space-y-5 pb-8">
        {/* Header */}
        <div className="flex items-center gap-3">
          <Button variant="ghost" size="icon" className="-ml-2" onClick={() => (step === "upload" ? navigate("/customers") : setStep(step === "results" ? "upload" : step === "review" ? "mapping" : "upload"))}>
            <ArrowLeft className="w-5 h-5" />
          </Button>
          <div>
            <h2 className="text-2xl font-bold tracking-tight text-foreground">Import Customers from InTouch</h2>
            <p className="text-sm text-muted-foreground">
              {step === "upload" && "Upload your CSV file"}
              {step === "mapping" && "Map CSV columns to customer fields"}
              {step === "review" && "Review and confirm import"}
              {step === "importing" && "Importing..."}
              {step === "results" && "Import complete"}
            </p>
          </div>
        </div>

        {/* Step indicator */}
        <div className="flex gap-1">
          {(["upload", "mapping", "review", "results"] as const).map((s, i) => (
            <div key={s} className={cn("h-1.5 flex-1 rounded-full", step === s || (["upload", "mapping", "review", "importing", "results"].indexOf(step) >= i) ? "bg-primary" : "bg-muted")} />
          ))}
        </div>

        {/* STEP: Upload */}
        {step === "upload" && (
          <Card className="border-border/50 shadow-sm">
            <CardContent className="p-8">
              <div
                className={cn(
                  "border-2 border-dashed rounded-xl p-12 text-center transition-colors",
                  dragOver ? "border-primary bg-primary/5" : "border-border"
                )}
                onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
                onDragLeave={() => setDragOver(false)}
                onDrop={handleDrop}
              >
                <Upload className="w-10 h-10 text-muted-foreground mx-auto mb-4" />
                <p className="text-foreground font-medium mb-1">Drag & drop your CSV file here</p>
                <p className="text-sm text-muted-foreground mb-4">
                  Export your customer list from Mary Kay InTouch as CSV, then upload it here.
                </p>
                <label>
                  <input type="file" accept=".csv" className="hidden" onChange={(e) => e.target.files?.[0] && handleFile(e.target.files[0])} />
                  <Button type="button" variant="outline" asChild><span>Choose File</span></Button>
                </label>
                {file && (
                  <p className="mt-3 text-sm text-foreground flex items-center justify-center gap-2">
                    <FileText className="w-4 h-4" /> {file.name}
                  </p>
                )}
              </div>
            </CardContent>
          </Card>
        )}

        {/* STEP: Mapping */}
        {step === "mapping" && (
          <>
            <Card className="border-border/50 shadow-sm">
              <CardHeader className="pb-2">
                <CardTitle className="text-base">Column Mapping</CardTitle>
                <p className="text-xs text-muted-foreground">Map each CSV column to a customer field. At minimum, map Full Name or First + Last Name.</p>
              </CardHeader>
              <CardContent>
                <div className="grid gap-2">
                  {csvHeaders.map((header) => (
                    <div key={header} className="flex items-center gap-3">
                      <span className="text-sm font-medium text-foreground w-40 truncate" title={header}>{header}</span>
                      <ArrowRight className="w-4 h-4 text-muted-foreground shrink-0" />
                      <Select
                        value={mapping[header] || "unmapped"}
                        onValueChange={(v) => setMapping({ ...mapping, [header]: v === "unmapped" ? "" : (v as DestField) })}
                      >
                        <SelectTrigger className="w-48 h-9"><SelectValue /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="unmapped">— Unmapped —</SelectItem>
                          {DESTINATION_FIELDS.map((f) => (
                            <SelectItem key={f.key} value={f.key}>{f.label}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                  ))}
                </div>
                {!hasMappedName && (
                  <p className="mt-3 text-sm text-destructive flex items-center gap-1">
                    <AlertTriangle className="w-4 h-4" /> You must map Full Name, or both First Name and Last Name.
                  </p>
                )}
              </CardContent>
            </Card>

            {/* Preview first 10 rows */}
            <Card className="border-border/50 shadow-sm">
              <CardHeader className="pb-2">
                <CardTitle className="text-base">CSV Preview (first 10 rows of {csvRows.length})</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="overflow-auto max-h-64">
                  <Table>
                    <TableHeader>
                      <TableRow>{csvHeaders.map((h) => <TableHead key={h} className="text-xs">{h}</TableHead>)}</TableRow>
                    </TableHeader>
                    <TableBody>
                      {csvRows.slice(0, 10).map((row, i) => (
                        <TableRow key={i}>{csvHeaders.map((h) => <TableCell key={h} className="text-xs py-1.5">{row[h] || ""}</TableCell>)}</TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              </CardContent>
            </Card>

            <div className="flex justify-between">
              <Button variant="outline" onClick={() => setStep("upload")}>Back</Button>
              <Button onClick={handlePreview} disabled={!hasMappedName}>Preview Import</Button>
            </div>
          </>
        )}

        {/* STEP: Review */}
        {step === "review" && (
          <>
            {/* Summary */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              <SummaryCard label="Total Rows" value={processedRows.length} />
              <SummaryCard label="Valid" value={validRows.length} color="text-green-600" />
              <SummaryCard label="Warnings" value={warningRows.length} color="text-yellow-600" />
              <SummaryCard label="Errors" value={invalidRows.length} color="text-red-600" />
            </div>

            {/* Duplicate handling */}
            <Card className="border-border/50 shadow-sm">
              <CardHeader className="pb-2"><CardTitle className="text-base">Duplicate Handling</CardTitle></CardHeader>
              <CardContent>
                <p className="text-xs text-muted-foreground mb-3">
                  Duplicates are matched by: email first → phone second → exact name third.
                </p>
                <Select value={duplicateMode} onValueChange={(v) => setDuplicateMode(v as DuplicateMode)}>
                  <SelectTrigger className="w-64 h-9"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="skip">Skip duplicates</SelectItem>
                    <SelectItem value="update">Update existing records</SelectItem>
                    <SelectItem value="create_new">Always create new</SelectItem>
                  </SelectContent>
                </Select>
              </CardContent>
            </Card>

            {/* Error rows */}
            {invalidRows.length > 0 && (
              <Card className="border-border/50 shadow-sm border-l-4 border-l-destructive">
                <CardHeader className="pb-2"><CardTitle className="text-base text-destructive">Rows with Errors ({invalidRows.length})</CardTitle></CardHeader>
                <CardContent>
                  <div className="space-y-1">
                    {invalidRows.map((r) => (
                      <div key={r.rowIndex} className="text-sm flex gap-2">
                        <span className="text-muted-foreground shrink-0">Row {r.rowIndex}:</span>
                        <span className="text-destructive">{r.errors.join("; ")}</span>
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>
            )}

            {/* Warning rows */}
            {warningRows.length > 0 && (
              <Card className="border-border/50 shadow-sm border-l-4 border-l-yellow-500">
                <CardHeader className="pb-2"><CardTitle className="text-base text-yellow-700">Warnings ({warningRows.length})</CardTitle></CardHeader>
                <CardContent>
                  <div className="space-y-1">
                    {warningRows.map((r) => (
                      <div key={r.rowIndex} className="text-sm flex gap-2">
                        <span className="text-muted-foreground shrink-0">Row {r.rowIndex}:</span>
                        <span className="text-yellow-700">{r.warnings.join("; ")}</span>
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>
            )}

            {/* Valid rows preview */}
            <Card className="border-border/50 shadow-sm">
              <CardHeader className="pb-2"><CardTitle className="text-base">Valid Records to Import ({validRows.length})</CardTitle></CardHeader>
              <CardContent>
                <div className="overflow-auto max-h-64">
                  <Table>
                    <TableHeader>
                     <TableRow>
                        <TableHead className="text-xs">Row</TableHead>
                        <TableHead className="text-xs">Name</TableHead>
                        <TableHead className="text-xs">Email</TableHead>
                        <TableHead className="text-xs">Phone</TableHead>
                         <TableHead className="text-xs">Last Contacted</TableHead>
                         <TableHead className="text-xs">Follow-Up</TableHead>
                         <TableHead className="text-xs">City</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {validRows.slice(0, 20).map((r) => (
                        <TableRow key={r.rowIndex}>
                          <TableCell className="text-xs py-1.5">{r.rowIndex}</TableCell>
                          <TableCell className="text-xs py-1.5 font-medium">{r.mapped.full_name}</TableCell>
                          <TableCell className="text-xs py-1.5">{r.mapped.email || "—"}</TableCell>
                          <TableCell className="text-xs py-1.5">{r.mapped.phone || "—"}</TableCell>
                           <TableCell className="text-xs py-1.5">{r.mapped.last_contacted || "—"}</TableCell>
                           <TableCell className="text-xs py-1.5">{r.mapped.next_follow_up_date || "—"}</TableCell>
                           <TableCell className="text-xs py-1.5">{r.mapped.city || "—"}</TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                  {validRows.length > 20 && <p className="text-xs text-muted-foreground text-center py-2">+{validRows.length - 20} more rows</p>}
                </div>
              </CardContent>
            </Card>

            <div className="flex justify-between">
              <Button variant="outline" onClick={() => setStep("mapping")}>Back</Button>
              <Button onClick={runImport} disabled={validRows.length === 0} className="gap-2">
                <Upload className="w-4 h-4" />
                Import {validRows.length} Records
              </Button>
            </div>
          </>
        )}

        {/* STEP: Importing */}
        {step === "importing" && (
          <Card className="border-border/50 shadow-sm">
            <CardContent className="p-12 text-center">
              <div className="w-8 h-8 border-2 border-primary border-t-transparent rounded-full animate-spin mx-auto mb-4" />
              <p className="text-foreground font-medium">Importing customers...</p>
              <p className="text-sm text-muted-foreground mt-1">Please don't close this page.</p>
            </CardContent>
          </Card>
        )}

        {/* STEP: Results */}
        {step === "results" && result && (
          <>
            <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
              <SummaryCard label="Total Scanned" value={result.total} />
              <SummaryCard label="Imported" value={result.imported} color="text-green-600" />
              <SummaryCard label="Updated" value={result.updated} color="text-blue-600" />
              <SummaryCard label="Skipped" value={result.skipped} color="text-yellow-600" />
              <SummaryCard label="Errors" value={result.errored} color="text-red-600" />
            </div>

            {/* Details table */}
            <Card className="border-border/50 shadow-sm">
              <CardHeader className="pb-2"><CardTitle className="text-base">Import Details</CardTitle></CardHeader>
              <CardContent>
                <div className="overflow-auto max-h-80">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead className="text-xs">Row</TableHead>
                        <TableHead className="text-xs">Status</TableHead>
                        <TableHead className="text-xs">Details</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {result.details.map((d) => (
                        <TableRow key={d.rowIndex}>
                          <TableCell className="text-xs py-1.5">{d.rowIndex}</TableCell>
                          <TableCell className="text-xs py-1.5">
                            <span className={cn("inline-flex items-center gap-1 px-1.5 py-0.5 rounded font-medium",
                              d.status === "imported" ? "bg-green-100 text-green-700" :
                              d.status === "updated" ? "bg-blue-100 text-blue-700" :
                              d.status === "skipped" ? "bg-yellow-100 text-yellow-700" :
                              "bg-red-100 text-red-700"
                            )}>
                              {d.status === "imported" && <CheckCircle2 className="w-3 h-3" />}
                              {d.status === "error" && <XCircle className="w-3 h-3" />}
                              {d.status}
                            </span>
                          </TableCell>
                          <TableCell className="text-xs py-1.5 text-muted-foreground">{d.reason || "—"}</TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              </CardContent>
            </Card>

            <div className="flex justify-between">
              <Button variant="outline" onClick={() => { setStep("upload"); setFile(null); setCsvRows([]); setResult(null); }}>
                Import More
              </Button>
              <Button onClick={() => navigate("/customers")}>View Customers</Button>
            </div>
          </>
        )}
      </div>
    </Layout>
  );
}

function SummaryCard({ label, value, color }: { label: string; value: number; color?: string }) {
  return (
    <Card className="border-border/50 shadow-sm">
      <CardContent className="p-3 text-center">
        <p className={cn("text-2xl font-bold", color || "text-foreground")}>{value}</p>
        <p className="text-[10px] uppercase tracking-wider text-muted-foreground mt-0.5">{label}</p>
      </CardContent>
    </Card>
  );
}
