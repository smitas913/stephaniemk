import { useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { fetchEvents } from "@/lib/queries";
import type { EventRecord } from "@/lib/types";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Calendar, ArrowRight, MapPin, Clock } from "lucide-react";
import { toLocalDateKey } from "@/lib/dateOnly";
import { format, parseISO } from "date-fns";

/**
 * Lightweight "Upcoming Events" snapshot for the Dashboard.
 * Shows the next 1–3 booked events and quick actions.
 */
export default function UpcomingEventsCard() {
  const navigate = useNavigate();
  const { data: events = [] } = useQuery({
    queryKey: ["events"],
    queryFn: fetchEvents,
  });

  const upcoming = useMemo(() => {
    const today = toLocalDateKey();
    return (events as EventRecord[])
      .filter(
        (e) =>
          e.event_date &&
          e.event_date >= today &&
          e.event_status !== "Cancelled" &&
          !e.is_archived
      )
      .sort((a, b) => (a.event_date! < b.event_date! ? -1 : 1))
      .slice(0, 3);
  }, [events]);

  const formatDate = (dateStr: string) => {
    try {
      return format(parseISO(dateStr), "EEE, MMM d");
    } catch {
      return dateStr;
    }
  };

  return (
    <Card className="border-border/50 shadow-sm">
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <Calendar className="w-4 h-4 text-primary" />
            <CardTitle className="text-sm font-semibold text-foreground">
              Upcoming Events
            </CardTitle>
          </div>
          <Button
            variant="ghost"
            size="sm"
            className="h-7 text-xs"
            onClick={() => navigate("/events")}
          >
            All Events
            <ArrowRight className="w-3.5 h-3.5 ml-1" />
          </Button>
        </div>
      </CardHeader>
      <CardContent className="space-y-2.5">
        {upcoming.length === 0 ? (
          <p className="text-xs text-muted-foreground py-1">
            No upcoming events.{" "}
            <button
              className="text-primary hover:underline"
              onClick={() => navigate("/events/new")}
            >
              Create one →
            </button>
          </p>
        ) : (
          upcoming.map((evt) => {
            const eventName =
              evt.hostess_name
                ? `${evt.hostess_name}'s ${evt.event_type || "Event"}`
                : evt.event_type || "Event";
            return (
              <div
                key={evt.id}
                className="rounded-lg border border-border/50 bg-muted/20 p-3 space-y-2"
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-semibold text-foreground truncate">
                      {eventName}
                    </p>
                    <div className="flex items-center gap-3 mt-0.5 text-[11px] text-muted-foreground">
                      <span className="flex items-center gap-1">
                        <Calendar className="w-3 h-3" />
                        {evt.event_date && formatDate(evt.event_date)}
                      </span>
                      {evt.event_time && (
                        <span className="flex items-center gap-1">
                          <Clock className="w-3 h-3" />
                          {evt.event_time}
                        </span>
                      )}
                      {evt.event_location && (
                        <span className="flex items-center gap-1 truncate">
                          <MapPin className="w-3 h-3" />
                          <span className="truncate">{evt.event_location}</span>
                        </span>
                      )}
                    </div>
                  </div>
                </div>
                <div className="flex flex-wrap gap-1.5">
                  <Button
                    size="sm"
                    variant="outline"
                    className="h-7 text-xs"
                    onClick={() =>
                      navigate(`/events/${evt.event_id}`, {
                        state: { from: "/dashboard", focus: "coaching" },
                      })
                    }
                  >
                    Prep
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    className="h-7 text-xs"
                    onClick={() =>
                      navigate(`/events/${evt.event_id}`, {
                        state: { from: "/dashboard", focus: "results" },
                      })
                    }
                  >
                    Log Results
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    className="h-7 text-xs ml-auto"
                    onClick={() =>
                      navigate(`/events/${evt.event_id}`, {
                        state: { from: "/dashboard" },
                      })
                    }
                  >
                    Open
                    <ArrowRight className="w-3 h-3 ml-1" />
                  </Button>
                </div>
              </div>
            );
          })
        )}
      </CardContent>
    </Card>
  );
}
