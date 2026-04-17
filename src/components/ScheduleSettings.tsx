import { useState, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { fetchScheduleSettings, upsertScheduleSettings, fetchBlackoutDays, createBlackoutDay, deleteBlackoutDay, countOverdueFollowUps, resetOverdueFollowUps } from "@/lib/queries";
import { getHolidayList } from "@/lib/smartSchedule";
import { formatDateOnly } from "@/lib/dateOnly";
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

      {/* Smart Scheduling Card */}
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

          {/* Holidays */}
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
