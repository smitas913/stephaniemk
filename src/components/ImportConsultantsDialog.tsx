import { useState, useMemo, useCallback } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Upload, FileSpreadsheet, AlertTriangle, CheckCircle2, SkipForward } from "lucide-react";
import { parseCSV } from "@/lib/csvImport";
import { parseGenericDate } from "@/lib/csvImport";
import { createTeamConsultant, fetchTeamConsultants } from "@/lib/queries";
import { toast } from "sonner";

type DestField = "name" | "first_name" | "last_name" | "phone" | "email" | "join_date" | "notes" | "consultant_id" | "birthday" | "address_line_1" | "city" | "state_territory" | "postal_code";

const DEST_FIELDS: { key: DestField; label: string; required: boolean }[] = [
  { key: "name", label: "Full Name", required: false },
  { key: "first_name", label: "First Name", required: false },
  { key: "last_name", label: "Last Name", required: false },
  { key: "phone", label: "Phone", required: false },
  { key: "email", label: "Email", required: false },
  { key: "consultant_id", label: "Consultant ID", required: false },
  { key: "join_date", label: "Start Date", required: false },
  { key: "birthday", label: "Birthday", required: false },
  { key: "address_line_1", label: "Address", required: false },
  { key: "city", label: "City", required: false },
  { key: "state_territory", label: "State", required: false },
  { key: "postal_code", label: "Zip", required: false },
  { key: "notes", label: "Notes", required: false },
];

const HEADER_HINTS: Record<DestField, string[]> = {
  name: ["name", "full_name", "fullname", "full name", "consultant name", "consultant"],
  first_name: ["first_name", "firstname", "first name", "first"],
  last_name: ["last_name", "lastname", "last name", "last", "surname"],
  phone: ["phone", "telephone", "tel", "mobile", "cell", "phone number"],
  email: ["email", "e-mail", "email address"],
  consultant_id: ["consultant_id", "consultant id", "id", "member id", "rep id"],
  join_date: ["join_date", "join date", "joined", "start date", "start_date", "date joined"],
  birthday: ["birthday", "birth_date", "birthdate", "dob", "date of birth"],
  address_line_1: ["address", "address_line_1", "street", "mailing address"],
  city: ["city", "town"],
  state_territory: ["state", "state_territory", "province", "st"],
  postal_code: ["zip", "postal_code", "zipcode", "zip code", "postal"],
  notes: ["notes", "note", "comments", "comment"],
};

function autoMap(csvHeaders: string[]): Record<string, DestField | ""> {
  const mapping: Record<string, DestField | ""> = {};
  const used = new Set<DestField>();
  for (const header of csvHeaders) {
    const lower = header.toLowerCase().replace(/[^a-z0-9]/g, "");
    let matched: DestField | "" = "";
    for (const [dest, hints] of Object.entries(HEADER_HINTS) as [DestField, string[]][]) {
      if (used.has(dest)) continue;
      for (const hint of hints) {
        if (lower === hint.replace(/[^a-z0-9]/g, "")) { matched = dest; break; }
      }
      if (matched) break;
    }
    if (matched) used.add(matched);
    mapping[header] = matched;
  }
  return mapping;
}

type DupAction = "skip" | "update";

interface DupRow {
  rowIdx: number;
  name: string;
  matchReason: string;
  existingId: string;
}

type Step = "upload" | "mapping" | "review" | "importing" | "done";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export default function ImportConsultantsDialog({ open, onOpenChange }: Props) {
  const queryClient = useQueryClient();
  const [step, setStep] = useState<Step>("upload");
  const [csvHeaders, setCsvHeaders] = useState<string[]>([]);
  const [csvRows, setCsvRows] = useState<Record<string, string>[]>([]);
  const [mapping, setMapping] = useState<Record<string, DestField | "">>({});
  const [dupAction, setDupAction] = useState<DupAction>("skip");
  const [duplicates, setDuplicates] = useState<DupRow[]>([]);
  const [progress, setProgress] = useState(0);
  const [results, setResults] = useState({ imported: 0, updated: 0, skipped: 0, errored: 0 });

  const reset = () => {
    setStep("upload");
    setCsvHeaders([]);
    setCsvRows([]);
    setMapping({});
    setDuplicates([]);
    setProgress(0);
    setResults({ imported: 0, updated: 0, skipped: 0, errored: 0 });
    setDupAction("skip");
  };

  const handleFile = useCallback(async (file: File) => {
    try {
      const { headers, rows } = await parseCSV(file);
      setCsvHeaders(headers);
      setCsvRows(rows);
      setMapping(autoMap(headers));
      setStep("mapping");
    } catch {
      toast.error("Could not parse CSV file");
    }
  }, []);

  const hasName = useMemo(() => Object.values(mapping).includes("name") || (Object.values(mapping).includes("first_name") || Object.values(mapping).includes("last_name")), [mapping]);

  const mappedRows = useMemo(() => {
    return csvRows.map((raw, i) => {
      const mapped: Partial<Record<DestField, string>> = {};
      for (const [col, dest] of Object.entries(mapping)) {
        if (dest && raw[col]) mapped[dest] = raw[col].trim();
      }
      // Auto-generate full name from first + last if no full name mapped
      if (!mapped.name && (mapped.first_name || mapped.last_name)) {
        mapped.name = [mapped.first_name, mapped.last_name].filter(Boolean).join(" ").trim();
      }
      return { rowIdx: i + 1, mapped, hasError: !mapped.name?.trim() };
    });
  }, [csvRows, mapping]);

  const validRows = useMemo(() => mappedRows.filter((r) => !r.hasError), [mappedRows]);

  const handleReview = useCallback(async () => {
    const existing = await fetchTeamConsultants();
    const dups: DupRow[] = [];
    for (const row of validRows) {
      const email = row.mapped.email?.toLowerCase();
      const name = row.mapped.name?.trim().toLowerCase();
      if (email) {
        const match = existing.find((c) => c.email?.toLowerCase() === email);
        if (match) { dups.push({ rowIdx: row.rowIdx, name: row.mapped.name || "", matchReason: `Email: ${email}`, existingId: match.id }); continue; }
      }
      if (name) {
        const match = existing.find((c) => c.name.trim().toLowerCase() === name);
        if (match) { dups.push({ rowIdx: row.rowIdx, name: row.mapped.name || "", matchReason: `Name: ${match.name}`, existingId: match.id }); continue; }
      }
    }
    setDuplicates(dups);
    setStep("review");
  }, [validRows]);

  const runImport = useCallback(async () => {
    setStep("importing");
    const dupIds = new Set(duplicates.map((d) => d.rowIdx));
    let imported = 0, updated = 0, skipped = 0, errored = 0;
    const total = validRows.length;

    for (let i = 0; i < validRows.length; i++) {
      const row = validRows[i];
      setProgress(Math.round(((i + 1) / total) * 100));

      const isDup = dupIds.has(row.rowIdx);
      if (isDup && dupAction === "skip") { skipped++; continue; }

      const joinDate = row.mapped.join_date ? parseGenericDate(row.mapped.join_date) : null;
      const birthdayDate = row.mapped.birthday ? parseGenericDate(row.mapped.birthday) : null;
      const payload: Record<string, any> = {
        name: row.mapped.name!.trim(),
        phone: row.mapped.phone || null,
        email: row.mapped.email || null,
        consultant_id: row.mapped.consultant_id || null,
        join_date: joinDate || null,
        birthday: birthdayDate || null,
        address_line_1: row.mapped.address_line_1 || null,
        city: row.mapped.city || null,
        state_territory: row.mapped.state_territory || null,
        postal_code: row.mapped.postal_code || null,
        notes: row.mapped.notes || null,
        status: "Active",
        focus_group: "General",
        onboarding_stage: "New",
      };

      try {
        if (isDup && dupAction === "update") {
          const dupInfo = duplicates.find((d) => d.rowIdx === row.rowIdx)!;
          const { supabase } = await import("@/integrations/supabase/client");
          const { error } = await supabase.from("team_consultants").update(payload).eq("id", dupInfo.existingId);
          if (error) throw error;
          updated++;
        } else {
          await createTeamConsultant(payload as any);
          imported++;
        }
      } catch {
        errored++;
      }
    }

    setResults({ imported, updated, skipped, errored });
    queryClient.invalidateQueries({ queryKey: ["team-consultants"] });
    setStep("done");
  }, [validRows, duplicates, dupAction, queryClient]);

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) reset(); onOpenChange(o); }}>
      <DialogContent className="max-w-lg max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="text-base flex items-center gap-2">
            <FileSpreadsheet className="w-4 h-4" />Import Consultants from CSV
          </DialogTitle>
        </DialogHeader>

        {step === "upload" && (
          <div className="space-y-4">
            <label className="flex flex-col items-center justify-center gap-2 border-2 border-dashed border-border rounded-lg p-8 cursor-pointer hover:bg-muted/40 transition-colors">
              <Upload className="w-8 h-8 text-muted-foreground" />
              <span className="text-sm text-muted-foreground">Click to select a CSV file</span>
              <input type="file" accept=".csv" className="hidden" onChange={(e) => e.target.files?.[0] && handleFile(e.target.files[0])} />
            </label>
            <p className="text-xs text-muted-foreground">Supported fields: Name, Phone, Email, Join Date, Notes</p>
          </div>
        )}

        {step === "mapping" && (
          <div className="space-y-4">
            <p className="text-sm text-muted-foreground">Map your CSV columns to consultant fields.</p>
            <div className="space-y-2">
              {csvHeaders.map((h) => (
                <div key={h} className="flex items-center gap-2">
                  <span className="text-xs font-medium w-1/3 truncate">{h}</span>
                  <span className="text-xs text-muted-foreground">→</span>
                  <Select value={mapping[h] || "skip"} onValueChange={(v) => setMapping((prev) => ({ ...prev, [h]: v === "skip" ? "" : v as DestField }))}>
                    <SelectTrigger className="h-8 flex-1 text-xs"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="skip">— Skip —</SelectItem>
                      {DEST_FIELDS.map((f) => <SelectItem key={f.key} value={f.key}>{f.label}{f.required ? " *" : ""}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
              ))}
            </div>
            {!hasName && <p className="text-xs text-destructive flex items-center gap-1"><AlertTriangle className="w-3 h-3" />Name column must be mapped</p>}
            <div className="flex justify-between">
              <Button variant="outline" size="sm" onClick={reset}>Back</Button>
              <Button size="sm" disabled={!hasName} onClick={handleReview}>Preview ({validRows.length} rows)</Button>
            </div>
          </div>
        )}

        {step === "review" && (
          <div className="space-y-4">
            <div className="grid grid-cols-3 gap-2 text-center">
              <div className="rounded-md bg-muted p-2">
                <p className="text-lg font-bold text-foreground">{validRows.length}</p>
                <p className="text-[10px] text-muted-foreground">Valid Rows</p>
              </div>
              <div className="rounded-md bg-muted p-2">
                <p className="text-lg font-bold text-foreground">{mappedRows.length - validRows.length}</p>
                <p className="text-[10px] text-muted-foreground">Missing Name</p>
              </div>
              <div className="rounded-md bg-muted p-2">
                <p className="text-lg font-bold text-foreground">{duplicates.length}</p>
                <p className="text-[10px] text-muted-foreground">Duplicates</p>
              </div>
            </div>

            {duplicates.length > 0 && (
              <div className="space-y-2">
                <p className="text-xs font-medium">Duplicate handling:</p>
                <Select value={dupAction} onValueChange={(v) => setDupAction(v as DupAction)}>
                  <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="skip">Skip duplicates</SelectItem>
                    <SelectItem value="update">Update existing records</SelectItem>
                  </SelectContent>
                </Select>
                <div className="max-h-32 overflow-y-auto space-y-1">
                  {duplicates.map((d) => (
                    <p key={d.rowIdx} className="text-[11px] text-muted-foreground flex items-center gap-1">
                      <SkipForward className="w-3 h-3 shrink-0" />Row {d.rowIdx}: {d.name} — {d.matchReason}
                    </p>
                  ))}
                </div>
              </div>
            )}

            <div className="flex justify-between">
              <Button variant="outline" size="sm" onClick={() => setStep("mapping")}>Back</Button>
              <Button size="sm" onClick={runImport}>Import {validRows.length - (dupAction === "skip" ? duplicates.length : 0)} Consultants</Button>
            </div>
          </div>
        )}

        {step === "importing" && (
          <div className="space-y-4 py-4">
            <Progress value={progress} className="h-2" />
            <p className="text-sm text-center text-muted-foreground">Importing… {progress}%</p>
          </div>
        )}

        {step === "done" && (
          <div className="space-y-4">
            <div className="flex items-center gap-2 text-primary">
              <CheckCircle2 className="w-5 h-5" />
              <p className="text-sm font-medium">Import Complete</p>
            </div>
            <div className="grid grid-cols-4 gap-2 text-center">
              {[
                { label: "Imported", value: results.imported, color: "text-primary" },
                { label: "Updated", value: results.updated, color: "text-blue-600" },
                { label: "Skipped", value: results.skipped, color: "text-muted-foreground" },
                { label: "Errors", value: results.errored, color: "text-destructive" },
              ].map((s) => (
                <div key={s.label} className="rounded-md bg-muted p-2">
                  <p className={`text-lg font-bold ${s.color}`}>{s.value}</p>
                  <p className="text-[10px] text-muted-foreground">{s.label}</p>
                </div>
              ))}
            </div>
            <Button className="w-full" onClick={() => { reset(); onOpenChange(false); }}>Done</Button>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
