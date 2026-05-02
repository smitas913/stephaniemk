import { useState } from "react";
import { format, startOfWeek, endOfWeek, startOfMonth, endOfMonth } from "date-fns";
import { useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Checkbox } from "@/components/ui/checkbox";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from "@/components/ui/alert-dialog";
import { Trash2, CalendarIcon, AlertTriangle } from "lucide-react";
import { cn } from "@/lib/utils";
import { toast } from "@/hooks/use-toast";

const RESULT_TYPE_OPTIONS = [
  { key: "Face", label: "Faces" },
  { key: "Career Chat", label: "Career Chats" },
  { key: "Booking Conversation", label: "Booking Conversations" },
];

export default function ResetMomentumTestData() {
  const qc = useQueryClient();
  const now = new Date();
  const [rangeMode, setRangeMode] = useState<"week" | "month" | "custom">("week");
  const [customStart, setCustomStart] = useState<Date | undefined>(startOfWeek(now, { weekStartsOn: 1 }));
  const [customEnd, setCustomEnd] = useState<Date | undefined>(endOfWeek(now, { weekStartsOn: 1 }));
  const [selected, setSelected] = useState<Record<string, boolean>>({
    Face: true,
    "Career Chat": true,
    "Booking Conversation": true,
  });
  const [busy, setBusy] = useState(false);

  const getRange = () => {
    if (rangeMode === "week") return { start: startOfWeek(now, { weekStartsOn: 1 }), end: endOfWeek(now, { weekStartsOn: 1 }) };
    if (rangeMode === "month") return { start: startOfMonth(now), end: endOfMonth(now) };
    return { start: customStart ?? startOfWeek(now, { weekStartsOn: 1 }), end: customEnd ?? endOfWeek(now, { weekStartsOn: 1 }) };
  };

  const { start, end } = getRange();
  const types = Object.entries(selected).filter(([, v]) => v).map(([k]) => k);

  const handleReset = async () => {
    if (types.length === 0) {
      toast({ title: "Pick at least one type", variant: "destructive" });
      return;
    }
    setBusy(true);
    try {
      const startStr = format(start, "yyyy-MM-dd");
      const endStr = format(end, "yyyy-MM-dd");
      const { error, count } = await supabase
        .from("notes")
        .delete({ count: "exact" })
        .in("result_type", types)
        .gte("note_date", startStr)
        .lte("note_date", endStr);
      if (error) throw error;
      toast({
        title: "Test data cleared",
        description: `Removed ${count ?? 0} activity record${count === 1 ? "" : "s"} between ${format(start, "MMM d")} and ${format(end, "MMM d, yyyy")}. Customer & lead records preserved.`,
      });
      qc.invalidateQueries({ queryKey: ["notes-all"] });
      qc.invalidateQueries({ queryKey: ["notes"] });
    } catch (err) {
      toast({ title: "Reset failed", description: err instanceof Error ? err.message : "Unknown error", variant: "destructive" });
    } finally {
      setBusy(false);
    }
  };

  return (
    <Card className="border-destructive/30">
      <CardHeader className="pb-3">
        <CardTitle className="text-base flex items-center gap-2 text-foreground">
          <AlertTriangle className="w-4 h-4 text-destructive" />
          Reset Momentum Test Data
        </CardTitle>
        <p className="text-xs text-muted-foreground">
          Deletes activity records (Quick Add Faces, Career Chats, Booking Conversations) in the chosen date range.
          <b className="block mt-1 text-foreground">Customer, lead, consultant, event and order records are NEVER touched.</b>
        </p>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Range */}
        <div className="space-y-1.5">
          <label className="text-xs font-medium text-foreground">Date range</label>
          <div className="flex flex-wrap items-center gap-2">
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
          <p className="text-[11px] text-muted-foreground">
            Will affect records dated <b>{format(start, "MMM d, yyyy")}</b> – <b>{format(end, "MMM d, yyyy")}</b>
          </p>
        </div>

        {/* Types */}
        <div className="space-y-1.5">
          <label className="text-xs font-medium text-foreground">Record types</label>
          <div className="flex flex-col gap-2">
            {RESULT_TYPE_OPTIONS.map((opt) => (
              <label key={opt.key} className="flex items-center gap-2 text-sm text-foreground cursor-pointer">
                <Checkbox
                  checked={!!selected[opt.key]}
                  onCheckedChange={(c) => setSelected((s) => ({ ...s, [opt.key]: !!c }))}
                />
                {opt.label}
              </label>
            ))}
          </div>
        </div>

        <AlertDialog>
          <AlertDialogTrigger asChild>
            <Button variant="destructive" disabled={busy || types.length === 0} className="gap-1.5">
              <Trash2 className="w-4 h-4" /> Reset Test Data
            </Button>
          </AlertDialogTrigger>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Delete test activity records?</AlertDialogTitle>
              <AlertDialogDescription>
                This will permanently delete <b>{types.length}</b> type(s) of activity records dated{" "}
                <b>{format(start, "MMM d")}</b> – <b>{format(end, "MMM d, yyyy")}</b>.
                <br /><br />
                Customer, lead, consultant, event, and order records are <b>not</b> affected.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Cancel</AlertDialogCancel>
              <AlertDialogAction onClick={handleReset} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
                Yes, delete
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </CardContent>
    </Card>
  );
}
