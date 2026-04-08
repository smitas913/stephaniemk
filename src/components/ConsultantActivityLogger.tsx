import { useState, useCallback } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { createNote, updateTeamConsultant, fetchAllLatestNotes } from "@/lib/queries";
import { toLocalDateKey, formatDateOnly } from "@/lib/dateOnly";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { Separator } from "@/components/ui/separator";
import { cn } from "@/lib/utils";
import {
  Phone, MessageSquare, Users, Mail, Calendar,
  ArrowRight, CalendarCheck, CheckCircle2,
} from "lucide-react";
import { format, addDays } from "date-fns";
import { toast } from "sonner";

const QUICK_ACTIONS = [
  { key: "Text", label: "Texted", icon: MessageSquare, emoji: "💬" },
  { key: "Call", label: "Called", icon: Phone, emoji: "📞" },
  { key: "In Person", label: "Spoke", icon: Users, emoji: "🤝" },
  { key: "Email", label: "Emailed", icon: Mail, emoji: "📧" },
  { key: "Did Not Connect", label: "No Response", icon: Phone, emoji: "📵" },
] as const;

const WHATS_NEXT_OPTIONS = [
  { key: "tomorrow", label: "Try again tomorrow", icon: ArrowRight },
  { key: "next-week", label: "Move to next week", icon: CalendarCheck },
  { key: "schedule", label: "Schedule a date", icon: Calendar },
  { key: "none", label: "No follow-up needed", icon: CheckCircle2 },
] as const;

interface Props {
  consultantId: string;
  consultantName: string;
}

export default function ConsultantActivityLogger({ consultantId, consultantName }: Props) {
  const queryClient = useQueryClient();
  const [selectedAction, setSelectedAction] = useState<string | null>(null);
  const [noteText, setNoteText] = useState("");
  const [nextOption, setNextOption] = useState<string | null>(null);
  const [customDate, setCustomDate] = useState("");

  // Fetch recent activity for this consultant
  const { data: unifiedNotes = [] } = useQuery({
    queryKey: ["unified-notes"],
    queryFn: fetchAllLatestNotes,
  });

  const recentActivity = unifiedNotes
    .filter((n: any) => n.entity_type === "Consultant" && n.note_body?.includes(consultantName))
    .slice(0, 5);

  const logMutation = useMutation({
    mutationFn: async ({ action, note, nextFollowUpDate }: {
      action: string;
      note: string;
      nextFollowUpDate: string | null;
    }) => {
      // 1. Create centralized activity note — include consultant name for identity resolution
      const consultantNoteBody = note.trim()
        ? `[${consultantName}] ${note.trim()}`
        : `[${consultantName}] ${action} coaching`;
      await createNote({
        entity_type: "Consultant",
        note_body: consultantNoteBody,
        note_type: action,
        next_follow_up_date: nextFollowUpDate,
        is_booking_attempt: false,
        is_follow_up: false, // consultant activity counts under coaching, not follow-ups
      });

      // 2. Update consultant's next coaching date if provided
      if (nextFollowUpDate) {
        await updateTeamConsultant(consultantId, { next_coaching_date: nextFollowUpDate } as any);
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["unified-notes"] });
      queryClient.invalidateQueries({ queryKey: ["all-notes"] });
      queryClient.invalidateQueries({ queryKey: ["team-consultants"] });
      queryClient.invalidateQueries({ queryKey: ["focus-daily-progress"] });
      setSelectedAction(null);
      setNoteText("");
      setNextOption(null);
      setCustomDate("");
      toast.success("Activity logged!");
    },
    onError: (err: Error) => toast.error(err.message),
  });

  const handleLog = useCallback(() => {
    if (!selectedAction) {
      toast.error("Please select an action first");
      return;
    }

    let nextDate: string | null = null;
    if (nextOption === "tomorrow") nextDate = format(addDays(new Date(), 1), "yyyy-MM-dd");
    else if (nextOption === "next-week") nextDate = format(addDays(new Date(), 7), "yyyy-MM-dd");
    else if (nextOption === "schedule" && customDate) nextDate = customDate;

    logMutation.mutate({
      action: selectedAction,
      note: noteText,
      nextFollowUpDate: nextDate,
    });
  }, [selectedAction, noteText, nextOption, customDate, logMutation]);

  return (
    <div className="space-y-4">
      {/* Recent Activity (read-only) */}
      {recentActivity.length > 0 && (
        <div className="space-y-1.5">
          <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Recent Activity</p>
          <div className="space-y-1 rounded-lg border border-border bg-muted/30 p-2.5">
            {recentActivity.map((note: any, i: number) => (
              <div key={i} className="flex items-start gap-2 text-xs">
                <span className="text-muted-foreground whitespace-nowrap shrink-0">
                  {note.note_date ? formatDateOnly(note.note_date, "MMM d") : ""}
                </span>
                <span className="text-muted-foreground">—</span>
                <span className="font-medium text-foreground shrink-0">{note.note_type || "Note"}</span>
                {note.note_body && (
                  <>
                    <span className="text-muted-foreground">—</span>
                    <span className="text-muted-foreground truncate">{(note.note_body || "").slice(0, 80)}</span>
                  </>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      <Separator />

      {/* Log Activity Section */}
      <div className="space-y-3">
        <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Log Activity</p>

        {/* Quick Action Buttons */}
        <div className="grid grid-cols-2 gap-2">
          {QUICK_ACTIONS.map((action) => (
            <button
              key={action.key}
              type="button"
              onClick={() => setSelectedAction(action.key)}
              className={cn(
                "flex items-center gap-2 px-3 py-2.5 rounded-xl border-2 text-sm font-medium transition-all",
                selectedAction === action.key
                  ? "border-primary bg-primary/5 ring-1 ring-primary/20"
                  : "border-border bg-card hover:border-primary hover:bg-primary/5",
                "active:scale-[0.97]"
              )}
            >
              <span className="text-base">{action.emoji}</span>
              {action.label}
            </button>
          ))}
        </div>

        {/* Note Input */}
        <div className="space-y-1.5">
          <label className="text-xs font-medium text-muted-foreground">Note (optional)</label>
          <Textarea
            placeholder="Add note from today..."
            value={noteText}
            onChange={(e) => setNoteText(e.target.value)}
            className="min-h-[50px]"
          />
        </div>

        {/* What's Next */}
        <div className="space-y-2">
          <p className="text-xs font-medium text-muted-foreground">What's next?</p>
          <div className="space-y-1.5">
            {WHATS_NEXT_OPTIONS.map((option) => {
              const isSelected = nextOption === option.key;
              return (
                <button
                  key={option.key}
                  type="button"
                  onClick={() => setNextOption(option.key)}
                  className={cn(
                    "w-full flex items-center gap-3 px-3 py-2.5 rounded-xl border transition-all text-left",
                    isSelected
                      ? "border-primary bg-primary/5 ring-1 ring-primary/20"
                      : "border-border bg-card hover:border-primary/50 hover:bg-muted/50",
                    "active:scale-[0.99]"
                  )}
                >
                  <option.icon className={cn("w-4 h-4 shrink-0", isSelected ? "text-primary" : "text-muted-foreground")} />
                  <span className="text-sm font-medium text-foreground">{option.label}</span>
                </button>
              );
            })}
          </div>

          {/* Date picker for "Schedule a date" */}
          {nextOption === "schedule" && (
            <div className="space-y-2 pt-2 pl-2 border-l-2 border-primary/20 ml-2">
              <Input
                type="date"
                value={customDate}
                min={format(new Date(), "yyyy-MM-dd")}
                onChange={(e) => setCustomDate(e.target.value)}
                className="h-9"
                autoFocus
              />
            </div>
          )}
        </div>

        {/* Log Button */}
        <Button
          className="w-full"
          onClick={handleLog}
          disabled={!selectedAction || logMutation.isPending || (nextOption === "schedule" && !customDate)}
        >
          <CheckCircle2 className="w-4 h-4 mr-1.5" />
          {logMutation.isPending ? "Saving..." : "Log Activity"}
        </Button>
      </div>
    </div>
  );
}
