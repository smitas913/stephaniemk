import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { fetchEvents, fetchProspects } from "@/lib/queries";
import type { EventRecord, Prospect } from "@/lib/types";
import Layout from "@/components/Layout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Progress } from "@/components/ui/progress";
import { Target } from "lucide-react";
import { cn } from "@/lib/utils";
import { parseISO, isWithinInterval, startOfWeek, endOfWeek, startOfMonth, endOfMonth, differenceInDays } from "date-fns";

type ScoreItem = {
  label: string;
  current: number;
  goal: number;
  pct: number;
  status: "green" | "yellow" | "red";
};

type ConversionItem = {
  label: string;
  numerator: number;
  denominator: number;
  pct: number;
};


function useScoreboard(events: EventRecord[], prospects: Prospect[]) {
  return useMemo(() => {
    const now = new Date();
    const weekStart = startOfWeek(now, { weekStartsOn: 1 });
    const weekEnd = endOfWeek(now, { weekStartsOn: 1 });
    const monthStart = startOfMonth(now);
    const monthEnd = endOfMonth(now);

    const inRange = (dateStr: string | null, s: Date, e: Date) => {
      if (!dateStr) return false;
      return isWithinInterval(parseISO(dateStr), { start: s, end: e });
    };

    const heldEvents = events.filter((e) => e.event_status === "Held");
    const weekEvents = heldEvents.filter((e) => inRange(e.event_date, weekStart, weekEnd));
    const monthEvents = heldEvents.filter((e) => inRange(e.event_date, monthStart, monthEnd));

    // Event status counts for the month
    const monthAllEvents = events.filter((e) => inRange(e.event_date, monthStart, monthEnd));
    const monthBooked = monthAllEvents.length;
    const monthHeld = monthAllEvents.filter((e) => e.event_status === "Held").length;
    const monthCancelled = monthAllEvents.filter((e) => e.event_status === "Cancelled").length;
    const monthHoldRate = monthBooked > 0 ? Math.round((monthHeld / monthBooked) * 1000) / 10 : 0;

    const weekPartyFacial = weekEvents.filter((e) => e.event_type === "Party" || e.event_type === "Facial");
    const weekFaces = weekPartyFacial.reduce((s, e) => s + Number(e.guest_count || 0), 0);
    const weekParties = weekEvents.filter((e) => e.event_type === "Party").length;
    const weekSharing = weekEvents.reduce((s, e) => s + Number(e.sharing_appointments_count || 0), 0);

    const monthParties = monthEvents.filter((e) => e.event_type === "Party").length;
    const monthPartyFacial = monthEvents.filter((e) => e.event_type === "Party" || e.event_type === "Facial");
    const monthFaces = monthPartyFacial.reduce((s, e) => s + Number(e.guest_count || 0), 0);
    const monthSharing = monthEvents.reduce((s, e) => s + Number(e.sharing_appointments_count || 0), 0);
    const monthNewTeam = prospects.filter((p) =>
      (p.opportunity_status === "Joined" || p.opportunity_status === "Converted") && inRange(p.updated_at, monthStart, monthEnd)
    ).length;
    const monthSharingConvPct = monthSharing > 0 ? Math.round((monthNewTeam / monthSharing) * 1000) / 10 : 0;

    const dayOfWeek = differenceInDays(now, weekStart) + 1;
    const weekPace = dayOfWeek / 6;
    const dayOfMonth = now.getDate();
    const daysInMonth = differenceInDays(monthEnd, monthStart) + 1;
    const monthPace = dayOfMonth / daysInMonth;

    const getStatus = (current: number, goalMin: number, pace: number): "green" | "yellow" | "red" => {
      const expected = goalMin * pace;
      if (current >= goalMin) return "green";
      if (current >= expected * 0.8) return "green";
      if (current >= expected * 0.5) return "yellow";
      return "red";
    };

    const weekly: ScoreItem[] = [
      { label: "Faces", current: weekFaces, goal: 10, pct: Math.min((weekFaces / 10) * 100, 100), status: getStatus(weekFaces, 10, weekPace) },
      { label: "Parties", current: weekParties, goal: 2, pct: Math.min((weekParties / 2) * 100, 100), status: getStatus(weekParties, 2, weekPace) },
      { label: "Sharings", current: weekSharing, goal: 5, pct: Math.min((weekSharing / 5) * 100, 100), status: getStatus(weekSharing, 5, weekPace) },
    ];

    const monthly: ScoreItem[] = [
      { label: "Faces", current: monthFaces, goal: 40, pct: Math.min((monthFaces / 40) * 100, 100), status: getStatus(monthFaces, 40, monthPace) },
      { label: "Parties", current: monthParties, goal: 8, pct: Math.min((monthParties / 8) * 100, 100), status: getStatus(monthParties, 8, monthPace) },
      { label: "Sharings", current: monthSharing, goal: 20, pct: Math.min((monthSharing / 20) * 100, 100), status: getStatus(monthSharing, 20, monthPace) },
      { label: "New Team Members", current: monthNewTeam, goal: 3, pct: Math.min((monthNewTeam / 3) * 100, 100), status: getStatus(monthNewTeam, 3, monthPace) },
    ];

    const monthlySharingConversion: ConversionItem = {
      label: "Sharing Conversion",
      numerator: monthNewTeam,
      denominator: monthSharing,
      pct: monthSharingConvPct,
    };

    return { weekly, monthly, monthlySharingConversion };
  }, [events, prospects]);
}

const STATUS_COLORS = {
  green: "text-green-600",
  yellow: "text-yellow-600",
  red: "text-red-600",
} as const;

const PROGRESS_COLORS = {
  green: "[&>div]:bg-green-500",
  yellow: "[&>div]:bg-yellow-500",
  red: "[&>div]:bg-red-500",
} as const;

export default function Scoreboard() {
  const { data: events = [], isLoading: evLoading } = useQuery({ queryKey: ["events"], queryFn: fetchEvents });
  const { data: prospects = [], isLoading: prLoading } = useQuery({ queryKey: ["prospects"], queryFn: fetchProspects });
  const scoreboard = useScoreboard(events, prospects);
  const isLoading = evLoading || prLoading;

  return (
    <Layout>
      <div className="max-w-4xl mx-auto space-y-6">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Scoreboard</h1>
          <p className="text-sm text-muted-foreground mt-1">Track your weekly and monthly execution goals</p>
        </div>

        {isLoading ? (
          <div className="flex items-center justify-center py-12">
            <div className="w-6 h-6 border-2 border-primary border-t-transparent rounded-full animate-spin" />
          </div>
        ) : (
          <div className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {/* This Week */}
            <Card className="border-border/50 shadow-sm">
              <CardHeader className="pb-3">
                <div className="flex items-center gap-2">
                  <Target className="w-5 h-5 text-primary" />
                  <CardTitle className="text-base font-semibold text-foreground">This Week</CardTitle>
                </div>
              </CardHeader>
              <CardContent className="space-y-5">
                {scoreboard.weekly.map((item) => (
                  <div key={item.label} className="space-y-2">
                    <div className="flex items-center justify-between">
                      <span className="text-sm font-medium text-foreground">{item.label}</span>
                      <span className={cn("text-lg font-bold tabular-nums", STATUS_COLORS[item.status])}>
                        {item.current} <span className="text-muted-foreground font-normal text-sm">/ {item.goal}</span>
                      </span>
                    </div>
                    <Progress value={item.pct} className={cn("h-2.5", PROGRESS_COLORS[item.status])} />
                  </div>
                ))}
              </CardContent>
            </Card>

            {/* This Month */}
            <Card className="border-border/50 shadow-sm">
              <CardHeader className="pb-3">
                <div className="flex items-center gap-2">
                  <Target className="w-5 h-5 text-primary" />
                  <CardTitle className="text-base font-semibold text-foreground">This Month</CardTitle>
                </div>
              </CardHeader>
              <CardContent className="space-y-5">
                {scoreboard.monthly.map((item) => (
                  <div key={item.label} className="space-y-2">
                    <div className="flex items-center justify-between">
                      <span className="text-sm font-medium text-foreground">{item.label}</span>
                      <span className={cn("text-lg font-bold tabular-nums", STATUS_COLORS[item.status])}>
                        {item.current} <span className="text-muted-foreground font-normal text-sm">/ {item.goal}</span>
                      </span>
                    </div>
                    <Progress value={item.pct} className={cn("h-2.5", PROGRESS_COLORS[item.status])} />
                  </div>
                ))}
                {/* Sharing Conversion */}
                <div className="space-y-1 pt-1 border-t border-border/30">
                  <div className="flex items-center justify-between">
                    <span className="text-sm font-medium text-foreground">{scoreboard.monthlySharingConversion.label}</span>
                    <span className="text-lg font-bold tabular-nums text-primary">
                      {scoreboard.monthlySharingConversion.pct.toFixed(1)}%
                    </span>
                  </div>
                  <p className="text-xs text-muted-foreground">
                    {scoreboard.monthlySharingConversion.numerator} joined / {scoreboard.monthlySharingConversion.denominator} sharings
                  </p>
                </div>
              </CardContent>
            </Card>
          </div>
          </div>
        )}
      </div>
    </Layout>
  );
}
