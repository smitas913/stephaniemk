import { useMemo, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { fetchProspects, fetchTeamConsultants, convertProspectToConsultant } from "@/lib/queries";
import type { Prospect } from "@/lib/types";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { supabase } from "@/integrations/supabase/client";
import { toLocalDateKey, formatDateOnly } from "@/lib/dateOnly";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import { MessageSquare, User, Users, Clock, MoreHorizontal } from "lucide-react";
import { addDays, format, differenceInCalendarDays, parseISO } from "date-fns";
import QuickCareerChatDialog from "@/components/QuickCareerChatDialog";
import { useNavigate } from "react-router-dom";

export default function CareerChatsTab() {
  const navigate = useNavigate();
  const qc = useQueryClient();
  const { data: prospects = [], isLoading } = useQuery({ queryKey: ["prospects"], queryFn: fetchProspects });
  const { data: consultants = [] } = useQuery({ queryKey: ["team-consultants"], queryFn: fetchTeamConsultants });

  const [dialogState, setDialogState] = useState<{ open: boolean; prospectId?: string; lastTouch?: string | null }>({ open: false });

  const consultantMap = useMemo(() => {
    const m: Record<string, string> = {};
    for (const c of consultants) m[c.id] = c.name;
    return m;
  }, [consultants]);

  const todayKey = toLocalDateKey();

  const items = useMemo(() => {
    const list = (prospects as Prospect[]).filter((p) => !p.is_archived && (p as any).last_touch_layer);
    const scored = list.map((p) => {
      const fu = p.next_follow_up_date || p.next_step_date || null;
      const days = fu ? differenceInCalendarDays(parseISO(fu), parseISO(todayKey)) : null;
      const parked = days === null || days > 7;
      return { p, fu, days, parked };
    });
    scored.sort((a, b) => {
      if (a.parked !== b.parked) return a.parked ? 1 : -1;
      if (a.fu && b.fu) return a.fu.localeCompare(b.fu);
      if (a.fu) return -1;
      if (b.fu) return 1;
      return a.p.name.localeCompare(b.p.name);
    });
    return scored;
  }, [prospects, todayKey]);

  const notNowMut = useMutation({
    mutationFn: async (id: string) => {
      const date = format(addDays(new Date(), 90), "yyyy-MM-dd");
      const { error } = await supabase.from("prospects" as any)
        .update({ next_follow_up_date: date, updated_at: new Date().toISOString() } as any)
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["prospects"] }); toast.success("Parked for 90 days"); },
    onError: (e: any) => toast.error(e?.message || "Failed"),
  });

  const archiveMut = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("prospects" as any)
        .update({ is_archived: true, opportunity_status: "Not Interested", updated_at: new Date().toISOString() } as any)
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["prospects"] }); toast.success("Archived"); },
    onError: (e: any) => toast.error(e?.message || "Failed"),
  });

  const joinedMut = useMutation({
    mutationFn: async (p: Prospect) => convertProspectToConsultant(p),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["prospects"] });
      qc.invalidateQueries({ queryKey: ["team-consultants"] });
      toast.success("Converted to consultant! 🎉");
    },
    onError: (e: any) => toast.error(e?.message || "Failed"),
  });

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <p className="text-sm text-muted-foreground">
          {items.filter(i => !i.parked).length} due · {items.filter(i => i.parked).length} parked
        </p>
        <Button size="sm" onClick={() => setDialogState({ open: true })}>
          <MessageSquare className="w-4 h-4 mr-1" /> Log Career Chat
        </Button>
      </div>

      {isLoading ? (
        <div className="flex items-center justify-center py-20">
          <div className="w-6 h-6 border-2 border-primary border-t-transparent rounded-full animate-spin" />
        </div>
      ) : items.length === 0 ? (
        <p className="text-center text-muted-foreground py-12">No career chats yet. Tap "Log Career Chat" to start.</p>
      ) : (
        <div className="space-y-2">
          {items.map(({ p, fu, days, parked }) => {
            const isUnit = (p as any).ownership_type === "unit";
            const consultantName = p.assigned_consultant_id ? consultantMap[p.assigned_consultant_id] : null;
            const lastLayer = (p as any).last_touch_layer as string | null | undefined;
            const nextLayer = (p as any).next_touch_layer as string | null | undefined;
            const isBoldAsk = lastLayer === BOLD_ASK;

            return (
              <Card
                key={p.id}
                className={cn(
                  "border-border/50 shadow-sm transition-opacity",
                  parked && "opacity-60",
                  !parked && days !== null && days < 0 && "border-destructive/40 bg-destructive/5",
                  !parked && days === 0 && "border-primary/40 bg-primary/5",
                )}
              >
                <CardContent className="p-3">
                  <div className="flex items-start gap-3">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <button
                          className="text-sm font-semibold text-foreground hover:underline truncate"
                          onClick={() => navigate(`/prospects/${p.id}`)}
                        >
                          {p.name}
                        </button>
                        {isUnit ? (
                          <Badge variant="secondary" className="text-[10px] shrink-0 bg-indigo-50 text-indigo-700 dark:bg-indigo-950/40 dark:text-indigo-300">
                            <Users className="w-2.5 h-2.5 mr-0.5" />
                            Unit{consultantName ? ` · ${consultantName}` : ""}
                          </Badge>
                        ) : (
                          <Badge variant="secondary" className="text-[10px] shrink-0">
                            <User className="w-2.5 h-2.5 mr-0.5" />Personal
                          </Badge>
                        )}
                        {(p as any).interest_level && (
                          <Badge variant="outline" className="text-[10px] shrink-0">
                            Interest {(p as any).interest_level}/10
                          </Badge>
                        )}
                      </div>

                      <div className="flex items-center gap-3 mt-1 flex-wrap text-xs">
                        {lastLayer && (
                          <span className="text-muted-foreground">
                            Last: <span className="text-foreground font-medium">{lastLayer}</span>
                          </span>
                        )}
                        {nextLayer && (
                          <span className="text-muted-foreground">
                            Next: <span className="text-foreground font-medium">{nextLayer}</span>
                          </span>
                        )}
                        {fu && (
                          <span className={cn(
                            "flex items-center gap-1",
                            days !== null && days < 0 && !parked && "text-destructive font-medium",
                            days === 0 && !parked && "text-primary font-medium",
                            parked && "text-muted-foreground",
                          )}>
                            <Clock className="w-3 h-3" />
                            {formatDateOnly(fu, "MMM d")}
                          </span>
                        )}
                      </div>

                      <div className="flex items-center gap-1.5 mt-2 flex-wrap">
                        <Button
                          size="sm"
                          variant="default"
                          className="h-7 text-xs"
                          onClick={() => setDialogState({ open: true, prospectId: p.id })}
                        >
                          Log touch
                        </Button>
                        {isBoldAsk ? (
                          <>
                            <Button
                              size="sm"
                              variant="outline"
                              className="h-7 text-xs border-emerald-300 text-emerald-700 hover:bg-emerald-50"
                              disabled={joinedMut.isPending}
                              onClick={() => joinedMut.mutate(p)}
                            >
                              Joined
                            </Button>
                            <Button
                              size="sm"
                              variant="outline"
                              className="h-7 text-xs"
                              disabled={archiveMut.isPending}
                              onClick={() => archiveMut.mutate(p.id)}
                            >
                              Not interested
                            </Button>
                          </>
                        ) : (
                          <Button
                            size="sm"
                            variant="ghost"
                            className="h-7 text-xs"
                            disabled={notNowMut.isPending}
                            onClick={() => notNowMut.mutate(p.id)}
                          >
                            Not now (+90d)
                          </Button>
                        )}
                        <Button
                          size="sm"
                          variant="ghost"
                          className="h-7 w-7 p-0 text-muted-foreground"
                          title="Open full profile"
                          onClick={() => navigate(`/prospects/${p.id}`)}
                        >
                          <MoreHorizontal className="w-4 h-4" />
                        </Button>
                      </div>
                    </div>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      <QuickCareerChatDialog
        open={dialogState.open}
        onOpenChange={(v) => { if (!v) setDialogState({ open: false }); }}
        onLogged={() => qc.invalidateQueries({ queryKey: ["prospects"] })}
        initialProspectId={dialogState.prospectId}
        initialLastTouch={dialogState.lastTouch}
      />
    </div>
  );
}
