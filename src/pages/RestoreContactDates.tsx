import { useState, useCallback, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import Layout from "@/components/Layout";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { toast } from "sonner";
import { Upload, CheckCircle2, AlertTriangle, ArrowRight } from "lucide-react";
import { parseCSV, parseGenericDate } from "@/lib/csvImport";
import { cn } from "@/lib/utils";
import { addDays, isWeekend, nextMonday, format } from "date-fns";

const FORCED_LAST_CONTACTED_COL = 23; // Column X (0-indexed)

type Step = "upload" | "preview" | "running" | "done";

interface MatchResult {
  customerId: string;
  name: string;
  oldLastContacted: string | null;
  newLastContacted: string | null;
  status: "updated" | "no_date" | "not_found";
}

function toBusinessDay(d: Date): Date {
  return isWeekend(d) ? nextMonday(d) : d;
}

export default function RestoreContactDates() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  const [step, setStep] = useState<Step>("upload");
  const [results, setResults] = useState<MatchResult[]>([]);
  const [followUpStats, setFollowUpStats] = useState({ cleared: 0, assigned: 0 });
  const [progress, setProgress] = useState(0);
  const [dragOver, setDragOver] = useState(false);

  const handleFile = useCallback(async (file: File) => {
    if (!file.name.endsWith(".csv")) {
      toast.error("Please upload a CSV file");
      return;
    }

    try {
      setStep("running");
      setProgress(5);

      // Step 1: Parse CSV and extract column X
      const { headers, rows } = await parseCSV(file);
      const lastContactedHeader = headers[FORCED_LAST_CONTACTED_COL];
      if (!lastContactedHeader) {
        toast.error(`Column X (index ${FORCED_LAST_CONTACTED_COL}) not found in CSV`);
        setStep("upload");
        return;
      }

      // Find name columns for matching
      const nameHeaders = headers.filter(h => {
        const lower = h.toLowerCase().replace(/[^a-z0-9]/g, "");
        return ["fullname", "name", "customername", "contactname", "firstname", "lastname"].some(hint => lower.includes(hint));
      });

      // Also detect first_name and last_name columns
      const firstNameCol = headers.find(h => h.toLowerCase().replace(/[^a-z0-9]/g, "").match(/^(firstname|first)$/));
      const lastNameCol = headers.find(h => h.toLowerCase().replace(/[^a-z0-9]/g, "").match(/^(lastname|last|surname)$/));
      const fullNameCol = headers.find(h => h.toLowerCase().replace(/[^a-z0-9]/g, "").match(/^(fullname|name|customername|contactname)$/));

      // Build CSV contact date map: name -> date
      const csvData: { name: string; email: string; phone: string; lastContacted: string | null }[] = [];
      const emailCol = headers.find(h => h.toLowerCase().includes("email"));
      const phoneCol = headers.find(h => h.toLowerCase().match(/phone|tel|mobile|cell/));

      for (const row of rows) {
        let name = "";
        if (fullNameCol && row[fullNameCol]?.trim()) {
          name = row[fullNameCol].trim();
        } else if (firstNameCol || lastNameCol) {
          name = [row[firstNameCol || ""], row[lastNameCol || ""]].filter(Boolean).map(s => s.trim()).join(" ");
        }
        if (!name) continue;

        const rawDate = row[lastContactedHeader]?.trim() || "";
        const parsedDate = rawDate ? parseGenericDate(rawDate) : null;

        csvData.push({
          name,
          email: emailCol ? (row[emailCol]?.trim().toLowerCase() || "") : "",
          phone: phoneCol ? (row[phoneCol]?.trim().replace(/\D/g, "") || "") : "",
          lastContacted: parsedDate,
        });
      }

      setProgress(20);

      // Step 2: Fetch all customers
      const { data: customers, error: fetchErr } = await supabase
        .from("customers")
        .select("id, full_name, email, phone, last_contacted, relationship_status, is_active, archived_at, last_order_date_order_log, last_order_mk, next_follow_up_date");
      if (fetchErr) throw fetchErr;

      setProgress(30);

      // Step 3: Match and update last_contacted
      const matchResults: MatchResult[] = [];
      const normalizeName = (s: string) => s.trim().toLowerCase().replace(/\s+/g, " ");
      const normalizePhone = (s: string) => s.replace(/\D/g, "");

      for (const csvRow of csvData) {
        const csvName = normalizeName(csvRow.name);
        const csvEmail = csvRow.email;
        const csvPhone = csvRow.phone;

        // Match: email > phone > name
        let match = customers?.find(c => csvEmail && c.email?.toLowerCase() === csvEmail);
        if (!match && csvPhone && csvPhone.length >= 10) {
          match = customers?.find(c => c.phone && normalizePhone(c.phone) === csvPhone.slice(-10));
        }
        if (!match) {
          match = customers?.find(c => normalizeName(c.full_name) === csvName);
        }

        if (!match) {
          matchResults.push({ customerId: "", name: csvRow.name, oldLastContacted: null, newLastContacted: csvRow.lastContacted, status: "not_found" });
          continue;
        }

        if (!csvRow.lastContacted) {
          matchResults.push({ customerId: match.id, name: match.full_name, oldLastContacted: match.last_contacted, newLastContacted: null, status: "no_date" });
          continue;
        }

        // Update last_contacted
        const { error: updateErr } = await supabase
          .from("customers")
          .update({ last_contacted: csvRow.lastContacted })
          .eq("id", match.id);

        if (updateErr) {
          console.error(`Failed to update ${match.full_name}:`, updateErr);
        }

        matchResults.push({
          customerId: match.id,
          name: match.full_name,
          oldLastContacted: match.last_contacted,
          newLastContacted: csvRow.lastContacted,
          status: "updated",
        });
      }

      setProgress(50);

      // Step 4: Clear stale next_follow_up_date
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      const todayISO = format(today, "yyyy-MM-dd");

      const { data: staleFU, error: staleErr } = await supabase
        .from("customers")
        .select("id")
        .is("archived_at", null)
        .eq("is_active", true)
        .not("next_follow_up_date", "is", null)
        .lt("next_follow_up_date", todayISO);

      let cleared = 0;
      if (staleFU && staleFU.length > 0) {
        const ids = staleFU.map(c => c.id);
        const { error: clearErr } = await supabase
          .from("customers")
          .update({ next_follow_up_date: null } as any)
          .in("id", ids);
        if (!clearErr) cleared = ids.length;
      }

      // Also clear dates before 2024
      const { data: junkFU } = await supabase
        .from("customers")
        .select("id")
        .not("next_follow_up_date", "is", null)
        .lt("next_follow_up_date", "2024-01-01");

      if (junkFU && junkFU.length > 0) {
        const ids = junkFU.map(c => c.id);
        const { error: clearErr } = await supabase
          .from("customers")
          .update({ next_follow_up_date: null } as any)
          .in("id", ids);
        if (!clearErr) cleared += ids.length;
      }

      setProgress(65);

      // Step 5: Re-fetch customers to get updated data, then distribute follow-ups
      const { data: freshCustomers, error: freshErr } = await supabase
        .from("customers")
        .select("id, full_name, last_contacted, last_order_date_order_log, last_order_mk, relationship_status, is_active, archived_at, next_follow_up_date, new_customer_flag")
        .is("archived_at", null)
        .eq("is_active", true);

      if (freshErr) throw freshErr;

      // Filter: only non-consultants without an existing future follow-up
      const needsFollowUp = (freshCustomers || []).filter(c => {
        if (c.relationship_status === "Consultant") return false;
        if (c.next_follow_up_date && c.next_follow_up_date >= todayISO) return false;
        return true;
      });

      // Priority scoring: higher = more urgent
      const scored = needsFollowUp.map(c => {
        const lastOrder = c.last_order_date_order_log || c.last_order_mk || null;
        const lastContact = c.last_contacted;
        let score = 0;

        // No contact history = highest priority
        if (!lastContact) score += 100;

        // Days since last order
        if (lastOrder) {
          const daysSince = Math.floor((today.getTime() - new Date(lastOrder).getTime()) / 86400000);
          if (daysSince >= 180) score += 80;
          else if (daysSince >= 90) score += 60;
          else if (daysSince >= 60) score += 30;
          else score += 10;
        } else {
          score += 50; // no orders
        }

        // Days since contact
        if (lastContact) {
          const daysSinceContact = Math.floor((today.getTime() - new Date(lastContact).getTime()) / 86400000);
          if (daysSinceContact >= 90) score += 40;
          else if (daysSinceContact >= 30) score += 20;
        }

        return { ...c, score };
      });

      // Sort by score descending (most urgent first)
      scored.sort((a, b) => b.score - a.score);

      setProgress(80);

      // Distribute across 60 business days, 8-10 per day
      const DAYS = 60;
      const PER_DAY = Math.max(8, Math.ceil(scored.length / DAYS));
      let assigned = 0;
      let currentDay = 0;
      let dayCount = 0;

      for (const customer of scored) {
        // Find next business day
        let targetDate = addDays(today, currentDay + 1);
        targetDate = toBusinessDay(targetDate);

        const dateStr = format(targetDate, "yyyy-MM-dd");

        const { error: assignErr } = await supabase
          .from("customers")
          .update({ next_follow_up_date: dateStr } as any)
          .eq("id", customer.id);

        if (!assignErr) assigned++;

        dayCount++;
        if (dayCount >= PER_DAY) {
          dayCount = 0;
          currentDay++;
        }
      }

      setProgress(100);

      setResults(matchResults);
      setFollowUpStats({ cleared, assigned });
      setStep("done");

      queryClient.invalidateQueries({ queryKey: ["customers"] });
      queryClient.invalidateQueries({ queryKey: ["follow-up-queue"] });

      const updatedCount = matchResults.filter(r => r.status === "updated").length;
      toast.success(`Restored ${updatedCount} contact dates, assigned ${assigned} follow-ups`);
    } catch (err: any) {
      toast.error(`Error: ${err.message}`);
      setStep("upload");
    }
  }, [queryClient]);

  const stats = useMemo(() => {
    const updated = results.filter(r => r.status === "updated").length;
    const noDate = results.filter(r => r.status === "no_date").length;
    const notFound = results.filter(r => r.status === "not_found").length;
    return { updated, noDate, notFound, total: results.length };
  }, [results]);

  return (
    <Layout>
      <div className="max-w-3xl mx-auto space-y-6">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Restore Contact Dates</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Re-import column X from your CSV to restore Last Contacted dates and rebuild follow-up assignments
          </p>
        </div>

        {step === "upload" && (
          <Card
            className={cn(
              "border-2 border-dashed transition-colors cursor-pointer",
              dragOver ? "border-primary bg-primary/5" : "border-border"
            )}
            onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
            onDragLeave={() => setDragOver(false)}
            onDrop={(e) => { e.preventDefault(); setDragOver(false); const f = e.dataTransfer.files[0]; if (f) handleFile(f); }}
          >
            <CardContent className="flex flex-col items-center justify-center py-12 gap-4">
              <Upload className="w-10 h-10 text-muted-foreground" />
              <div className="text-center space-y-1">
                <p className="text-sm font-medium text-foreground">Upload the same CSV you originally imported</p>
                <p className="text-xs text-muted-foreground">Column X will be used for Last Contacted dates</p>
              </div>
              <Button variant="outline" onClick={() => document.getElementById("restore-file-input")?.click()}>
                Choose File
              </Button>
              <input
                id="restore-file-input"
                type="file"
                accept=".csv"
                className="hidden"
                onChange={(e) => { const f = e.target.files?.[0]; if (f) handleFile(f); }}
              />
            </CardContent>
          </Card>
        )}

        {step === "running" && (
          <Card>
            <CardContent className="py-8 space-y-4">
              <div className="flex items-center gap-3">
                <div className="w-5 h-5 border-2 border-primary border-t-transparent rounded-full animate-spin" />
                <span className="text-sm font-medium text-foreground">
                  {progress < 30 ? "Parsing CSV and matching customers..." :
                   progress < 50 ? "Updating last contacted dates..." :
                   progress < 65 ? "Clearing stale follow-up dates..." :
                   progress < 80 ? "Scoring and prioritizing customers..." :
                   "Distributing follow-up assignments..."}
                </span>
              </div>
              <Progress value={progress} className="h-2" />
            </CardContent>
          </Card>
        )}

        {step === "done" && (
          <div className="space-y-4">
            {/* Summary Cards */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              <SummaryCard label="Dates Restored" value={stats.updated} accent="text-green-600" />
              <SummaryCard label="No Date in CSV" value={stats.noDate} accent="text-muted-foreground" />
              <SummaryCard label="Not Matched" value={stats.notFound} accent="text-yellow-600" />
              <SummaryCard label="Follow-Ups Assigned" value={followUpStats.assigned} accent="text-primary" />
            </div>

            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">
                  Follow-Up Rebuild
                </CardTitle>
              </CardHeader>
              <CardContent className="text-sm space-y-1">
                <p><span className="font-medium">{followUpStats.cleared}</span> stale/past follow-up dates cleared</p>
                <p><span className="font-medium">{followUpStats.assigned}</span> customers assigned across next 60 business days</p>
                <p className="text-muted-foreground">8–10 follow-ups per day, prioritized by urgency</p>
              </CardContent>
            </Card>

            {/* Detail table for restored dates */}
            {stats.updated > 0 && (
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">
                    Restored Dates ({stats.updated})
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="max-h-64 overflow-y-auto">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="border-b border-border text-left">
                          <th className="pb-2 font-medium text-muted-foreground">Customer</th>
                          <th className="pb-2 font-medium text-muted-foreground">Last Contacted</th>
                        </tr>
                      </thead>
                      <tbody>
                        {results.filter(r => r.status === "updated").map((r) => (
                          <tr key={r.customerId} className="border-b border-border/50">
                            <td className="py-1.5 text-foreground">{r.name}</td>
                            <td className="py-1.5">
                              <span className="text-green-600 font-medium">{r.newLastContacted}</span>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </CardContent>
              </Card>
            )}

            <div className="flex gap-3">
              <Button onClick={() => navigate("/follow-ups")}>
                View Follow-Ups <ArrowRight className="w-4 h-4 ml-1" />
              </Button>
              <Button variant="outline" onClick={() => navigate("/customers")}>
                View Customers
              </Button>
            </div>
          </div>
        )}
      </div>
    </Layout>
  );
}

function SummaryCard({ label, value, accent }: { label: string; value: number; accent?: string }) {
  return (
    <Card className="border-border/50">
      <CardContent className="p-3.5 text-center">
        <p className={cn("text-2xl font-bold", accent)}>{value}</p>
        <p className="text-xs text-muted-foreground mt-0.5">{label}</p>
      </CardContent>
    </Card>
  );
}
