import { useMemo } from "react";
import { useQuery, useQueryClient, useMutation } from "@tanstack/react-query";
import {
  startOfWeek,
  endOfWeek,
  startOfMonth,
  endOfMonth,
  parseISO,
  isWithinInterval,
} from "date-fns";
import { useNavigate } from "react-router-dom";
import Layout from "@/components/Layout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Progress } from "@/components/ui/progress";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Switch } from "@/components/ui/switch";
import {
  Sparkles,
  ArrowRight,
  Target,
  TrendingUp,
  Users,
  Calendar,
  MessageSquare,
  Pencil,
  Zap,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { toast } from "@/hooks/use-toast";
import {
  fetchMomentumGoals,
  updateMomentumGoal,
  fetchEvents,
  fetchAllLatestNotes,
  fetchCustomers,
  fetchProspects,
  fetchBookingLeads,
  fetchTeamConsultants,
  type MomentumGoal,
} from "@/lib/queries";
import type { EventRecord, Note, Customer } from "@/lib/types";
import QuickAddPersonDialog from "@/components/QuickAddPersonDialog";
import { useState } from "react";
import SixMostImportant from "@/components/SixMostImportant";
import { computeMetricsForDate } from "@/lib/focusMetrics";
import { toLocalDateKey } from "@/lib/dateOnly";
import UpcomingEventsCard from "@/components/dashboard/UpcomingEventsCard";

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
    case "booking_attempts":
      return notes.filter((n) => (n.is_booking_attempt || n.result_type === "Booking Conversation") && inRange(n.note_date, start, end)).length;
    case "appointments_held":
      return events.filter((e) => e.event_status === "Held" && inRange(e.event_date, start, end)).length;
    case "new_bookings":
      return events.filter((e) => inRange(e.created_at, start, end)).length;
    case "new_customers":
      return customers.filter((c) => inRange(c.created_at, start, end)).length;
    default:
      return 0;
  }
}

// ─── Goal Editor ───
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

// ─── Quick Add ───
const QUICK_ADD_OPTIONS = [
  { key: "Face", label: "Face", emoji: "👤" },
  { key: "Career Chat", label: "Career Chat", emoji: "💬" },
  { key: "Booking Conversation", label: "Booking", emoji: "📅" },
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

// ─── Main ───
export default function Dashboard() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  const { data: momentumGoals = [] } = useQuery({ queryKey: ["momentum-goals"], queryFn: fetchMomentumGoals });
  const { data: events = [] } = useQuery({ queryKey: ["events"], queryFn: fetchEvents });
  const { data: notes = [] } = useQuery({ queryKey: ["notes-all"], queryFn: fetchAllLatestNotes });
  const { data: customers = [] } = useQuery({ queryKey: ["customers"], queryFn: fetchCustomers });
  const { data: prospects = [] } = useQuery({ queryKey: ["prospects"], queryFn: fetchProspects });
  const { data: bookingLeads = [] } = useQuery({ queryKey: ["booking-leads"], queryFn: fetchBookingLeads });
  const { data: consultants = [] } = useQuery({ queryKey: ["team-consultants"], queryFn: fetchTeamConsultants });
  const { data: unifiedNotes = [] } = useQuery({ queryKey: ["unified-notes"], queryFn: fetchAllLatestNotes });

  // Auto counts for the 6 Most Important Things (computed for today)
  const focusAutoCounts = useMemo(() => {
    const todayKey = toLocalDateKey();
    const metrics = computeMetricsForDate(todayKey, {
      unifiedNotes, allNotes: notes, customers, prospects, bookingLeads, consultants, events,
    } as any);
    return {
      booking_attempts: metrics.bookingAttempts,
      customer_followup: metrics.customerFollowUpDetails.length,
      lead_followup: metrics.leadFollowUpDetails.length,
      client_followup: metrics.clientFollowUpDetails.length,
      hostess_coaching: metrics.hostessCoachingDetails.length,
      recruiting_followup: metrics.recruitingFollowUpDetails.length,
      consultant_coaching: metrics.coachingDetails.length,
      relationship: metrics.relationshipDetails.length,
      personal_appointments: 0,
    };
  }, [unifiedNotes, notes, customers, prospects, bookingLeads, consultants, events]);

  const updateMomentum = useMutation({
    mutationFn: ({ id, updates }: { id: string; updates: Partial<MomentumGoal> }) => updateMomentumGoal(id, updates),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["momentum-goals"] }); toast({ title: "Goal updated" }); },
    onError: (e) => toast({ title: "Failed to update", description: e instanceof Error ? e.message : "Unknown", variant: "destructive" }),
  });

  const now = new Date();
  const weekStart = startOfWeek(now, { weekStartsOn: 1 });
  const weekEnd = endOfWeek(now, { weekStartsOn: 1 });
  const monthStart = startOfMonth(now);
  const monthEnd = endOfMonth(now);

  const weekPace = useMemo(() => {
    const elapsed = Math.min(7, Math.max(1, Math.floor((now.getTime() - weekStart.getTime()) / 86400000) + 1));
    return elapsed / 7;
  }, [now, weekStart]);

  const dataBundle: ActualsBundle = { events, notes, customers };

  // Weekly scoreboard: faces, career_chats, booking_conversations
  const weeklyKeys = ["faces", "career_chats", "booking_conversations"];
  const weeklyScoreboard = weeklyKeys.map((key) => {
    const goal = momentumGoals.find((g) => g.metric_key === key && g.period === "weekly");
    const current = computeActuals(key, weekStart, weekEnd, dataBundle);
    return { key, goal, current };
  });

  // Monthly snapshot — lightweight count cards
  const monthlySnapshot = [
    { key: "faces", label: "Faces", icon: Users },
    { key: "career_chats", label: "Career Chats", icon: MessageSquare },
    { key: "new_bookings", label: "Bookings", icon: Calendar },
    { key: "new_customers", label: "New Customers", icon: TrendingUp },
  ].map((m) => ({ ...m, value: computeActuals(m.key, monthStart, monthEnd, dataBundle) }));

  const dailyQuote = getDailyQuote();
  const weekLabel = `${weekStart.toLocaleDateString(undefined, { month: "short", day: "numeric" })} – ${weekEnd.toLocaleDateString(undefined, { month: "short", day: "numeric" })}`;
  const monthLabel = monthStart.toLocaleDateString(undefined, { month: "long", year: "numeric" });

  const invalidateAll = () => {
    queryClient.invalidateQueries({ queryKey: ["notes-all"] });
    queryClient.invalidateQueries({ queryKey: ["customers"] });
    queryClient.invalidateQueries({ queryKey: ["events"] });
    queryClient.invalidateQueries({ queryKey: ["daily-focus-progress"] });
  };

  return (
    <Layout>
      <div className="space-y-5">
        {/* HEADER */}
        <Card className="border-primary/20 shadow-sm bg-gradient-to-br from-primary/10 via-primary/5 to-transparent">
          <CardContent className="p-5">
            <div className="flex flex-col sm:flex-row sm:items-start gap-4">
              <div className="flex-1 space-y-1 min-w-0">
                <div className="flex items-center gap-2 text-primary">
                  <Sparkles className="w-4 h-4" />
                  <span className="text-[11px] font-semibold uppercase tracking-wider">Dashboard</span>
                </div>
                <p className="text-base font-medium text-foreground italic">"{dailyQuote}"</p>
                <p className="text-xs text-muted-foreground">{weekLabel}</p>
              </div>
              <Button onClick={() => navigate("/follow-ups")} size="sm" variant="outline" className="text-xs shrink-0">
                Today's Action List
                <ArrowRight className="w-3.5 h-3.5 ml-1" />
              </Button>
            </div>
          </CardContent>
        </Card>

        {/* 6 MOST IMPORTANT — full editor (single source of truth) */}
        <SixMostImportant
          autoCounts={focusAutoCounts}
          rawData={{ unifiedNotes, allNotes: notes, customers, prospects, bookingLeads, consultants, events } as any}
          onDetailNavigate={(type, id) => {
            if (type === "Customer") navigate(`/customers/${id}`, { state: { from: "/dashboard" } });
            else if (type === "Prospect") navigate(`/prospects/${id}`, { state: { from: "/dashboard" } });
            else if (type === "Event") navigate(`/events/${id}`, { state: { from: "/dashboard" } });
            else if (type === "Lead") navigate("/booking-leads");
            else if (type === "Consultant") navigate("/leadership", { state: { from: "/dashboard", tab: "consultants", consultantId: id } });
            else if (type === "Hostess") {
              const evt = events.find((e: any) => e.id === id);
              if (evt) navigate(`/events/${(evt as any).event_id}`, { state: { from: "/dashboard" } });
              else navigate("/events");
            }
          }}
          suggestedDayType={events.some((e: any) => e.event_date === toLocalDateKey() && e.event_status === "Booked") ? "appointment" : null}
        />

        {/* QUICK ADD */}
        <QuickAddBar onLogged={invalidateAll} />

        {/* WEEKLY SCOREBOARD */}
        <Card className="border-border/50 shadow-sm">
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <Target className="w-5 h-5 text-primary" />
                <CardTitle className="text-base font-semibold text-foreground">Weekly Scoreboard</CardTitle>
              </div>
              <span className="text-xs text-muted-foreground">{weekLabel}</span>
            </div>
          </CardHeader>
          <CardContent className="space-y-4">
            {weeklyScoreboard.map((m) => {
              const goalVal = m.goal?.goal_value ?? 0;
              const pct = goalVal > 0 ? Math.min((m.current / goalVal) * 100, 100) : 0;
              const status = statusFor(m.current, goalVal, weekPace);
              const label = m.goal?.metric_label ??
                (m.key === "faces" ? "Faces" :
                  m.key === "career_chats" ? "Career Chats" : "Booking Attempts");
              return (
                <div key={m.key} className="space-y-1.5">
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-sm font-medium text-foreground">{label}</span>
                    <div className="flex items-center gap-1.5">
                      <span className={cn("text-base font-bold tabular-nums", STATUS_TEXT[status])}>
                        {m.current} <span className="text-muted-foreground font-normal text-xs">/ {goalVal}</span>
                      </span>
                      <span className="text-[11px] text-muted-foreground tabular-nums w-9 text-right">
                        {goalVal > 0 ? `${Math.round((m.current / goalVal) * 100)}%` : "—"}
                      </span>
                      {m.goal && (
                        <MomentumGoalEditor
                          goal={m.goal}
                          onSave={(u) => updateMomentum.mutate({ id: m.goal!.id, updates: u })}
                        />
                      )}
                    </div>
                  </div>
                  <Progress value={pct} className={cn("h-2", STATUS_BAR[status])} />
                </div>
              );
            })}
          </CardContent>
        </Card>

        {/* UPCOMING EVENTS */}
        <UpcomingEventsCard />

        {/* MONTHLY SNAPSHOT */}
        <Card className="border-border/50 shadow-sm">
          <CardHeader className="pb-3">
            <div className="flex items-center gap-2">
              <TrendingUp className="w-5 h-5 text-primary" />
              <CardTitle className="text-base font-semibold text-foreground">Monthly Snapshot</CardTitle>
              <span className="text-xs text-muted-foreground ml-auto">{monthLabel}</span>
            </div>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              {monthlySnapshot.map((m) => (
                <div key={m.key} className="rounded-lg border border-border/50 bg-muted/20 p-3">
                  <m.icon className="w-4 h-4 text-primary mb-1.5" />
                  <p className="text-2xl font-bold tracking-tight text-foreground tabular-nums">{m.value}</p>
                  <p className="text-[10px] font-semibold text-muted-foreground mt-1 uppercase tracking-wider">{m.label}</p>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      </div>
    </Layout>
  );
}
