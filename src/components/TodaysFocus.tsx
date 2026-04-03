import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { Target, Phone, CalendarPlus, Share2, Briefcase, PartyPopper, Coffee, User, ChevronRight } from "lucide-react";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription } from "@/components/ui/sheet";
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

export interface FocusDetailItem {
  id: string;
  name: string;
  type: string;       // "Customer" | "Lead" | "Consultant" | "Prospect" | "Event"
  method?: string;     // "Call" | "Text" | "Email" | "In Person"
  detail?: string;     // e.g. "Party" | "Facial" | booking type
}

interface GoalProps {
  reachOutsToday: number;
  bookingsToday: number;
  sharingToday: number;
  reachOutDetails?: FocusDetailItem[];
  bookingDetails?: FocusDetailItem[];
  sharingDetails?: FocusDetailItem[];
  onDetailNavigate?: (type: string, id: string) => void;
}

function GoalItem({ icon: Icon, label, current, goal, color, onClick }: {
  icon: React.ElementType;
  label: string;
  current: number;
  goal: number;
  color: string;
  onClick?: () => void;
}) {
  const pct = goal > 0 ? Math.min(100, Math.round((current / goal) * 100)) : 0;
  return (
    <button
      type="button"
      onClick={onClick}
      className="w-full space-y-1.5 text-left rounded-md p-1.5 -m-1.5 transition-colors hover:bg-muted/50 group"
    >
      <div className="flex items-center justify-between text-sm">
        <span className="flex items-center gap-1.5 font-medium text-foreground">
          <Icon className={`w-3.5 h-3.5 ${color}`} />
          {label}
        </span>
        <span className="flex items-center gap-1 text-xs text-muted-foreground">
          {current} / {goal}
          <ChevronRight className="w-3 h-3 opacity-0 group-hover:opacity-100 transition-opacity" />
        </span>
      </div>
      <Progress value={pct} className="h-2" />
    </button>
  );
}

const TYPE_COLORS: Record<string, string> = {
  Customer: "bg-primary/10 text-primary",
  Lead: "bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300",
  Consultant: "bg-violet-100 text-violet-700 dark:bg-violet-900/30 dark:text-violet-300",
  Prospect: "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300",
  Event: "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300",
};

export default function TodaysFocus({
  reachOutsToday = 0, bookingsToday = 0, sharingToday = 0,
  reachOutDetails = [], bookingDetails = [], sharingDetails = [],
  onDetailNavigate,
}: GoalProps) {
  const [dayType, setDayType] = useState<DayType>("booking");
  const goals = GOALS[dayType];
  const [activePanel, setActivePanel] = useState<"reachOuts" | "bookings" | "sharing" | null>(null);

  const panelConfig = {
    reachOuts: { title: "Daily Reach Outs", icon: Phone, items: reachOutDetails, color: "text-primary" },
    bookings: { title: "Bookings", icon: CalendarPlus, items: bookingDetails, color: "text-emerald-500" },
    sharing: { title: "Sharing", icon: Share2, items: sharingDetails, color: "text-violet-500" },
  };

  const panel = activePanel ? panelConfig[activePanel] : null;

  return (
    <div className="space-y-4">
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
          <GoalItem icon={Phone} label="Daily Reach Outs" current={reachOutsToday} goal={goals.reachOuts} color="text-primary" onClick={() => setActivePanel("reachOuts")} />
          <GoalItem icon={CalendarPlus} label="Bookings" current={bookingsToday} goal={goals.bookings} color="text-emerald-500" onClick={() => setActivePanel("bookings")} />
          {goals.sharing > 0 && (
            <GoalItem icon={Share2} label="Sharing" current={sharingToday} goal={goals.sharing} color="text-violet-500" onClick={() => setActivePanel("sharing")} />
          )}
          <p className="text-[10px] text-muted-foreground pt-1">
            {dayType === "booking" && "Target: 8–12 reach outs · 4–5 days/week"}
            {dayType === "event" && "Bookings come from events · 5–8 reach outs"}
            {dayType === "light" && "Reduced schedule · focus on follow-ups"}
          </p>
        </CardContent>
      </Card>

      <TodaysPlan />

      {/* Activity Detail Sheet */}
      <Sheet open={!!activePanel} onOpenChange={(open) => !open && setActivePanel(null)}>
        <SheetContent side="right" className="w-full sm:max-w-md overflow-y-auto">
          {panel && (
            <>
              <SheetHeader>
                <SheetTitle className="flex items-center gap-2">
                  <panel.icon className={`w-5 h-5 ${panel.color}`} />
                  {panel.title}
                </SheetTitle>
                <SheetDescription>
                  {panel.items.length} {panel.items.length === 1 ? "activity" : "activities"} logged today
                </SheetDescription>
              </SheetHeader>

              <div className="mt-4 space-y-2">
                {panel.items.length === 0 ? (
                  <div className="flex flex-col items-center justify-center py-12 text-center">
                    <User className="w-10 h-10 text-muted-foreground/40 mb-3" />
                    <p className="text-sm font-medium text-muted-foreground">No activity logged yet today</p>
                    <p className="text-xs text-muted-foreground/70 mt-1">Complete reach outs, bookings, or sharing to see them here</p>
                  </div>
                ) : (
                  panel.items.map((item) => (
                    <button
                      key={item.id}
                      type="button"
                      className="w-full flex items-center gap-3 p-3 rounded-lg border border-border/50 hover:bg-muted/50 transition-colors text-left"
                      onClick={() => onDetailNavigate?.(item.type, item.id)}
                    >
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium text-foreground truncate">{item.name}</p>
                        <div className="flex items-center gap-1.5 mt-1">
                          <span className={cn("text-[10px] px-1.5 py-0.5 rounded font-medium", TYPE_COLORS[item.type] || "bg-muted text-muted-foreground")}>
                            {item.type}
                          </span>
                          {item.method && (
                            <span className="text-[10px] px-1.5 py-0.5 rounded bg-secondary text-secondary-foreground font-medium">
                              {item.method}
                            </span>
                          )}
                          {item.detail && (
                            <span className="text-[10px] text-muted-foreground">{item.detail}</span>
                          )}
                        </div>
                      </div>
                      <ChevronRight className="w-4 h-4 text-muted-foreground/50 flex-shrink-0" />
                    </button>
                  ))
                )}
              </div>
            </>
          )}
        </SheetContent>
      </Sheet>
    </div>
  );
}
