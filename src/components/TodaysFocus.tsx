import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { Target, Phone, CalendarPlus, Share2, Briefcase, PartyPopper, Coffee } from "lucide-react";
import TodaysPlan from "@/components/TodaysPlan";
import { cn } from "@/lib/utils";

type DayType = "booking" | "event" | "light";

const DAY_TYPES: { value: DayType; label: string; icon: React.ElementType; description: string }[] = [
  { value: "booking", label: "Booking Day", icon: Briefcase, description: "Full reach-out focus" },
  { value: "event", label: "Event Day", icon: PartyPopper, description: "Bookings from events" },
  { value: "light", label: "Light Day", icon: Coffee, description: "Reduced activity" },
];

const GOALS: Record<DayType, { reachOuts: number; bookings: number; sharing: number }> = {
  booking: { reachOuts: 10, bookings: 2, sharing: 1 },
  event:   { reachOuts: 5,  bookings: 2, sharing: 0 },
  light:   { reachOuts: 6,  bookings: 1, sharing: 0 },
};

type GoalProps = {
  callsToday: number;
};

function GoalItem({ icon: Icon, label, current, goal, color }: {
  icon: React.ElementType;
  label: string;
  current: number;
  goal: number;
  color: string;
}) {
  const pct = Math.min(100, Math.round((current / goal) * 100));
  return (
    <div className="space-y-1.5">
      <div className="flex items-center justify-between text-sm">
        <span className="flex items-center gap-1.5 font-medium text-foreground">
          <Icon className={`w-3.5 h-3.5 ${color}`} />
          {label}
        </span>
        <span className="text-xs text-muted-foreground">{current} / {goal}</span>
      </div>
      <Progress value={pct} className="h-2" />
    </div>
  );
}

export default function TodaysFocus({ callsToday = 0 }: GoalProps) {
  const [dayType, setDayType] = useState<DayType>("booking");
  const goals = GOALS[dayType];

  return (
    <div className="space-y-4">
      {/* Daily Goals */}
      <Card className="border-primary/20 shadow-md bg-primary/5">
        <CardHeader className="pb-3">
          <div className="flex items-center gap-2">
            <Target className="w-5 h-5 text-primary" />
            <CardTitle className="text-base font-semibold text-foreground">Today's Focus</CardTitle>
          </div>
          <div className="flex gap-1.5 mt-2">
            {DAY_TYPES.map(dt => (
              <button
                key={dt.value}
                type="button"
                onClick={() => setDayType(dt.value)}
                className={cn(
                  "flex items-center gap-1 px-2.5 py-1 rounded-full text-[11px] font-medium border transition-colors",
                  dayType === dt.value
                    ? "bg-primary text-primary-foreground border-primary"
                    : "border-border bg-background text-muted-foreground hover:bg-muted"
                )}
                title={dt.description}
              >
                <dt.icon className="w-3 h-3" />
                {dt.label}
              </button>
            ))}
          </div>
        </CardHeader>
        <CardContent className="space-y-3">
          <GoalItem icon={Phone} label="Daily Reach Outs" current={callsToday} goal={goals.reachOuts} color="text-primary" />
          <GoalItem icon={CalendarPlus} label="Bookings" current={0} goal={goals.bookings} color="text-emerald-500" />
          {goals.sharing > 0 && (
            <GoalItem icon={Share2} label="Sharing" current={0} goal={goals.sharing} color="text-violet-500" />
          )}
          <p className="text-[10px] text-muted-foreground pt-1">
            {dayType === "booking" && "Target: 8–12 reach outs · 4–5 days/week"}
            {dayType === "event" && "Bookings come from events · 5–8 reach outs"}
            {dayType === "light" && "Reduced schedule · focus on follow-ups"}
          </p>
        </CardContent>
      </Card>

      {/* Deliveries & Events */}
      <TodaysPlan />
    </div>
  );
}
