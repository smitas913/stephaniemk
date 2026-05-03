import { useMemo, useState } from "react";
import { useQuery, useQueryClient, useMutation } from "@tanstack/react-query";
import { startOfWeek, endOfWeek, startOfMonth, endOfMonth, parseISO, isWithinInterval } from "date-fns";
import { useNavigate } from "react-router-dom";
import Layout from "@/components/Layout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Progress } from "@/components/ui/progress";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Switch } from "@/components/ui/switch";
import { Sparkles, ArrowRight, Target, TrendingUp, Users, Calendar, Phone, MessageSquare, Pencil, Crown, Zap } from "lucide-react";
import { cn } from "@/lib/utils";
import { toast } from "@/hooks/use-toast";
import {
  fetchMomentumGoals,
  updateMomentumGoal,
  fetchBusinessGoals,
  updateBusinessGoal,
  fetchEvents,
  fetchAllLatestNotes,
  fetchCustomers,
  
  type MomentumGoal,
  type BusinessGoal,
  type MomentumPeriod,
} from "@/lib/queries";
import { supabase } from "@/integrations/supabase/client";
import type { EventRecord, Note, Customer } from "@/lib/types";
import QuickAddPersonDialog from "@/components/QuickAddPersonDialog";

// ─── Quotes ───
const MOTIVATIONAL_QUOTES = [
  "Small daily actions compound into extraordinary results.",
  "You don't have to be great to start, but you have to start to be great.",
  "Consistency beats intensity, every single time.",
  "Progress, not perfection.",
  "Success is the sum of small efforts repeated day in and day out.",
  "Your future is created by what you do today, not tomorrow.",
  "Faces today become bookings tomorrow.",
  "Every conversation is a seed.",
];
function getDailyQuote(): string {
  const day = Math.floor(Date.now() / (1000 * 60 * 60 * 24));
  return MOTIVATIONAL_QUOTES[day % MOTIVATIONAL_QUOTES.length];
}

// ─── Helpers ───
function inRange(dateStr: string | null | undefined, start: Date, end: Date): boolean {
  if (!dateStr) return false;
  try {
    return isWithinInterval(parseISO(dateStr), { start, end });
  } catch {
    return false;
  }
}

function statusFor(current: number, goal: number, pace: number): "green" | "yellow" | "red" {
  if (goal <= 0) return "green";
  const pct = current / goal;
  if (pct >= 1) return "green";
  if (pct >= pace * 0.8) return "green";
  if (pct >= pace * 0.5) return "yellow";
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

interface ActualsBundle {
  events: EventRecord[];
  notes: Note[];
  customers: Customer[];
  consultantCount: number;
}

function computeActuals(
  metricKey: string,
  start: Date,
  end: Date,
  data: ActualsBundle,
): number {
  const { events, notes, customers } = data;
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
    case "coaching_touches":
      return notes.filter((n) => n.person_type === "consultant" && inRange(n.note_date, start, end)).length;
    case "relationship_touches":
      return notes.filter((n) => n.note_type !== "Skipped" && inRange(n.note_date, start, end)).length;
    case "booking_attempts":
      return notes.filter((n) => n.is_booking_attempt && inRange(n.note_date, start, end)).length;
    case "booking_activity": {
      // Any lead interaction OR any booking attempt — deduplicated by person.
      const seen = new Set<string>();
      let count = 0;
      for (const n of notes) {
        if (!inRange(n.note_date, start, end)) continue;
        const isLead = (n as any).person_type === "lead" || (n as any).entity_type === "Lead";
        if (!isLead && !n.is_booking_attempt) continue;
        const key = `${(n as any).person_type || (n as any).entity_type || "?"}:${(n as any).person_id || (n as any).id}`;
        if (seen.has(key)) continue;
        seen.add(key);
        count += 1;
      }
      return count;
    }
    default:
      return 0;
  }
}

// ─── Goal Editor Popovers ───
function MomentumGoalEditor({ goal, onSave }: { goal: MomentumGoal; onSave: (u: Partial<MomentumGoal>) => void }) {
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
        <Button size="sm" className="w-full h-8" onClick={() => {
          const n = parseInt(value, 10);
          onSave({ goal_value: Number.isFinite(n) && n >= 0 ? n : 0, is_visible: visible });
          setOpen(false);
        }}>Save</Button>
      </PopoverContent>
    </Popover>
  );
}

function BusinessGoalEditor({ goal, onSave }: { goal: BusinessGoal; onSave: (u: Partial<BusinessGoal>) => void }) {
  const [open, setOpen] = useState(false);
  const [goalVal, setGoalVal] = useState(String(goal.goal_value));
  const [actualVal, setActualVal] = useState(goal.manual_actual === null ? "" : String(goal.manual_actual));
  const isAuto = !!goal.auto_track_key;
  return (
    <Popover open={open} onOpenChange={(o) => { setOpen(o); if (o) { setGoalVal(String(goal.goal_value)); setActualVal(goal.manual_actual === null ? "" : String(goal.manual_actual)); } }}>
      <PopoverTrigger asChild>
        <Button variant="ghost" size="icon" className="h-6 w-6 text-muted-foreground hover:text-foreground" title="Edit goal">
          <Pencil className="w-3 h-3" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-64 p-3 space-y-3" align="end">
        <div className="space-y-1">
          <label className="text-xs font-medium text-foreground">Goal {goal.unit === "currency" ? "($)" : ""}</label>
          <Input type="number" min={0} value={goalVal} onChange={(e) => setGoalVal(e.target.value)} className="h-8" />
        </div>
        {!isAuto && (
          <div className="space-y-1">
            <label className="text-xs font-medium text-foreground">Actual {goal.unit === "currency" ? "($)" : ""}</label>
            <Input type="number" min={0} value={actualVal} onChange={(e) => setActualVal(e.target.value)} className="h-8" placeholder="(blank = 0)" />
          </div>
        )}
        {isAuto && (
          <p className="text-[11px] text-muted-foreground">Actual is auto-calculated from your active consultant roster.</p>
        )}
        <Button size="sm" className="w-full h-8" onClick={() => {
          const g = parseFloat(goalVal);
          const a = actualVal === "" ? null : parseFloat(actualVal);
          onSave({
            goal_value: Number.isFinite(g) && g >= 0 ? g : 0,
            manual_actual: a !== null && Number.isFinite(a) ? a : null,
          });
          setOpen(false);
        }}>Save</Button>
      </PopoverContent>
    </Popover>
  );
}

// ─── Quick Add ───
const QUICK_ADD_OPTIONS = [
  { key: "Face", label: "Face", icon: Users, emoji: "👤" },
  { key: "Career Chat", label: "Career Chat", icon: MessageSquare, emoji: "💬" },
  { key: "Booking Conversation", label: "Booking", icon: Calendar, emoji: "📅" },
] as const;

function QuickAddBar({ onLogged }: { onLogged: () => void }) {
  const [openType, setOpenType] = useState<"Face" | "Career Chat" | "Booking Conversation" | null>(null);

  return (
    <>
      <Card className="border-primary/20 shadow-sm">
        <CardHeader className="pb-2">
          <div className="flex items-center gap-2">
            <Zap className="w-4 h-4 text-primary" />
            <CardTitle className="text-sm font-semibold text-foreground">Quick Add</CardTitle>
            <span className="text-[11px] text-muted-foreground ml-auto">Tap to log</span>
          </div>
        </CardHeader>
        <CardContent className="grid grid-cols-3 gap-2">
          {QUICK_ADD_OPTIONS.map((opt) => (
            <Button
              key={opt.key}
              variant="outline"
              className="h-auto py-3 flex flex-col gap-1 hover:bg-primary/5 hover:border-primary/40"
              onClick={() => setOpenType(opt.key)}
            >
              <span className="text-2xl">{opt.emoji}</span>
              <span className="text-xs font-semibold">{opt.label}</span>
            </Button>
          ))}
        </CardContent>
      </Card>

      <QuickAddPersonDialog
        open={openType !== null}
        resultType={openType}
        onOpenChange={(v) => { if (!v) setOpenType(null); }}
        onLogged={onLogged}
      />
    </>
  );
}

// ─── Main Page ───
export default function Momentum() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [period, setPeriod] = useState<MomentumPeriod>("weekly");

  const { data: momentumGoals = [] } = useQuery({ queryKey: ["momentum-goals"], queryFn: fetchMomentumGoals });
  const { data: businessGoals = [] } = useQuery({ queryKey: ["business-goals"], queryFn: fetchBusinessGoals });
  const { data: events = [] } = useQuery({ queryKey: ["events"], queryFn: fetchEvents });
  const { data: notes = [] } = useQuery({ queryKey: ["notes-all"], queryFn: fetchAllLatestNotes });
  const { data: customers = [] } = useQuery({ queryKey: ["customers"], queryFn: fetchCustomers });
  const { data: consultantCount = 0 } = useQuery({
    queryKey: ["team-consultants-count"],
    queryFn: async () => {
      const { count, error } = await supabase
        .from("team_consultants")
        .select("id", { count: "exact", head: true })
        .eq("status", "Active");
      if (error) throw error;
      return count || 0;
    },
  });

  const updateMomentum = useMutation({
    mutationFn: ({ id, updates }: { id: string; updates: Partial<MomentumGoal> }) => updateMomentumGoal(id, updates),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["momentum-goals"] }); toast({ title: "Goal updated" }); },
    onError: (e) => toast({ title: "Failed to update", description: e instanceof Error ? e.message : "Unknown", variant: "destructive" }),
  });

  const updateBusiness = useMutation({
    mutationFn: ({ id, updates }: { id: string; updates: Partial<BusinessGoal> }) => updateBusinessGoal(id, updates),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["business-goals"] }); toast({ title: "Goal updated" }); },
    onError: (e) => toast({ title: "Failed to update", description: e instanceof Error ? e.message : "Unknown", variant: "destructive" }),
  });

  const now = new Date();
  const weekStart = startOfWeek(now, { weekStartsOn: 1 });
  const weekEnd = endOfWeek(now, { weekStartsOn: 1 });
  const monthStart = startOfMonth(now);
  const monthEnd = endOfMonth(now);

  const start = period === "weekly" ? weekStart : monthStart;
  const end = period === "weekly" ? weekEnd : monthEnd;

  const pace = useMemo(() => {
    if (period === "weekly") {
      const elapsed = Math.min(7, Math.max(1, Math.floor((now.getTime() - weekStart.getTime()) / 86400000) + 1));
      return elapsed / 7;
    }
    return now.getDate() / monthEnd.getDate();
  }, [period, now, weekStart, monthEnd]);

  const dataBundle: ActualsBundle = { events, notes, customers, consultantCount };

  // Header snapshot: faces + career chats for current period
  const facesGoalForPeriod = momentumGoals.find((g) => g.metric_key === "faces" && g.period === period);
  const chatsGoalForPeriod = momentumGoals.find((g) => g.metric_key === "career_chats" && g.period === period);
  const facesActual = computeActuals("faces", start, end, dataBundle);
  const chatsActual = computeActuals("career_chats", start, end, dataBundle);

  // Scoreboard metrics — order: faces, career_chats, booking_conversations, appointments_held
  const scoreboardKeys = ["faces", "career_chats", "booking_conversations", "appointments_held"];
  const scoreboardGoals = momentumGoals
    .filter((g) => g.period === period && g.is_visible && scoreboardKeys.includes(g.metric_key))
    .sort((a, b) => scoreboardKeys.indexOf(a.metric_key) - scoreboardKeys.indexOf(b.metric_key));

  // Monthly Results — aggregated count cards (always month-to-date)
  const monthlyResults = [
    { key: "faces", label: "Faces", icon: Users },
    { key: "career_chats", label: "Career Chats", icon: MessageSquare },
    { key: "new_bookings", label: "Bookings", icon: Calendar },
    { key: "appointments_held", label: "Appointments Held", icon: Calendar },
    { key: "follow_ups", label: "Follow-ups", icon: Phone },
  ].map((m) => ({ ...m, value: computeActuals(m.key, monthStart, monthEnd, dataBundle) }));

  // Activity support metrics for current period
  const supportMetrics = [
    { key: "follow_ups", label: "Follow-ups Completed", icon: Phone },
    { key: "booking_attempts", label: "Booking Attempts", icon: Calendar },
    { key: "coaching_touches", label: "Coaching Touches", icon: Crown },
    { key: "relationship_touches", label: "Relationship Touches", icon: Users },
  ].map((m) => ({ ...m, value: computeActuals(m.key, start, end, dataBundle) }));

  // Business growth goals for current period
  const growthGoals = businessGoals
    .filter((g) => g.period === period && g.is_visible)
    .sort((a, b) => a.sort_order - b.sort_order)
    .map((g) => {
      const actual = g.auto_track_key === "consultant_count" ? consultantCount : Number(g.manual_actual ?? 0);
      return { ...g, actual };
    });

  const dailyQuote = getDailyQuote();
  const periodLabel = period === "weekly"
    ? `${weekStart.toLocaleDateString(undefined, { month: "short", day: "numeric" })} – ${weekEnd.toLocaleDateString(undefined, { month: "short", day: "numeric" })}`
    : monthStart.toLocaleDateString(undefined, { month: "long", year: "numeric" });

  const fmt = (val: number, unit: string) => unit === "currency" ? `$${val.toLocaleString()}` : String(val);

  const invalidateAll = () => {
    queryClient.invalidateQueries({ queryKey: ["notes-all"] });
    queryClient.invalidateQueries({ queryKey: ["customers"] });
    queryClient.invalidateQueries({ queryKey: ["prospects"] });
    queryClient.invalidateQueries({ queryKey: ["booking-leads"] });
    queryClient.invalidateQueries({ queryKey: ["team-consultants"] });
  };

  return (
    <Layout>
      <div className="space-y-5">
        {/* HEADER */}
        <Card className="border-primary/20 shadow-sm bg-gradient-to-br from-primary/10 via-primary/5 to-transparent">
          <CardContent className="p-5 space-y-4">
            <div className="flex flex-col sm:flex-row sm:items-start gap-4">
              <div className="flex-1 space-y-1">
                <div className="flex items-center gap-2 text-primary">
                  <Sparkles className="w-4 h-4" />
                  <span className="text-[11px] font-semibold uppercase tracking-wider">Momentum</span>
                </div>
                <p className="text-base font-medium text-foreground italic">"{dailyQuote}"</p>
                <p className="text-xs text-muted-foreground">{periodLabel}</p>
              </div>
              <div className="flex flex-col gap-2 shrink-0">
                <div className="inline-flex rounded-lg border border-border bg-background p-0.5">
                  <button
                    className={cn("px-3 py-1 text-xs font-semibold rounded-md transition-colors", period === "weekly" ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground")}
                    onClick={() => setPeriod("weekly")}
                  >Week</button>
                  <button
                    className={cn("px-3 py-1 text-xs font-semibold rounded-md transition-colors", period === "monthly" ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground")}
                    onClick={() => setPeriod("monthly")}
                  >Month</button>
                </div>
                <Button onClick={() => navigate("/follow-ups")} size="sm" variant="outline" className="text-xs">
                  Today's Action List
                  <ArrowRight className="w-3.5 h-3.5 ml-1" />
                </Button>
              </div>
            </div>

            {/* Quick snapshot */}
            <div className="grid grid-cols-2 gap-3">
              <div className="rounded-lg bg-background/60 border border-border/50 p-3">
                <div className="flex items-center gap-1.5 text-muted-foreground">
                  <Users className="w-3.5 h-3.5" />
                  <span className="text-[10px] font-semibold uppercase tracking-wider">Faces</span>
                </div>
                <p className="text-2xl font-bold tracking-tight text-foreground mt-1">
                  {facesActual} <span className="text-base text-muted-foreground font-normal">/ {facesGoalForPeriod?.goal_value ?? 0}</span>
                </p>
              </div>
              <div className="rounded-lg bg-background/60 border border-border/50 p-3">
                <div className="flex items-center gap-1.5 text-muted-foreground">
                  <MessageSquare className="w-3.5 h-3.5" />
                  <span className="text-[10px] font-semibold uppercase tracking-wider">Career Chats</span>
                </div>
                <p className="text-2xl font-bold tracking-tight text-foreground mt-1">
                  {chatsActual} <span className="text-base text-muted-foreground font-normal">/ {chatsGoalForPeriod?.goal_value ?? 0}</span>
                </p>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* QUICK ADD */}
        <QuickAddBar onLogged={invalidateAll} />

        {/* SCOREBOARD */}
        <Card className="border-border/50 shadow-sm">
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <Target className="w-5 h-5 text-primary" />
                <CardTitle className="text-base font-semibold text-foreground">
                  {period === "weekly" ? "Weekly Scoreboard" : "Monthly Scoreboard"}
                </CardTitle>
              </div>
              <span className="text-xs text-muted-foreground">{periodLabel}</span>
            </div>
          </CardHeader>
          <CardContent className="space-y-4">
            {scoreboardGoals.length === 0 ? (
              <p className="text-sm text-muted-foreground">No metrics shown — adjust goals below.</p>
            ) : scoreboardGoals.map((g) => {
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
                      <MomentumGoalEditor goal={g} onSave={(u) => updateMomentum.mutate({ id: g.id, updates: u })} />
                    </div>
                  </div>
                  <Progress value={pct} className={cn("h-2", STATUS_BAR[status])} />
                </div>
              );
            })}
          </CardContent>
        </Card>

        {/* MONTHLY RESULTS */}
        <Card className="border-border/50 shadow-sm">
          <CardHeader className="pb-3">
            <div className="flex items-center gap-2">
              <TrendingUp className="w-5 h-5 text-primary" />
              <CardTitle className="text-base font-semibold text-foreground">Monthly Results</CardTitle>
              <span className="text-xs text-muted-foreground ml-auto">{monthStart.toLocaleDateString(undefined, { month: "long", year: "numeric" })}</span>
            </div>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
              {monthlyResults.map((m) => (
                <div key={m.key} className="rounded-lg border border-border/50 bg-muted/20 p-3">
                  <m.icon className="w-4 h-4 text-primary mb-1.5" />
                  <p className="text-2xl font-bold tracking-tight text-foreground tabular-nums">{m.value}</p>
                  <p className="text-[10px] font-semibold text-muted-foreground mt-1 uppercase tracking-wider">{m.label}</p>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>

        {/* BUSINESS GROWTH */}
        <Card className="border-border/50 shadow-sm">
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <Crown className="w-5 h-5 text-primary" />
                <CardTitle className="text-base font-semibold text-foreground">Business Growth</CardTitle>
              </div>
              <span className="text-xs text-muted-foreground">{periodLabel}</span>
            </div>
          </CardHeader>
          <CardContent className="space-y-4">
            {growthGoals.length === 0 ? (
              <p className="text-sm text-muted-foreground">No growth goals shown.</p>
            ) : growthGoals.map((g) => {
              const pct = g.goal_value > 0 ? Math.min((g.actual / g.goal_value) * 100, 100) : 0;
              const status = statusFor(g.actual, g.goal_value, pace);
              return (
                <div key={g.id} className="space-y-1.5">
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex items-center gap-1.5">
                      <span className="text-sm font-medium text-foreground">{g.metric_label}</span>
                      {g.auto_track_key && (
                        <span className="text-[9px] uppercase font-semibold text-primary/70 bg-primary/10 rounded px-1 py-0.5">Auto</span>
                      )}
                    </div>
                    <div className="flex items-center gap-1.5">
                      <span className={cn("text-base font-bold tabular-nums", STATUS_TEXT[status])}>
                        {fmt(g.actual, g.unit)} <span className="text-muted-foreground font-normal text-xs">/ {fmt(g.goal_value, g.unit)}</span>
                      </span>
                      <span className="text-[11px] text-muted-foreground tabular-nums w-9 text-right">
                        {g.goal_value > 0 ? `${Math.round((g.actual / g.goal_value) * 100)}%` : "—"}
                      </span>
                      <BusinessGoalEditor goal={g} onSave={(u) => updateBusiness.mutate({ id: g.id, updates: u })} />
                    </div>
                  </div>
                  <Progress value={pct} className={cn("h-2", STATUS_BAR[status])} />
                </div>
              );
            })}
          </CardContent>
        </Card>

        {/* ACTIVITY SUPPORT METRICS */}
        <Card className="border-border/30 shadow-none bg-muted/20">
          <CardHeader className="pb-3">
            <div className="flex items-center gap-2">
              <Phone className="w-4 h-4 text-muted-foreground" />
              <CardTitle className="text-sm font-semibold text-foreground">Activity Support Metrics</CardTitle>
              <span className="text-[11px] text-muted-foreground ml-auto">{periodLabel}</span>
            </div>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              {supportMetrics.map((m) => (
                <div key={m.key} className="flex items-center gap-3">
                  <m.icon className="w-4 h-4 shrink-0 text-muted-foreground" />
                  <div>
                    <p className="text-lg font-semibold text-foreground tabular-nums leading-tight">{m.value}</p>
                    <p className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider">{m.label}</p>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      </div>
    </Layout>
  );
}
