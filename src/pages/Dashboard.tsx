import { useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { startOfWeek, endOfWeek } from "date-fns";
import { useNavigate } from "react-router-dom";
import Layout from "@/components/Layout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Sparkles, ArrowRight, Zap } from "lucide-react";
import {
  fetchEvents,
  fetchAllLatestNotes,
  fetchCustomers,
  fetchProspects,
  fetchBookingLeads,
  fetchTeamConsultants,
} from "@/lib/queries";
import QuickAddPersonDialog from "@/components/QuickAddPersonDialog";
import SixMostImportant from "@/components/SixMostImportant";
import { computeMetricsForDate } from "@/lib/focusMetrics";
import { toLocalDateKey } from "@/lib/dateOnly";
import UpcomingEventsCard from "@/components/dashboard/UpcomingEventsCard";
import MomentumScoreboard from "@/components/MomentumScoreboard";

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

  const now = new Date();
  const weekStart = startOfWeek(now, { weekStartsOn: 1 });
  const weekEnd = endOfWeek(now, { weekStartsOn: 1 });

  const dailyQuote = getDailyQuote();
  const weekLabel = `${weekStart.toLocaleDateString(undefined, { month: "short", day: "numeric" })} – ${weekEnd.toLocaleDateString(undefined, { month: "short", day: "numeric" })}`;

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

        {/* WEEKLY + MONTHLY ACTUALS vs GOALS — single source of truth */}
        <MomentumScoreboard />

        {/* UPCOMING EVENTS */}
        <UpcomingEventsCard />
      </div>
    </Layout>
  );
}
