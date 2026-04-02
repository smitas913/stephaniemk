import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { fetchEvents, fetchProspects } from "@/lib/queries";
import type { EventRecord, Prospect } from "@/lib/types";
import Layout from "@/components/Layout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
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

    const weekEvents = events.filter((e) => inRange(e.event_date, weekStart, weekEnd));
    const monthEvents = events.filter((e) => inRange(e.event_date, monthStart, monthEnd));

    const weekPartyFacial = weekEvents.filter((e) => e.event_type === "Party" || e.event_type === "Facial");
    const weekFaces = weekPartyFacial.reduce((s, e) => s + Number(e.guest_count || 0), 0);
    const weekSharing = weekEvents.reduce((s, e) => s + Number(e.sharing_appointments_count || 0), 0);

    // Sharing Conversion: prospects who joined this week / total sharing appointments this week
    const weekJoined = prospects.filter((p) =>
      p.opportunity_status === "Joined" && inRange(p.updated_at, weekStart, weekEnd)
    ).length;
    const sharingConversion: ConversionItem = {
      label: "Sharing Conversion Rate",
      numerator: weekJoined,
      denominator: weekSharing,
      pct: weekSharing > 0 ? Math.round((weekJoined / weekSharing) * 1000) / 10 : 0,
    };

    const monthParties = monthEvents.filter((e) => e.event_type === "Party").length;
    const monthPartyFacial = monthEvents.filter((e) => e.event_type === "Party" || e.event_type === "Facial");
    const monthFaces = monthPartyFacial.reduce((s, e) => s + Number(e.guest_count || 0), 0);

    const dayOfWeek = differenceInDays(now, weekStart) + 1;
    const weekPace = dayOfWeek / 7;
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
      { label: "Sharing Appointments", current: weekSharing, goal: 5, pct: Math.min((weekSharing / 5) * 100, 100), status: getStatus(weekSharing, 5, weekPace) },
    ];

    const monthly: ScoreItem[] = [
      { label: "Parties", current: monthParties, goal: 8, pct: Math.min((monthParties / 8) * 100, 100), status: getStatus(monthParties, 8, monthPace) },
      { label: "Faces", current: monthFaces, goal: 40, pct: Math.min((monthFaces / 40) * 100, 100), status: getStatus(monthFaces, 40, monthPace) },
    ];

    return { weekly, monthly, sharingConversion };
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

function ScoreSection({ title, items }: { title: string; items: ScoreItem[] }) {
  return (
    <Card className="border-border/50 shadow-sm">
      <CardHeader className="pb-3">
        <div className="flex items-center gap-2">
          <Target className="w-5 h-5 text-primary" />
          <CardTitle className="text-base font-semibold text-foreground">{title}</CardTitle>
        </div>
      </CardHeader>
      <CardContent className="space-y-5">
        {items.map((item) => (
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
  );
}

export default function Scoreboard() {
  const { data: events = [], isLoading: evLoading } = useQuery({ queryKey: ["events"], queryFn: fetchEvents });
  const { data: prospects = [], isLoading: prLoading } = useQuery({ queryKey: ["prospects"], queryFn: fetchProspects });
  const scoreboard = useScoreboard(events, prospects);
  const isLoading = evLoading || prLoading;

  return (
    <Layout>
      <div className="max-w-2xl mx-auto space-y-6">
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
                {/* Sharing Conversion Rate */}
                <div className="space-y-1 pt-1 border-t border-border/30">
                  <div className="flex items-center justify-between">
                    <span className="text-sm font-medium text-foreground">{scoreboard.sharingConversion.label}</span>
                    <span className="text-lg font-bold tabular-nums text-primary">
                      {scoreboard.sharingConversion.pct.toFixed(1)}%
                    </span>
                  </div>
                  <p className="text-xs text-muted-foreground">
                    {scoreboard.sharingConversion.numerator} / {scoreboard.sharingConversion.denominator} sharing appointments
                  </p>
                </div>
              </CardContent>
            </Card>
            <ScoreSection title="This Month" items={scoreboard.monthly} />
          </div>
        )}
      </div>
    </Layout>
  );
}
