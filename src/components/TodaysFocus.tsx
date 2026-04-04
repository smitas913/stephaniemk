import { useState, useMemo } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { Target, Phone, CalendarPlus, Share2, Briefcase, PartyPopper, Coffee, User, ChevronRight, ChevronLeft, BarChart3, Calendar } from "lucide-react";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription } from "@/components/ui/sheet";
import TodaysPlan from "@/components/TodaysPlan";
import WeeklyScorecard from "@/components/WeeklyScorecard";
import { cn } from "@/lib/utils";
import { format, subDays, addDays } from "date-fns";
import { toLocalDateKey } from "@/lib/dateOnly";
import { computeMetricsForDate } from "@/lib/focusMetrics";

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
  type: string;
  method?: string;
  detail?: string;
}

export interface FocusRawData {
  unifiedNotes: any[];
  allNotes: any[];
  customers: any[];
  prospects: any[];
  bookingLeads: any[];
  consultants: any[];
  events: any[];
}

interface GoalProps {
  reachOutsToday: number;
  bookingsToday: number;
  sharingToday: number;
  reachOutDetails?: FocusDetailItem[];
  bookingDetails?: FocusDetailItem[];
  sharingDetails?: FocusDetailItem[];
  onDetailNavigate?: (type: string, id: string) => void;
  rawData?: FocusRawData;
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
  rawData,
}: GoalProps) {
  const todayKey = toLocalDateKey();
  const [dayType, setDayType] = useState<DayType>("booking");
  const [selectedDate, setSelectedDate] = useState(todayKey);
  const [activePanel, setActivePanel] = useState<"reachOuts" | "bookings" | "sharing" | null>(null);
  const [viewMode, setViewMode] = useState<"daily" | "weekly">("daily");
  const goals = GOALS[dayType];

  const isToday = selectedDate === todayKey;

  // Compute metrics for the selected date
  const dateMetrics = useMemo(() => {
    if (isToday || !rawData) return null;
    return computeMetricsForDate(selectedDate, rawData);
  }, [selectedDate, isToday, rawData]);

  const currentReachOuts = isToday ? reachOutsToday : (dateMetrics?.reachOuts ?? 0);
  const currentBookings = isToday ? bookingsToday : (dateMetrics?.bookings ?? 0);
  const currentSharing = isToday ? sharingToday : (dateMetrics?.sharing ?? 0);
  const currentReachOutDetails = isToday ? reachOutDetails : (dateMetrics?.reachOutDetails ?? []);
  const currentBookingDetails = isToday ? bookingDetails : (dateMetrics?.bookingDetails ?? []);
  const currentSharingDetails = isToday ? sharingDetails : (dateMetrics?.sharingDetails ?? []);

  const goBack = () => {
    const d = new Date(selectedDate + "T12:00:00");
    setSelectedDate(toLocalDateKey(subDays(d, 1)));
  };
  const goForward = () => {
    if (isToday) return;
    const d = new Date(selectedDate + "T12:00:00");
    const next = toLocalDateKey(addDays(d, 1));
    if (next <= todayKey) setSelectedDate(next);
  };

  const dateLabel = (() => {
    if (isToday) return "Today";
    const d = new Date(selectedDate + "T12:00:00");
    const yesterday = toLocalDateKey(subDays(new Date(), 1));
    if (selectedDate === yesterday) return "Yesterday";
    return format(d, "MMM d, yyyy");
  })();

  const panelConfig = {
    reachOuts: { title: "Daily Reach Outs", icon: Phone, items: currentReachOutDetails, color: "text-primary" },
    bookings: { title: "Bookings", icon: CalendarPlus, items: currentBookingDetails, color: "text-emerald-500" },
    sharing: { title: "Sharing", icon: Share2, items: currentSharingDetails, color: "text-violet-500" },
  };

  const panel = activePanel ? panelConfig[activePanel] : null;

  return (
    <div className="space-y-4">
      <Card className="border-primary/20 shadow-md bg-primary/5">
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Target className="w-5 h-5 text-primary" />
              <CardTitle className="text-base font-semibold text-foreground">Today's Focus</CardTitle>
            </div>
            {/* Daily / Weekly Toggle */}
            <div className="flex gap-0.5 rounded-full border border-border p-0.5">
              <button
                type="button"
                onClick={() => setViewMode("daily")}
                className={cn(
                  "flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-medium transition-colors",
                  viewMode === "daily" ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:bg-muted"
                )}
              >
                <Calendar className="w-3 h-3" /> Daily
              </button>
              <button
                type="button"
                onClick={() => setViewMode("weekly")}
                className={cn(
                  "flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-medium transition-colors",
                  viewMode === "weekly" ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:bg-muted"
                )}
              >
                <BarChart3 className="w-3 h-3" /> Weekly
              </button>
            </div>
          </div>

          {viewMode === "daily" && (
            <>
              {/* Date Navigator */}
              <div className="flex items-center justify-between mt-2">
                <Button variant="ghost" size="icon" className="h-7 w-7" onClick={goBack}>
                  <ChevronLeft className="w-4 h-4" />
                </Button>
                <button
                  type="button"
                  className="text-sm font-medium text-foreground hover:underline"
                  onClick={() => setSelectedDate(todayKey)}
                >
                  {dateLabel}
                </button>
                <Button variant="ghost" size="icon" className="h-7 w-7" onClick={goForward} disabled={isToday}>
                  <ChevronRight className="w-4 h-4" />
                </Button>
              </div>

              {isToday && (
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
              )}
            </>
          )}
        </CardHeader>
        {viewMode === "daily" ? (
          <CardContent className="space-y-3">
            {!isToday && (
              <div className="flex items-center gap-3 text-sm">
                <span className="font-semibold text-primary">{currentReachOuts}</span>
                <span className="text-muted-foreground text-xs">Reach Outs</span>
                <span className="text-muted-foreground">·</span>
                <span className="font-semibold text-emerald-600">{currentBookings}</span>
                <span className="text-muted-foreground text-xs">Bookings</span>
                <span className="text-muted-foreground">·</span>
                <span className="font-semibold text-violet-600">{currentSharing}</span>
                <span className="text-muted-foreground text-xs">Sharing</span>
              </div>
            )}
            <GoalItem icon={Phone} label="Daily Reach Outs" current={currentReachOuts} goal={isToday ? goals.reachOuts : currentReachOuts || 1} color="text-primary" onClick={() => setActivePanel("reachOuts")} />
            <GoalItem icon={CalendarPlus} label="Bookings" current={currentBookings} goal={isToday ? goals.bookings : currentBookings || 1} color="text-emerald-500" onClick={() => setActivePanel("bookings")} />
            {(isToday ? goals.sharing > 0 : currentSharing > 0) && (
              <GoalItem icon={Share2} label="Sharing" current={currentSharing} goal={isToday ? goals.sharing : currentSharing || 1} color="text-violet-500" onClick={() => setActivePanel("sharing")} />
            )}
            {isToday && (
              <p className="text-[10px] text-muted-foreground pt-1">
                {dayType === "booking" && "Target: 8–12 reach outs · 4–5 days/week"}
                {dayType === "event" && "Bookings come from events · 5–8 reach outs"}
                {dayType === "light" && "Reduced schedule · focus on follow-ups"}
              </p>
            )}
          </CardContent>
        ) : (
          <CardContent>
            <WeeklyScorecard
              rawData={rawData}
              todayReachOuts={reachOutsToday}
              todayBookings={bookingsToday}
              todaySharing={sharingToday}
              onDayClick={(dateKey) => {
                setSelectedDate(dateKey);
                setViewMode("daily");
              }}
            />
          </CardContent>
        )}
      </Card>

      {viewMode === "daily" && isToday && <TodaysPlan />}

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
                  {panel.items.length} {panel.items.length === 1 ? "activity" : "activities"} {isToday ? "today" : `on ${dateLabel}`}
                </SheetDescription>
              </SheetHeader>

              {/* Date navigation inside the sheet */}
              <div className="flex items-center justify-between mt-3 mb-1">
                <Button variant="ghost" size="icon" className="h-8 w-8" onClick={goBack}>
                  <ChevronLeft className="w-4 h-4" />
                </Button>
                <button
                  type="button"
                  className="text-sm font-semibold text-foreground hover:underline"
                  onClick={() => setSelectedDate(todayKey)}
                >
                  {dateLabel}
                </button>
                <Button variant="ghost" size="icon" className="h-8 w-8" onClick={goForward} disabled={isToday}>
                  <ChevronRight className="w-4 h-4" />
                </Button>
              </div>

              <div className="mt-4 space-y-2">
                {panel.items.length === 0 ? (
                  <div className="flex flex-col items-center justify-center py-12 text-center">
                    <User className="w-10 h-10 text-muted-foreground/40 mb-3" />
                    <p className="text-sm font-medium text-muted-foreground">
                      {isToday ? "No activity logged yet today" : `No activity on ${dateLabel}`}
                    </p>
                    {isToday && (
                      <p className="text-xs text-muted-foreground/70 mt-1">Complete reach outs, bookings, or sharing to see them here</p>
                    )}
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
