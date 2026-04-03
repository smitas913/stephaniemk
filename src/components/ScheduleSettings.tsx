import { useState, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { fetchScheduleSettings, upsertScheduleSettings } from "@/lib/queries";
import { getHolidayList } from "@/lib/smartSchedule";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { CalendarOff, Palmtree, Zap } from "lucide-react";
import { toast } from "sonner";

export default function ScheduleSettings() {
  const queryClient = useQueryClient();
  const { data: settings } = useQuery({
    queryKey: ["schedule-settings"],
    queryFn: fetchScheduleSettings,
  });

  const [oooStart, setOooStart] = useState("");
  const [oooEnd, setOooEnd] = useState("");
  const [lightMode, setLightMode] = useState(false);

  useEffect(() => {
    if (settings) {
      setOooStart(settings.ooo_start_date || "");
      setOooEnd(settings.ooo_end_date || "");
      setLightMode(settings.light_schedule_mode);
    }
  }, [settings]);

  const mutation = useMutation({
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
      upsertScheduleSettings({
        ooo_start_date: null,
        ooo_end_date: null,
      }),
    onSuccess: () => {
      setOooStart("");
      setOooEnd("");
      queryClient.invalidateQueries({ queryKey: ["schedule-settings"] });
      toast.success("Out of office cleared");
    },
  });

  const currentYear = new Date().getFullYear();
  const holidays = getHolidayList(currentYear);

  const isOOOActive = oooStart && oooEnd;

  return (
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
              <Input
                type="date"
                value={oooStart}
                onChange={(e) => setOooStart(e.target.value)}
                className="h-8 text-sm"
              />
            </div>
            <div>
              <label className="text-xs text-muted-foreground">End</label>
              <Input
                type="date"
                value={oooEnd}
                onChange={(e) => setOooEnd(e.target.value)}
                className="h-8 text-sm"
              />
            </div>
          </div>
          <div className="flex gap-2">
            <Button size="sm" className="h-7 text-xs" onClick={() => mutation.mutate()} disabled={mutation.isPending}>
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
            <Zap className="w-4 h-4 text-amber-500" />
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

        {/* Holidays */}
        <div className="pt-2 border-t border-border/50">
          <p className="text-xs font-medium text-muted-foreground mb-1">
            Holidays excluded ({currentYear})
          </p>
          <div className="flex flex-wrap gap-1">
            {holidays.map((h) => (
              <Badge key={h.date} variant="outline" className="text-xs font-normal">
                {h.name}
              </Badge>
            ))}
          </div>
          <p className="text-xs text-muted-foreground mt-1">
            Sundays are also excluded from scheduling
          </p>
        </div>
      </CardContent>
    </Card>
  );
}
