import { useMemo, useState } from "react";
import { useQuery, useQueryClient, useMutation } from "@tanstack/react-query";
import { startOfWeek, endOfWeek, startOfMonth, endOfMonth, parseISO, isWithinInterval } from "date-fns";
import { supabase } from "@/integrations/supabase/client";
import {
  fetchMomentumGoals,
  fetchEvents,
  fetchAllLatestNotes,
  fetchCustomers,
  fetchProspects,
  type MomentumGoal,
  type MomentumPeriod,
  updateMomentumGoal,
} from "@/lib/queries";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Switch } from "@/components/ui/switch";
import { Pencil, Target, Eye, EyeOff } from "lucide-react";
import { cn } from "@/lib/utils";
import { toast } from "@/hooks/use-toast";
import type { EventRecord, Note, Customer, Prospect } from "@/lib/types";

interface TeamConsultantRow { id: string; created_at: string }

async function fetchTeamConsultantsLite(): Promise<TeamConsultantRow[]> {
  const { data, error } = await supabase.from("team_consultants").select("id, created_at");
  if (error) throw error;
  return (data || []) as TeamConsultantRow[];
}

function inRange(dateStr: string | null | undefined, start: Date, end: Date): boolean {
  if (!dateStr) return false;
  try {
    const d = parseISO(dateStr);
    return isWithinInterval(d, { start, end });
  } catch {
    return false;
  }
}

function computeActuals(
  metricKey: string,
  start: Date,
  end: Date,
  data: { events: EventRecord[]; notes: Note[]; customers: Customer[]; prospects: Prospect[]; consultants: TeamConsultantRow[] },
): number {
  const { events, notes, customers, consultants } = data;
  switch (metricKey) {
    case "faces":
      return events
        .filter((e) => e.event_status === "Held" && inRange(e.event_date, start, end))
        .reduce((s, e) => s + Number(e.guest_count || 0), 0);
    case "career_chats":
      return notes.filter((n) => n.result_type === "Career Chat" && inRange(n.note_date, start, end)).length;
    case "booking_conversations":
      return notes.filter((n) => (n.is_booking_attempt || n.result_type === "Booking Conversation") && inRange(n.note_date, start, end)).length;
    case "appointments_held":
      return events.filter((e) => e.event_status === "Held" && inRange(e.event_date, start, end)).length;
    case "new_bookings":
      return events.filter((e) => inRange(e.created_at, start, end)).length;
    case "follow_ups":
      return notes.filter((n) => n.note_type !== "Skipped" && n.note_type !== "No Follow-Up Needed" && inRange(n.note_date, start, end)).length;
    case "new_customers":
      return customers.filter((c) => inRange(c.created_at, start, end)).length;
    case "new_team_members":
      return consultants.filter((c) => inRange(c.created_at, start, end)).length;
    case "new_skincare_customers":
      return customers.filter((c) => inRange((c as any).skincare_started_at, start, end)).length;
    case "active_skincare_customers":
      return customers.filter((c) => (c as any).is_skincare_customer === true).length;
    default:
      return 0;
  }
}

function statusFor(current: number, goal: number, pace: number): "green" | "yellow" | "red" {
  if (goal <= 0) return "green";
  const pct = current / goal;
  if (pct >= 1) return "green";
  const expected = pace;
  if (pct >= expected * 0.8) return "green";
  if (pct >= expected * 0.5) return "yellow";
  return "red";
}

const STATUS_TEXT = {
  green: "text-green-600",
  yellow: "text-yellow-600",
  red: "text-red-600",
} as const;

const STATUS_BAR = {
  green: "[&>div]:bg-green-500",
  yellow: "[&>div]:bg-yellow-500",
  red: "[&>div]:bg-red-500",
} as const;

function GoalEditor({ goal, onSave }: { goal: MomentumGoal; onSave: (updates: Partial<MomentumGoal>) => void }) {
  const [open, setOpen] = useState(false);
  const [value, setValue] = useState(String(goal.goal_value));
  const [visible, setVisible] = useState(goal.is_visible);

  return (
    <Popover open={open} onOpenChange={(o) => { setOpen(o); if (o) { setValue(String(goal.goal_value)); setVisible(goal.is_visible); } }}>
      <PopoverTrigger asChild>
        <Button variant="ghost" size="icon" className="h-6 w-6 text-muted-foreground hover:text-foreground" title="Edit goal">
          <Pencil className="w-3 h-3" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-56 p-3 space-y-3" align="end">
        <div className="space-y-1">
          <label className="text-xs font-medium text-foreground">Goal value</label>
          <Input type="number" min={0} value={value} onChange={(e) => setValue(e.target.value)} className="h-8" />
        </div>
        <div className="flex items-center justify-between">
          <span className="text-xs text-muted-foreground">Show on dashboard</span>
          <Switch checked={visible} onCheckedChange={setVisible} />
        </div>
        <Button
          size="sm"
          className="w-full h-8"
          onClick={() => {
            const n = parseInt(value, 10);
            onSave({ goal_value: Number.isFinite(n) && n >= 0 ? n : 0, is_visible: visible });
            setOpen(false);
          }}
        >
          Save
        </Button>
      </PopoverContent>
    </Popover>
  );
}

export default function MomentumScoreboard({ only }: { only?: "weekly" | "monthly" } = {}) {
  const queryClient = useQueryClient();
  const [showHidden, setShowHidden] = useState(false);

  const { data: goals = [] } = useQuery({ queryKey: ["momentum-goals"], queryFn: fetchMomentumGoals });
  const { data: events = [] } = useQuery({ queryKey: ["events"], queryFn: fetchEvents });
  const { data: notes = [] } = useQuery({ queryKey: ["notes-all"], queryFn: fetchAllLatestNotes });
  const { data: customers = [] } = useQuery({ queryKey: ["customers"], queryFn: fetchCustomers });
  const { data: prospects = [] } = useQuery({ queryKey: ["prospects"], queryFn: fetchProspects });
  const { data: consultants = [] } = useQuery({ queryKey: ["team-consultants-lite"], queryFn: fetchTeamConsultantsLite });

  const updateMutation = useMutation({
    mutationFn: ({ id, updates }: { id: string; updates: Partial<MomentumGoal> }) => updateMomentumGoal(id, updates),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["momentum-goals"] });
      toast({ title: "Goal updated" });
    },
    onError: (err) => toast({ title: "Failed to update goal", description: err instanceof Error ? err.message : "Unknown error", variant: "destructive" }),
  });

  const now = new Date();
  const weekStart = startOfWeek(now, { weekStartsOn: 1 });
  const weekEnd = endOfWeek(now, { weekStartsOn: 1 });
  const monthStart = startOfMonth(now);
  const monthEnd = endOfMonth(now);

  const weekPace = useMemo(() => {
    const totalDays = 7;
    const elapsed = Math.min(totalDays, Math.max(1, Math.floor((now.getTime() - weekStart.getTime()) / (1000 * 60 * 60 * 24)) + 1));
    return elapsed / totalDays;
  }, [now, weekStart]);

  const monthPace = useMemo(() => {
    const total = monthEnd.getDate();
    return now.getDate() / total;
  }, [now, monthEnd]);

  const dataBundle = { events, notes, customers, prospects, consultants };

  const renderSection = (period: MomentumPeriod, title: string, subtitle: string, start: Date, end: Date, pace: number) => {
    const sectionGoals = goals
      .filter((g) => g.period === period && (showHidden || g.is_visible))
      .sort((a, b) => a.sort_order - b.sort_order);

    return (
      <Card className="border-border/50 shadow-sm">
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <Target className="w-5 h-5 text-primary" />
              <CardTitle className="text-base font-semibold text-foreground">{title}</CardTitle>
            </div>
            <span className="text-xs text-muted-foreground">{subtitle}</span>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          {sectionGoals.length === 0 ? (
            <p className="text-sm text-muted-foreground py-2">No metrics shown — toggle hidden goals below to manage.</p>
          ) : (
            sectionGoals.map((g) => {
              const current = computeActuals(g.metric_key, start, end, dataBundle);
              const pct = g.goal_value > 0 ? Math.min((current / g.goal_value) * 100, 100) : 0;
              const status = statusFor(current, g.goal_value, pace);
              return (
                <div key={g.id} className={cn("space-y-1.5", !g.is_visible && "opacity-50")}>
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex items-center gap-1.5">
                      <span className="text-sm font-medium text-foreground">{g.metric_label}</span>
                      {!g.is_visible && <EyeOff className="w-3 h-3 text-muted-foreground" />}
                    </div>
                    <div className="flex items-center gap-1.5">
                      <span className={cn("text-base font-bold tabular-nums", STATUS_TEXT[status])}>
                        {current} <span className="text-muted-foreground font-normal text-xs">/ {g.goal_value}</span>
                      </span>
                      <span className="text-[11px] text-muted-foreground tabular-nums w-9 text-right">
                        {g.goal_value > 0 ? `${Math.round((current / g.goal_value) * 100)}%` : "—"}
                      </span>
                      <GoalEditor goal={g} onSave={(updates) => updateMutation.mutate({ id: g.id, updates })} />
                    </div>
                  </div>
                  <Progress value={pct} className={cn("h-2", STATUS_BAR[status])} />
                </div>
              );
            })
          )}
        </CardContent>
      </Card>
    );
  };

  const showWeekly = only !== "monthly";
  const showMonthly = only !== "weekly";

  return (
    <div className="space-y-4">
      <div className={cn("grid grid-cols-1 gap-4", showWeekly && showMonthly && "md:grid-cols-2")}>
        {showWeekly && renderSection("weekly", "Weekly Actuals", `${weekStart.toLocaleDateString(undefined, { month: "short", day: "numeric" })} – ${weekEnd.toLocaleDateString(undefined, { month: "short", day: "numeric" })}`, weekStart, weekEnd, weekPace)}
        {showMonthly && renderSection("monthly", "Monthly Actuals", monthStart.toLocaleDateString(undefined, { month: "long", year: "numeric" }), monthStart, monthEnd, monthPace)}
      </div>
      <div className="flex items-center justify-end">
        <Button variant="ghost" size="sm" className="h-7 text-xs text-muted-foreground" onClick={() => setShowHidden((s) => !s)}>
          {showHidden ? <EyeOff className="w-3.5 h-3.5 mr-1" /> : <Eye className="w-3.5 h-3.5 mr-1" />}
          {showHidden ? "Hide hidden goals" : "Manage hidden goals"}
        </Button>
      </div>
    </div>
  );
}
