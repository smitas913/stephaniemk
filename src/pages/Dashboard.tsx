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
import MomentumScoreboard from "@/components/MomentumScoreboard";
// BusinessResetBanner removed — replaced by ClientCleanupCard on Today page.
import FinancialSnapshot from "@/components/FinancialSnapshot";

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


// ─── Quick Add ───
const QUICK_ADD_OPTIONS = [
  { key: "Face", label: "Face", emoji: "👤" },
  { key: "Booking Conversation", label: "Booking", emoji: "📅" },
] as const;

function QuickAddBar({ onLogged }: { onLogged: () => void }) {
  const navigate = useNavigate();
  const [openType, setOpenType] = useState<"Face" | "Booking Conversation" | null>(null);

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
        <CardContent className="grid grid-cols-2 sm:grid-cols-4 gap-2">
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
          <Button
            variant="outline"
            className="h-auto py-3 flex flex-col gap-1 hover:bg-primary/5 hover:border-primary/40"
            onClick={() => navigate("/events/new?type=Career%20Chat")}
            title="Career Chats are tracked as Events"
          >
            <span className="text-2xl">💬</span>
            <span className="text-xs font-semibold">Career Chat</span>
          </Button>
          <Button
            variant="outline"
            className="h-auto py-3 flex flex-col gap-1 hover:bg-primary/5 hover:border-primary/40"
            onClick={() => navigate("/orders/new")}
          >
            <span className="text-2xl">🛒</span>
            <span className="text-xs font-semibold">Order</span>
          </Button>
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
      booking_activity: metrics.bookingActivity,
      customer_followup: metrics.customerFollowUpDetails.length,
      client_followup: metrics.clientFollowUpDetails.length,
      hostess_coaching: metrics.hostessCoachingDetails.length,
      recruiting_followup: metrics.recruitingFollowUpDetails.length,
      consultant_coaching: metrics.coachingDetails.length,
      relationship: metrics.relationshipDetails.length,
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
      <div className="space-y-3">
        {/* HEADER — minimized */}
        <div className="flex items-center justify-between gap-3 px-1">
          <div className="flex items-center gap-2 min-w-0">
            <Sparkles className="w-3.5 h-3.5 text-primary shrink-0" />
            <p className="text-xs text-foreground italic truncate">"{dailyQuote}"</p>
            <span className="text-[11px] text-muted-foreground shrink-0 hidden sm:inline">· {weekLabel}</span>
          </div>
          <Button onClick={() => navigate("/follow-ups")} size="sm" variant="ghost" className="h-7 text-xs shrink-0">
            Today
            <ArrowRight className="w-3.5 h-3.5 ml-1" />
          </Button>
        </div>

        {/* 6 MOST IMPORTANT — compact 2-col grid */}
        <SixMostImportant
          compact
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

        {/* Client Cleanup moved to Today page (/follow-ups). */}

        {/* QUICK ADD */}
        <QuickAddBar onLogged={invalidateAll} />

        {/* WEEKLY + MONTHLY ACTUALS — side-by-side on desktop, stacked on mobile */}
        <MomentumScoreboard />

        {/* FINANCIAL SNAPSHOT */}
        <FinancialSnapshot range="mtd" compact />

      </div>
    </Layout>
  );
}
