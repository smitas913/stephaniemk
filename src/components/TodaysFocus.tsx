import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { Target, Phone, CalendarPlus, Share2 } from "lucide-react";
import TodaysPlan from "@/components/TodaysPlan";

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
  return (
    <div className="space-y-4">
      {/* Daily Goals */}
      <Card className="border-primary/20 shadow-md bg-primary/5">
        <CardHeader className="pb-3">
          <div className="flex items-center gap-2">
            <Target className="w-5 h-5 text-primary" />
            <CardTitle className="text-base font-semibold text-foreground">Today's Focus</CardTitle>
          </div>
        </CardHeader>
        <CardContent className="space-y-3">
          <GoalItem icon={Phone} label="Daily Reach Outs" current={callsToday} goal={10} color="text-primary" />
          <GoalItem icon={CalendarPlus} label="Bookings" current={0} goal={2} color="text-emerald-500" />
          <GoalItem icon={Share2} label="Sharing" current={0} goal={1} color="text-violet-500" />
        </CardContent>
      </Card>

      {/* Deliveries & Events */}
      <TodaysPlan />
    </div>
  );
}
