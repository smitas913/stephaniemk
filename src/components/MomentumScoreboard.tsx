import { useMemo } from "react";
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
import { Pencil, Target } from "lucide-react";
import { cn } from "@/lib/utils";
import { toast } from "@/hooks/use-toast";
import type { EventRecord, Note, Customer, Prospect } from "@/lib/types";

interface TeamConsultantRow { id: string; created_at: string; relationship_type: string | null }

async function fetchTeamConsultantsLite(): Promise<TeamConsultantRow[]> {
  const { data, error } = await supabase.from("team_consultants").select("id, created_at, relationship_type" as any);
  if (error) throw error;
  return ((data || []) as unknown) as TeamConsultantRow[];
}

// Only the four core dashboard metrics are supported.
const ALLOWED_METRIC_KEYS = new Set([
  "faces",
  "career_chats",
  "new_team_members",
  "new_skincare_customers",
]);

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
    case "new_team_members":
      // Personal recruits only (defaults to Personal Recruit when null/legacy)
      return consultants.filter((c) => {
        const rt = c.relationship_type ?? 'Personal Recruit';
        return rt === 'Personal Recruit' && inRange(c.created_at, start, end);
      }).length;
    case "new_skincare_customers":
      return customers.filter((c) => inRange((c as any).skincare_started_at, start, end)).length;
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
  const [open, setOpen] = (require("react") as typeof import("react")).useState(false) as any;
  // Use proper hooks
  return <GoalEditorInner goal={goal} onSave={onSave} />;
}

function GoalEditorInner({ goal, onSave }: { goal: MomentumGoal; onSave: (updates: Partial<MomentumGoal>) => void }) {
  const React = require("react") as typeof import("react");
  const [open, setOpen] = React.useState(false);
  const [value, setValue] = React.useState(String(goal.goal_value));

  return (
    <Popover open={open} onOpenChange={(o) => { setOpen(o); if (o) { setValue(String(goal.goal_value)); } }}>
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
        <Button
          size="sm"
          className="w-full h-8"
          onClick={() => {
            const n = parseInt(value, 10);
            onSave({ goal_value: Number.isFinite(n) && n >= 0 ? n : 0 });
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
      .filter((g) => g.period === period && ALLOWED_METRIC_KEYS.has(g.metric_key))
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
            <p className="text-sm text-muted-foreground py-2">No metrics configured.</p>
          ) : (
            sectionGoals.map((g) => {
              const current = computeActuals(g.metric_key, start, end, dataBundle);
              const pct = g.goal_value > 0 ? Math.min((current / g.goal_value) * 100, 100) : 0;
              const status = statusFor(current, g.goal_value, pace);
              return (
                <div key={g.id} className="space-y-1.5">
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-sm font-medium text-foreground">{g.metric_label}</span>
                    <div className="flex items-center gap-1.5">
                      <span className={cn("text-base font-bold tabular-nums", STATUS_TEXT[status])}>
                        {current} <span className="text-muted-foreground font-normal text-xs">/ {g.goal_value}</span>
                      </span>
                      <span className="text-[11px] text-muted-foreground tabular-nums w-9 text-right">
                        {g.goal_value > 0 ? `${Math.round((current / g.goal_value) * 100)}%` : "—"}
                      </span>
                      <GoalEditorInner goal={g} onSave={(updates) => updateMutation.mutate({ id: g.id, updates })} />
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
    </div>
  );
}
