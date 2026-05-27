import { useState, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { fetchScheduleSettings, upsertScheduleSettings, fetchBlackoutDays, createBlackoutDay, deleteBlackoutDay, countOverdueFollowUps, resetOverdueFollowUps } from "@/lib/queries";
import { getHolidayList } from "@/lib/smartSchedule";
import { formatDateOnly, toLocalDateKey } from "@/lib/dateOnly";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { CalendarOff, Palmtree, Zap, Plus, X, CalendarDays, RotateCcw, CheckCircle2 } from "lucide-react";
import { toast } from "sonner";

const DAY_LABELS = [
  { key: "workday_monday" as const, label: "Monday" },
  { key: "workday_tuesday" as const, label: "Tuesday" },
  { key: "workday_wednesday" as const, label: "Wednesday" },
  { key: "workday_thursday" as const, label: "Thursday" },
  { key: "workday_friday" as const, label: "Friday" },
  { key: "workday_saturday" as const, label: "Saturday" },
  { key: "workday_sunday" as const, label: "Sunday" },
];

export default function ScheduleSettings() {
  const queryClient = useQueryClient();
  const { data: settings } = useQuery({
    queryKey: ["schedule-settings"],
    queryFn: fetchScheduleSettings,
  });
  const { data: blackoutDays = [] } = useQuery({
    queryKey: ["blackout-days"],
    queryFn: fetchBlackoutDays,
  });

  const [oooStart, setOooStart] = useState("");
  const [oooEnd, setOooEnd] = useState("");
  const [lightMode, setLightMode] = useState(false);
  const [newBlackoutDate, setNewBlackoutDate] = useState("");
  const [newBlackoutLabel, setNewBlackoutLabel] = useState("");
  const [workdays, setWorkdays] = useState<Record<string, boolean>>({
    workday_monday: true,
    workday_tuesday: true,
    workday_wednesday: true,
    workday_thursday: true,
    workday_friday: true,
    workday_saturday: true,
    workday_sunday: true,
  });

  useEffect(() => {
    if (settings) {
      setOooStart(settings.ooo_start_date || "");
      setOooEnd(settings.ooo_end_date || "");
      setLightMode(settings.light_schedule_mode);
      setWorkdays({
        workday_monday: settings.workday_monday ?? true,
        workday_tuesday: settings.workday_tuesday ?? true,
        workday_wednesday: settings.workday_wednesday ?? true,
        workday_thursday: settings.workday_thursday ?? true,
        workday_friday: settings.workday_friday ?? true,
        workday_saturday: settings.workday_saturday ?? true,
        workday_sunday: settings.workday_sunday ?? true,
      });
    }
  }, [settings]);

  const saveMutation = useMutation({
    mutationFn: () =>
      upsertScheduleSettings({
        ooo_start_date: oooStart || null,
        ooo_end_date: oooEnd || null,
        light_schedule_mode: lightMode,
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["schedule-settings"] });
      toast.success("Schedule settings saved");
    },
    onError: () => toast.error("Failed to save settings"),
  });

  const clearOOO = useMutation({
    mutationFn: () =>
      upsertScheduleSettings({ ooo_start_date: null, ooo_end_date: null }),
    onSuccess: () => {
      setOooStart("");
      setOooEnd("");
      queryClient.invalidateQueries({ queryKey: ["schedule-settings"] });
      toast.success("Out of office cleared");
    },
  });

  const workdayMutation = useMutation({
    mutationFn: (updates: Record<string, boolean>) => upsertScheduleSettings(updates as any),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["schedule-settings"] });
      toast.success("Workday settings updated");
    },
    onError: () => toast.error("Failed to save workday settings"),
  });

  const toggleWorkday = (key: string, checked: boolean) => {
    const updated = { ...workdays, [key]: checked };
    // Prevent unchecking all days
    const anyChecked = Object.values(updated).some(Boolean);
    if (!anyChecked) {
      toast.error("At least one workday must be enabled");
      return;
    }
    setWorkdays(updated);
    workdayMutation.mutate({ [key]: checked });
  };

  const addBlackout = useMutation({
    mutationFn: () => createBlackoutDay(newBlackoutDate, newBlackoutLabel),
    onSuccess: () => {
      setNewBlackoutDate("");
      setNewBlackoutLabel("");
      queryClient.invalidateQueries({ queryKey: ["blackout-days"] });
      toast.success("Blackout day added");
    },
    onError: () => toast.error("Failed to add blackout day"),
  });

  const removeBlackout = useMutation({
    mutationFn: (id: string) => deleteBlackoutDay(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["blackout-days"] });
      toast.success("Blackout day removed");
    },
  });

  const currentYear = new Date().getFullYear();
  const holidays = getHolidayList(currentYear);
  const isOOOActive = oooStart && oooEnd;

  // ─── Reset Follow-Ups After Out of Office ───
  const today = new Date().toISOString().split("T")[0];
  // Cutoff: if OOO end is in the past, use it; else use today.
  const cutoffDate = settings?.ooo_end_date && settings.ooo_end_date < today
    ? settings.ooo_end_date
    : today;
  const [resetOpen, setResetOpen] = useState(false);
  const [resetMode, setResetMode] = useState<"today" | "clear" | null>(null);

  const { data: backlogCounts, refetch: refetchBacklog } = useQuery({
    queryKey: ["overdue-followups", cutoffDate],
    queryFn: () => countOverdueFollowUps(cutoffDate),
  });

  const resetMutation = useMutation({
    mutationFn: (mode: "today" | "clear") => resetOverdueFollowUps(cutoffDate, mode),
    onSuccess: (res, mode) => {
      const total = res.customers + res.prospects + res.booking_leads;
      toast.success(
        mode === "today"
          ? `Moved ${total} follow-up${total === 1 ? "" : "s"} to today`
          : `Cleared ${total} follow-up${total === 1 ? "" : "s"}`
      );
      setResetOpen(false);
      setResetMode(null);
      refetchBacklog();
      queryClient.invalidateQueries({ queryKey: ["follow-ups"] });
      queryClient.invalidateQueries({ queryKey: ["follow-up-queue"] });
      queryClient.invalidateQueries({ queryKey: ["customers"] });
      queryClient.invalidateQueries({ queryKey: ["prospects"] });
      queryClient.invalidateQueries({ queryKey: ["booking-leads"] });
    },
    onError: () => toast.error("Failed to reset follow-ups"),
  });

  const openReset = (mode: "today" | "clear") => {
    setResetMode(mode);
    setResetOpen(true);
  };

  return (
    <div className="space-y-4">
      {/* Workdays Card */}
      <Card className="border-border/50">
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2">
            <CalendarDays className="w-4 h-4 text-muted-foreground" />
            Workdays
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <p className="text-xs text-muted-foreground">
            Tasks and follow-ups will only be scheduled on checked days. If a date falls on an unchecked day, it moves to the next available workday.
          </p>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
            {DAY_LABELS.map(({ key, label }) => (
              <label key={key} className="flex items-center gap-2 cursor-pointer rounded-md border border-border/50 px-3 py-2 hover:bg-muted/30 transition-colors">
                <Checkbox
                  checked={workdays[key] ?? true}
                  onCheckedChange={(checked) => toggleWorkday(key, !!checked)}
                />
                <span className="text-sm">{label}</span>
              </label>
            ))}
          </div>
          <p className="text-[11px] text-muted-foreground">
            {Object.values(workdays).filter(Boolean).length} of 7 days active
          </p>
        </CardContent>
      </Card>

      {/* Daily Follow-Up Limits */}
      <DailyLimitsCard settings={settings} />


      <Card className="border-border/50">
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2">
            <CalendarOff className="w-4 h-4 text-muted-foreground" />
            Smart Scheduling
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* OOO Section */}
          <div className="space-y-2">
            <div className="flex items-center gap-2">
              <Palmtree className="w-4 h-4 text-primary" />
              <span className="text-sm font-medium">Out of Office</span>
              {isOOOActive && <Badge variant="secondary" className="text-xs">Active</Badge>}
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="text-xs text-muted-foreground">Start</label>
                <Input type="date" value={oooStart} onChange={(e) => setOooStart(e.target.value)} className="h-8 text-sm" />
              </div>
              <div>
                <label className="text-xs text-muted-foreground">End</label>
                <Input type="date" value={oooEnd} onChange={(e) => setOooEnd(e.target.value)} className="h-8 text-sm" />
              </div>
            </div>
            <div className="flex gap-2">
              <Button size="sm" className="h-7 text-xs" onClick={() => saveMutation.mutate()} disabled={saveMutation.isPending}>
                Save
              </Button>
              {isOOOActive && (
                <Button size="sm" variant="outline" className="h-7 text-xs" onClick={() => clearOOO.mutate()}>
                  Clear OOO
                </Button>
              )}
            </div>
          </div>

          {/* Light Schedule Mode */}
          <div className="flex items-center justify-between pt-2 border-t border-border/50">
            <div className="flex items-center gap-2">
              <Zap className="w-4 h-4 text-primary" />
              <div>
                <p className="text-sm font-medium">Light Schedule</p>
                <p className="text-xs text-muted-foreground">Reduce daily tasks during busy weeks</p>
              </div>
            </div>
            <Switch
              checked={lightMode}
              onCheckedChange={(checked) => {
                setLightMode(checked);
                upsertScheduleSettings({ light_schedule_mode: checked }).then(() => {
                  queryClient.invalidateQueries({ queryKey: ["schedule-settings"] });
                  toast.success(checked ? "Light schedule enabled" : "Light schedule disabled");
                });
              }}
            />
          </div>

          {/* Custom Blackout Days */}
          <div className="pt-2 border-t border-border/50 space-y-2">
            <p className="text-sm font-medium">Custom Blackout Days</p>
            <div className="flex gap-2">
              <Input
                type="date"
                value={newBlackoutDate}
                onChange={(e) => setNewBlackoutDate(e.target.value)}
                className="h-8 text-sm flex-1"
              />
              <Input
                placeholder="Label (optional)"
                value={newBlackoutLabel}
                onChange={(e) => setNewBlackoutLabel(e.target.value)}
                className="h-8 text-sm flex-1"
              />
              <Button
                size="sm"
                variant="outline"
                className="h-8 px-2"
                disabled={!newBlackoutDate || addBlackout.isPending}
                onClick={() => addBlackout.mutate()}
              >
                <Plus className="w-4 h-4" />
              </Button>
            </div>
            {blackoutDays.length > 0 && (
              <div className="space-y-1">
                {blackoutDays.map((bd) => (
                  <div key={bd.id} className="flex items-center justify-between bg-muted/50 rounded px-2 py-1">
                    <span className="text-xs">
                      {formatDateOnly(bd.blackout_date)}
                      {bd.label && <span className="text-muted-foreground ml-1">— {bd.label}</span>}
                    </span>
                    <button
                      onClick={() => removeBlackout.mutate(bd.id)}
                      className="text-muted-foreground hover:text-destructive"
                    >
                      <X className="w-3 h-3" />
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Reset Follow-Ups After OOO */}
          <div className="pt-2 border-t border-border/50 space-y-2">
            <div className="flex items-center gap-2">
              <RotateCcw className="w-4 h-4 text-primary" />
              <span className="text-sm font-medium">Reset Follow-Ups After Out of Office</span>
            </div>
            <p className="text-xs text-muted-foreground">
              Cleans backlog of follow-ups that became due on or before{" "}
              <span className="font-medium text-foreground">{formatDateOnly(cutoffDate)}</span>.
              Choose to bring them all forward to today, or clear them entirely.
            </p>
            <div className="flex items-center justify-between bg-muted/40 rounded px-2 py-1.5">
              <span className="text-xs text-muted-foreground">Backlog found</span>
              <Badge variant={backlogCounts && backlogCounts.total > 0 ? "secondary" : "outline"} className="text-xs">
                {backlogCounts?.total ?? 0} follow-up{(backlogCounts?.total ?? 0) === 1 ? "" : "s"}
              </Badge>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <Button
                size="sm"
                variant="outline"
                className="h-8 text-xs"
                disabled={!backlogCounts || backlogCounts.total === 0 || resetMutation.isPending}
                onClick={() => openReset("today")}
              >
                <CalendarDays className="w-3.5 h-3.5 mr-1" />
                Move to Today
              </Button>
              <Button
                size="sm"
                variant="outline"
                className="h-8 text-xs"
                disabled={!backlogCounts || backlogCounts.total === 0 || resetMutation.isPending}
                onClick={() => openReset("clear")}
              >
                <CheckCircle2 className="w-3.5 h-3.5 mr-1" />
                Clear All
              </Button>
            </div>
          </div>

          <AlertDialog open={resetOpen} onOpenChange={setResetOpen}>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>
                  {resetMode === "today" ? "Move all to today?" : "Clear all follow-ups?"}
                </AlertDialogTitle>
                <AlertDialogDescription>
                  This will affect <span className="font-medium">{backlogCounts?.total ?? 0}</span> overdue follow-up
                  {(backlogCounts?.total ?? 0) === 1 ? "" : "s"}
                  {backlogCounts && backlogCounts.total > 0 && (
                    <>
                      {" "}({backlogCounts.customers} customer{backlogCounts.customers === 1 ? "" : "s"},{" "}
                      {backlogCounts.prospects} prospect{backlogCounts.prospects === 1 ? "" : "s"},{" "}
                      {backlogCounts.booking_leads} lead{backlogCounts.booking_leads === 1 ? "" : "s"})
                    </>
                  )}
                  . {resetMode === "today"
                    ? "Their next follow-up date will be set to today."
                    : "Their next follow-up date will be cleared (no follow-up needed)."}
                  {" "}No new activities or overdue counts will be created.
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>Cancel</AlertDialogCancel>
                <AlertDialogAction
                  onClick={() => resetMode && resetMutation.mutate(resetMode)}
                  disabled={resetMutation.isPending}
                >
                  {resetMutation.isPending ? "Resetting..." : "Confirm"}
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>

          <div className="pt-2 border-t border-border/50">
            <p className="text-xs font-medium text-muted-foreground mb-1">
              Auto-calculated holidays ({currentYear})
            </p>
            <div className="flex flex-wrap gap-1">
              {holidays.map((h) => (
                <Badge key={h.date} variant="outline" className="text-xs font-normal">
                  {h.name}
                </Badge>
              ))}
            </div>
            <p className="text-xs text-muted-foreground mt-1">
              Holidays update automatically each year
            </p>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

function DailyLimitsCard({ settings }: { settings: any }) {
  const queryClient = useQueryClient();
  const [customerLimit, setCustomerLimit] = useState<string>("10");
  const [leadLimit, setLeadLimit] = useState<string>("10");

  useEffect(() => {
    if (settings) {
      setCustomerLimit(String(settings.daily_customer_followup_limit ?? 10));
      setLeadLimit(String(settings.daily_lead_followup_limit ?? 10));
    }
  }, [settings]);

  const saveLimits = useMutation({
    mutationFn: () => {
      const c = Math.max(1, Math.min(200, parseInt(customerLimit, 10) || 10));
      const l = Math.max(1, Math.min(200, parseInt(leadLimit, 10) || 10));
      return upsertScheduleSettings({
        daily_customer_followup_limit: c,
        daily_lead_followup_limit: l,
      } as any);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["schedule-settings"] });
      toast.success("Daily limits saved");
    },
    onError: () => toast.error("Failed to save daily limits"),
  });

  return (
    <Card className="border-border/50">
      <CardHeader className="pb-3">
        <CardTitle className="text-base flex items-center gap-2">
          <CalendarDays className="w-4 h-4 text-muted-foreground" />
          Daily Follow-Up Limits
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        <p className="text-xs text-muted-foreground">
          Cap how many follow-ups appear in Today for each category. Anything over the limit is automatically pushed to upcoming workdays. Customer Follow-Ups and Booking Activity are counted independently.
        </p>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="text-xs text-muted-foreground">Customer Follow-Ups / day</label>
            <Input
              type="number"
              min={1}
              max={200}
              value={customerLimit}
              onChange={(e) => setCustomerLimit(e.target.value)}
              className="h-8 text-sm"
            />
          </div>
          <div>
            <label className="text-xs text-muted-foreground">Booking Activity / day</label>
            <Input
              type="number"
              min={1}
              max={200}
              value={leadLimit}
              onChange={(e) => setLeadLimit(e.target.value)}
              className="h-8 text-sm"
            />
          </div>
        </div>
        <div>
          <Button size="sm" className="h-7 text-xs" onClick={() => saveLimits.mutate()} disabled={saveLimits.isPending}>
            Save Limits
          </Button>
        </div>
        <p className="text-[11px] text-muted-foreground">
          Event Tasks, Coaching, Recruiting, and Birthdays are not limited.
        </p>
      </CardContent>
    </Card>
  );
}

