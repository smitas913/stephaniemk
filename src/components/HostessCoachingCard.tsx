import { useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
import { PartyPopper } from "lucide-react";
import { Link } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { toLocalDateKey } from "@/lib/dateOnly";
import { createNextHostessStep } from "@/lib/hostessCoaching";
import { toast } from "sonner";

type Task = {
  id: string;
  event_id: string;
  hostess_name: string;
  step: number;
  text: string;
  due_date: string;
  done: boolean;
};

type EventMeta = { event_date: string | null; hostess_name: string | null };

export default function HostessCoachingCard() {
  const { user, loading: authLoading } = useAuth();
  const [tasks, setTasks] = useState<Task[]>([]);
  const [eventMeta, setEventMeta] = useState<Record<string, EventMeta>>({});
  const [loading, setLoading] = useState(true);

  const load = async () => {
    if (!user) return;
    const today = toLocalDateKey(new Date());
    const { data, error } = await (supabase as any)
      .from("hostess_coaching_tasks")
      .select("id, event_id, hostess_name, step, text, due_date, done")
      .eq("user_id", user.id)
      .eq("done", false)
      .lte("due_date", today)
      .order("due_date", { ascending: true });
    if (error) {
      console.error("Failed to load hostess coaching tasks", error);
      setLoading(false);
      return;
    }
    const rows = (data as Task[]) || [];
    setTasks(rows);
    // Hydrate event meta for sequencing
    const eventIds = Array.from(new Set(rows.map(t => t.event_id)));
    if (eventIds.length > 0) {
      const { data: evs } = await supabase
        .from("events")
        .select("event_id, event_date, hostess_name")
        .in("event_id", eventIds);
      const map: Record<string, EventMeta> = {};
      (evs || []).forEach((e: any) => {
        map[e.event_id] = { event_date: e.event_date, hostess_name: e.hostess_name };
      });
      setEventMeta(map);
    }
    setLoading(false);
  };

  useEffect(() => {
    if (authLoading || !user) return;
    setLoading(true);
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user, authLoading]);

  const handleToggle = async (task: Task) => {
    // Optimistic remove
    setTasks(prev => prev.filter(t => t.id !== task.id));
    const { error } = await (supabase as any)
      .from("hostess_coaching_tasks")
      .update({ done: true, done_at: new Date().toISOString() })
      .eq("id", task.id);
    if (error) {
      toast.error("Couldn't complete task");
      load();
      return;
    }
    // Seed next step
    const meta = eventMeta[task.event_id];
    try {
      await createNextHostessStep({
        eventId: task.event_id,
        hostessName: task.hostess_name ?? meta?.hostess_name ?? null,
        eventDate: meta?.event_date ?? null,
        completedStep: task.step,
      });
    } catch (e) {
      console.error("Failed to create next coaching step", e);
    }
    load();
  };

  if (loading || tasks.length === 0) return null;

  const today = toLocalDateKey(new Date());

  return (
    <Card className="border-border/50 shadow-sm">
      <CardHeader className="pb-2">
        <div className="flex items-center gap-2">
          <div className="p-1.5 rounded-md bg-pink-100 dark:bg-pink-900/30">
            <PartyPopper className="w-4 h-4 text-pink-600 dark:text-pink-300" />
          </div>
          <div className="flex-1 min-w-0">
            <CardTitle className="text-sm font-semibold text-foreground">Hostess Coaching</CardTitle>
            <p className="text-xs text-muted-foreground mt-0.5">Tap to check off — the next reminder appears automatically.</p>
          </div>
          <Badge variant="secondary" className="text-xs shrink-0">{tasks.length}</Badge>
        </div>
      </CardHeader>
      <CardContent className="pt-0">
        <ul className="divide-y divide-border/40">
          {tasks.map(task => {
            const overdue = task.due_date < today;
            return (
              <li key={task.id} className="py-2 flex items-center gap-2">
                <Checkbox
                  checked={false}
                  onCheckedChange={() => handleToggle(task)}
                  className="h-4 w-4 shrink-0"
                  aria-label={`Complete: ${task.text}`}
                />
                <div className="flex-1 min-w-0">
                  <p className="text-sm text-foreground leading-tight">{task.text}</p>
                  <p className="text-[11px] text-muted-foreground mt-0.5">
                    <Link to={`/events/${task.event_id}`} className="hover:underline text-primary">{task.event_id}</Link>
                    {overdue && <span className="ml-2 text-destructive">· Overdue</span>}
                  </p>
                </div>
                <Badge variant="outline" className="text-[10px] shrink-0">Step {task.step}</Badge>
              </li>
            );
          })}
        </ul>
      </CardContent>
    </Card>
  );
}
