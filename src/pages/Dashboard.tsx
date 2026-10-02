import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";import { startOfWeek, endOfWeek } from "date-fns";
import Layout from "@/components/Layout";
import { Sparkles } from "lucide-react";
import {
  fetchEvents,
  fetchAllLatestNotes,
  fetchCustomers,
  fetchProspects,
  
  fetchTeamConsultants,
} from "@/lib/queries";

import { computeMetricsForDate } from "@/lib/focusMetrics";
import { toLocalDateKey } from "@/lib/dateOnly";
import MomentumScoreboard from "@/components/MomentumScoreboard";


// BusinessResetBanner removed — replaced by ClientCleanupCard on Today page.
import FinancialSnapshot from "@/components/FinancialSnapshot";
import T6ReviewDialog from "@/components/T6ReviewDialog";

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


// ─── Main ───
export default function Dashboard() {


  
  const { data: events = [] } = useQuery({ queryKey: ["events"], queryFn: fetchEvents });
  const { data: notes = [] } = useQuery({ queryKey: ["notes-all"], queryFn: fetchAllLatestNotes });
  const { data: customers = [] } = useQuery({ queryKey: ["customers"], queryFn: fetchCustomers });
  const { data: prospects = [] } = useQuery({ queryKey: ["prospects"], queryFn: fetchProspects });
  const bookingLeads: any[] = [];
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
      bookings: metrics.bookings,
      sharing_personal: metrics.sharingPersonal,
      sharing_unit: metrics.sharingUnit,
      customer_followup: metrics.customerFollowUpDetails.length,
      client_followup: metrics.clientFollowUpDetails.length,
      hostess_coaching: metrics.hostessCoachingDetails.length,
      recruiting_followup: metrics.recruitingFollowUpDetails.length,
      consultant_coaching: metrics.coachingDetails.length,
      relationship: metrics.relationshipDetails.length,
    };
  }, [unifiedNotes, notes, customers, prospects, consultants, events]);

  const now = new Date();
  const weekStart = startOfWeek(now, { weekStartsOn: 1 });
  const weekEnd = endOfWeek(now, { weekStartsOn: 1 });

  const dailyQuote = getDailyQuote();
  const weekLabel = `${weekStart.toLocaleDateString(undefined, { month: "short", day: "numeric" })} – ${weekEnd.toLocaleDateString(undefined, { month: "short", day: "numeric" })}`;


  return (
    <Layout>
      <div className="space-y-3">
        {/* HEADER — minimized */}
        <div className="flex items-start justify-between gap-3 px-1">
          <div className="flex items-start gap-2 min-w-0 flex-1">
            <Sparkles className="w-3.5 h-3.5 text-primary shrink-0 mt-1" />
            <p className="text-sm font-semibold text-foreground italic whitespace-normal break-words text-wrap">"{dailyQuote}"</p>
            <span className="text-[11px] text-muted-foreground shrink-0 hidden sm:inline mt-1">· {weekLabel}</span>
          </div>
        </div>

        {/* WEEKLY + MONTHLY ACTUALS — side-by-side on desktop, stacked on mobile */}
        <MomentumScoreboard />

        {/* FINANCIAL SNAPSHOT */}
        <FinancialSnapshot range="mtd" compact />

        {/* Monthly T6 consultant review — pops once per calendar month */}
        <T6ReviewDialog auto />

      </div>
    </Layout>
  );
}
