import { useMemo, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { format, parseISO, startOfWeek, endOfWeek, startOfMonth, endOfMonth, isWithinInterval } from "date-fns";
import { Link } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from "@/components/ui/alert-dialog";
import { Trash2, ExternalLink, CalendarIcon, Sparkles, Pencil } from "lucide-react";
import { cn } from "@/lib/utils";
import { toast } from "@/hooks/use-toast";
import type { EventRecord, Note, Customer } from "@/lib/types";

export type DrillMetricKey = "faces" | "career_chats" | "new_team_members" | "new_skincare_customers";

interface Props {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  metricKey: DrillMetricKey;
  metricLabel: string;
  period: "weekly" | "monthly";
  notes: Note[];
  events: EventRecord[];
  customers: Customer[];
  consultants: Array<{ id: string; created_at: string; join_date?: string | null; relationship_type: string | null; name?: string | null }>;
}

interface Row {
  id: string;
  source: "Quick Add" | "Event" | "Manual" | "Customer" | "Consultant";
  date: string;
  personName: string;
  personId?: string | null;
  personType?: string | null;
  notes?: string | null;
  // For deletion
  table: "notes" | "events" | "customers" | "team_consultants";
  // Editing context
  href?: string;
  // For events: include guest count
  count?: number;
}

function inRange(dateStr: string | null | undefined, start: Date, end: Date): boolean {
  if (!dateStr) return false;
  try { return isWithinInterval(parseISO(dateStr), { start, end }); } catch { return false; }
}

export default function MetricDrillDownDialog({
  open, onOpenChange, metricKey, metricLabel, period,
  notes, events, customers, consultants,
}: Props) {
  const qc = useQueryClient();
  const now = new Date();
  const defaultStart = period === "weekly" ? startOfWeek(now, { weekStartsOn: 1 }) : startOfMonth(now);
  const defaultEnd = period === "weekly" ? endOfWeek(now, { weekStartsOn: 1 }) : endOfMonth(now);

  // Per spec: default filter is Current Week for all metrics; user can expand to month/custom.
  const [rangeMode, setRangeMode] = useState<"week" | "month" | "custom">("week");
  const [customStart, setCustomStart] = useState<Date | undefined>(defaultStart);
  const [customEnd, setCustomEnd] = useState<Date | undefined>(defaultEnd);

  const { start, end } = useMemo(() => {
    if (rangeMode === "week") return { start: startOfWeek(now, { weekStartsOn: 1 }), end: endOfWeek(now, { weekStartsOn: 1 }) };
    if (rangeMode === "month") return { start: startOfMonth(now), end: endOfMonth(now) };
    return { start: customStart ?? defaultStart, end: customEnd ?? defaultEnd };
  }, [rangeMode, customStart, customEnd]);

  const customerById = useMemo(() => new Map(customers.map((c) => [c.id, c])), [customers]);

  // Edit dialog state — only for note-backed rows
  const [editing, setEditing] = useState<{ noteId: string; date: string; body: string } | null>(null);
  const [savingEdit, setSavingEdit] = useState(false);

  const rows: Row[] = useMemo(() => {
    const out: Row[] = [];
    if (metricKey === "faces") {
      // Held event guest counts
      events.filter((e) => e.event_status === "Held" && inRange(e.event_date, start, end)).forEach((e) => {
        const gc = Number(e.guest_count || 0);
        if (gc > 0) {
          out.push({
            id: `evt-${e.id}`,
            source: "Event",
            date: e.event_date || "",
            personName: e.hostess_name || `Event ${e.event_id}`,
            notes: `${gc} guest${gc === 1 ? "" : "s"} (Held event)`,
            table: "events",
            href: `/events/${e.event_id}`,
            count: gc,
          });
        }
      });
      // Quick Add Face notes
      notes.filter((n) => n.result_type === "Face" && inRange(n.note_date, start, end)).forEach((n) => {
        out.push(noteRow(n, customerById));
      });
    } else if (metricKey === "career_chats") {
      notes.filter((n) => n.result_type === "Career Chat" && inRange(n.note_date, start, end)).forEach((n) => {
        out.push(noteRow(n, customerById));
      });
    } else if (metricKey === "new_team_members") {
      consultants.filter((c) => {
        const rt = c.relationship_type ?? "Personal Recruit";
        return rt === "Personal Recruit" && inRange(c.join_date ?? c.created_at, start, end);
      }).forEach((c) => {
        const date = c.join_date ?? c.created_at ?? "";
        out.push({
          id: `con-${c.id}`,
          source: "Consultant",
          date: date ? `${new Date(date).getFullYear()}-${String(new Date(date).getMonth() + 1).padStart(2, "0")}-${String(new Date(date).getDate()).padStart(2, "0")}` : "",
          personName: c.name || "Consultant",
          personId: c.id,
          personType: "consultant",
          table: "team_consultants",
          href: `/consultants/${c.id}`,
        });
      });
    } else if (metricKey === "new_skincare_customers") {
      customers.filter((c) => inRange((c as any).skincare_started_at, start, end)).forEach((c) => {
        out.push({
          id: `cus-${c.id}`,
          source: "Customer",
          date: ((c as any).skincare_started_at || "").slice(0, 10),
          personName: c.full_name,
          personId: c.id,
          personType: "customer",
          notes: "Marked as skincare customer",
          table: "customers",
          href: `/customers/${c.id}`,
        });
      });
    }
    out.sort((a, b) => (b.date || "").localeCompare(a.date || ""));
    return out;
  }, [metricKey, notes, events, customers, consultants, start, end, customerById]);

  const handleDelete = async (row: Row) => {
    try {
      if (row.table === "notes") {
        const id = row.id.replace(/^note-/, "");
        const { error } = await supabase.from("notes").delete().eq("id", id);
        if (error) throw error;
      } else if (row.table === "events") {
        // For events: clear guest_count rather than deleting event
        const id = row.id.replace(/^evt-/, "");
        const { error } = await supabase.from("events").update({ guest_count: 0 }).eq("id", id);
        if (error) throw error;
      } else if (row.table === "customers") {
        // Don't delete the customer record — just clear skincare flag
        const id = row.id.replace(/^cus-/, "");
        const { error } = await supabase.from("customers").update({ is_skincare_customer: false, skincare_started_at: null }).eq("id", id);
        if (error) throw error;
      } else if (row.table === "team_consultants") {
        // Don't delete consultant; can't safely revert. Show toast.
        toast({ title: "Cannot remove", description: "Edit the consultant directly to change their join date or status.", variant: "destructive" });
        return;
      }
      toast({ title: "Removed from count" });
      qc.invalidateQueries({ queryKey: ["notes-all"] });
      qc.invalidateQueries({ queryKey: ["events"] });
      qc.invalidateQueries({ queryKey: ["customers"] });
    } catch (err) {
      toast({ title: "Failed to remove", description: err instanceof Error ? err.message : "Unknown error", variant: "destructive" });
    }
  };

  const cleanupTestEntries = async () => {
    try {
      const startStr = format(start, "yyyy-MM-dd");
      const endStr = format(end, "yyyy-MM-dd");
      let resultTypes: string[] = [];
      if (metricKey === "faces") resultTypes = ["Face"];
      else if (metricKey === "career_chats") resultTypes = ["Career Chat"];
      else {
        toast({ title: "Use Admin Tools", description: "Cleanup for this metric is only available in Admin Tools.", variant: "destructive" });
        return;
      }
      const { error, count } = await supabase
        .from("notes")
        .delete({ count: "exact" })
        .in("result_type", resultTypes)
        .gte("note_date", startStr)
        .lte("note_date", endStr);
      if (error) throw error;
      toast({ title: "Test entries cleared", description: `Removed ${count ?? 0} ${metricLabel} record${count === 1 ? "" : "s"} in range.` });
      qc.invalidateQueries({ queryKey: ["notes-all"] });
    } catch (err) {
      toast({ title: "Cleanup failed", description: err instanceof Error ? err.message : "Unknown error", variant: "destructive" });
    }
  };

  const saveEdit = async () => {
    if (!editing) return;
    setSavingEdit(true);
    try {
      const { error } = await supabase
        .from("notes")
        .update({ note_date: editing.date, note_body: editing.body })
        .eq("id", editing.noteId);
      if (error) throw error;
      toast({ title: "Activity updated" });
      qc.invalidateQueries({ queryKey: ["notes-all"] });
      setEditing(null);
    } catch (err) {
      toast({ title: "Update failed", description: err instanceof Error ? err.message : "Unknown error", variant: "destructive" });
    } finally {
      setSavingEdit(false);
    }
  };

  const total = rows.reduce((s, r) => s + (r.count ?? 1), 0);
  const canCleanup = metricKey === "faces" || metricKey === "career_chats";

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[85vh] flex flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            {metricLabel} <Badge variant="secondary">{total}</Badge>
          </DialogTitle>
          <p className="text-xs text-muted-foreground">
            {format(start, "MMM d, yyyy")} – {format(end, "MMM d, yyyy")}
          </p>
        </DialogHeader>

        {/* Filter chips */}
        <div className="flex flex-wrap items-center gap-2 pb-2 border-b border-border/50">
          <Button size="sm" variant={rangeMode === "week" ? "default" : "outline"} onClick={() => setRangeMode("week")}>This Week</Button>
          <Button size="sm" variant={rangeMode === "month" ? "default" : "outline"} onClick={() => setRangeMode("month")}>This Month</Button>
          <Button size="sm" variant={rangeMode === "custom" ? "default" : "outline"} onClick={() => setRangeMode("custom")}>Custom</Button>
          {rangeMode === "custom" && (
            <div className="flex items-center gap-1">
              <Popover>
                <PopoverTrigger asChild>
                  <Button size="sm" variant="outline" className="gap-1">
                    <CalendarIcon className="w-3 h-3" />
                    {customStart ? format(customStart, "MMM d") : "Start"}
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-auto p-0" align="start">
                  <Calendar mode="single" selected={customStart} onSelect={setCustomStart} initialFocus className={cn("p-3 pointer-events-auto")} />
                </PopoverContent>
              </Popover>
              <span className="text-xs text-muted-foreground">to</span>
              <Popover>
                <PopoverTrigger asChild>
                  <Button size="sm" variant="outline" className="gap-1">
                    <CalendarIcon className="w-3 h-3" />
                    {customEnd ? format(customEnd, "MMM d") : "End"}
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-auto p-0" align="start">
                  <Calendar mode="single" selected={customEnd} onSelect={setCustomEnd} initialFocus className={cn("p-3 pointer-events-auto")} />
                </PopoverContent>
              </Popover>
            </div>
          )}
        </div>

        {/* List */}
        <div className="flex-1 overflow-y-auto -mx-6 px-6">
          {rows.length === 0 ? (
            <p className="text-sm text-muted-foreground py-8 text-center">No records in this range.</p>
          ) : (
            <ul className="divide-y divide-border/50">
              {rows.map((row) => (
                <li key={row.id} className="py-3 flex items-start justify-between gap-3">
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-medium text-sm text-foreground truncate">{row.personName}</span>
                      <Badge variant="outline" className="text-[10px] py-0">{row.source}</Badge>
                      <span className="text-xs text-muted-foreground">{row.date ? format(parseISO(row.date), "MMM d") : ""}</span>
                    </div>
                    {row.notes && <p className="text-xs text-muted-foreground mt-1 line-clamp-2">{row.notes}</p>}
                  </div>
                  <div className="flex items-center gap-1 shrink-0">
                    {row.href && (
                      <Button asChild size="icon" variant="ghost" className="h-8 w-8" title="Open profile">
                        <Link to={row.href} onClick={() => onOpenChange(false)}><ExternalLink className="w-4 h-4" /></Link>
                      </Button>
                    )}
                    {row.table === "notes" && (
                      <Button
                        size="icon"
                        variant="ghost"
                        className="h-8 w-8"
                        title="Edit activity"
                        onClick={() => setEditing({ noteId: row.id.replace(/^note-/, ""), date: row.date || "", body: row.notes || "" })}
                      >
                        <Pencil className="w-4 h-4" />
                      </Button>
                    )}
                    <AlertDialog>
                      <AlertDialogTrigger asChild>
                        <Button size="icon" variant="ghost" className="h-8 w-8 text-destructive hover:text-destructive" title="Remove from count">
                          <Trash2 className="w-4 h-4" />
                        </Button>
                      </AlertDialogTrigger>
                      <AlertDialogContent>
                        <AlertDialogHeader>
                          <AlertDialogTitle>Remove this {metricLabel.toLowerCase()} entry?</AlertDialogTitle>
                          <AlertDialogDescription>
                            {row.table === "events"
                              ? "This will set the event's guest count to 0 — the event itself stays."
                              : row.table === "customers"
                              ? "This will unset the skincare customer flag — the customer record stays."
                              : row.table === "team_consultants"
                              ? "Consultant records can't be removed from here."
                              : "This will permanently delete the activity record. Contact records are preserved."}
                          </AlertDialogDescription>
                        </AlertDialogHeader>
                        <AlertDialogFooter>
                          <AlertDialogCancel>Cancel</AlertDialogCancel>
                          <AlertDialogAction onClick={() => handleDelete(row)}>Remove</AlertDialogAction>
                        </AlertDialogFooter>
                      </AlertDialogContent>
                    </AlertDialog>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>

        <DialogFooter className="border-t border-border/50 pt-3 sm:justify-between">
          {canCleanup ? (
            <AlertDialog>
              <AlertDialogTrigger asChild>
                <Button variant="ghost" size="sm" className="text-muted-foreground gap-1.5">
                  <Sparkles className="w-3.5 h-3.5" /> Clean up test entries
                </Button>
              </AlertDialogTrigger>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>Clean up {metricLabel} test entries?</AlertDialogTitle>
                  <AlertDialogDescription>
                    Deletes all <b>{metricLabel}</b> activity records dated <b>{format(start, "MMM d")}</b> – <b>{format(end, "MMM d, yyyy")}</b>. Customers, leads, and events are <b>not</b> touched.
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel>Cancel</AlertDialogCancel>
                  <AlertDialogAction onClick={cleanupTestEntries}>Delete activity records</AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          ) : <span />}
          <Button variant="outline" onClick={() => onOpenChange(false)}>Close</Button>
        </DialogFooter>
      </DialogContent>

      {/* Edit activity dialog */}
      <Dialog open={!!editing} onOpenChange={(o) => { if (!o) setEditing(null); }}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Edit {metricLabel.toLowerCase()} entry</DialogTitle>
          </DialogHeader>
          {editing && (
            <div className="space-y-3">
              <div>
                <label className="text-xs font-medium text-muted-foreground mb-1 block">Date</label>
                <Input
                  type="date"
                  max={format(new Date(), "yyyy-MM-dd")}
                  value={editing.date}
                  onChange={(e) => setEditing({ ...editing, date: e.target.value })}
                  className="h-9"
                />
              </div>
              <div>
                <label className="text-xs font-medium text-muted-foreground mb-1 block">Notes</label>
                <Textarea
                  value={editing.body}
                  onChange={(e) => setEditing({ ...editing, body: e.target.value })}
                  className="min-h-[80px]"
                />
              </div>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditing(null)} disabled={savingEdit}>Cancel</Button>
            <Button onClick={saveEdit} disabled={savingEdit || !editing?.date}>
              {savingEdit ? "Saving..." : "Save"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Dialog>
  );
}

function noteRow(n: Note, customerById: Map<string, Customer>): Row {
  const cust = n.customer_id ? customerById.get(n.customer_id) : undefined;
  const personName = cust?.full_name || (n as any).person_name || "(unknown)";
  const href = cust?.id ? `/customers/${cust.id}` : (n.prospect_id ? `/prospects/${n.prospect_id}` : undefined);
  return {
    id: `note-${n.id}`,
    source: "Quick Add",
    date: n.note_date || "",
    personName,
    personId: n.customer_id || n.prospect_id || (n as any).person_id || null,
    personType: n.person_type || (n.customer_id ? "customer" : "prospect"),
    notes: n.note_body,
    table: "notes",
    href,
  };
}
