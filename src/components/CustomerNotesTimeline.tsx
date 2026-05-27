import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { fetchNotes, createNote, deleteNote, updateNote, fetchCustomer } from "@/lib/queries";
import { resolveLongTermFollowUpDate } from "@/lib/longTermFollowUp";
import { NOTE_TYPES } from "@/lib/types";
import type { Note } from "@/lib/types";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger, DropdownMenuSeparator, DropdownMenuLabel,
} from "@/components/ui/dropdown-menu";
import { Plus, Trash2, Phone, Mail, MessageSquare, Calendar, RefreshCw, FileText, Users, Briefcase, Pencil, Check, X, MoreVertical, CheckCircle2, XCircle, CircleDashed } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

const NOTE_TYPE_ICONS: Record<string, React.ElementType> = {
  Call: Phone,
  Text: MessageSquare,
  Email: Mail,
  "In Person": Calendar,
  "Follow-Up": RefreshCw,
  Other: FileText,
};

const NOTE_TYPE_COLORS: Record<string, string> = {
  Call: "bg-blue-100 text-blue-700",
  Text: "bg-green-100 text-green-700",
  Email: "bg-purple-100 text-purple-700",
  "In Person": "bg-orange-100 text-orange-700",
  "Follow-Up": "bg-yellow-100 text-yellow-700",
  Other: "bg-accent text-accent-foreground",
};

// result_type — surfaced as a distinct activity badge so Face / Career Chat /
// Booking Conversation logs are visually obvious in the timeline.
const RESULT_TYPE_META: Record<string, { icon: any; color: string; emoji: string }> = {
  "Face": { icon: Users, color: "bg-pink-100 text-pink-700", emoji: "👤" },
  "Career Chat": { icon: Briefcase, color: "bg-violet-100 text-violet-700", emoji: "💬" },
  "Booking Conversation": { icon: Calendar, color: "bg-amber-100 text-amber-700", emoji: "📅" },
};

export default function CustomerNotesTimeline({ customerId }: { customerId: string }) {
  const queryClient = useQueryClient();
  const [showForm, setShowForm] = useState(false);
  const [noteText, setNoteText] = useState("");
  const [noteType, setNoteType] = useState<string>("Call");
  const [nextFollowUp, setNextFollowUp] = useState("");

  const { data: rawNotes = [] } = useQuery({
    queryKey: ["customer-notes-unified", customerId],
    queryFn: () => fetchNotes("Customer", customerId),
  });

  // Always show newest first. Sort by created_at desc (most reliable timestamp),
  // falling back to note_date for legacy rows that lack created_at.
  const notes = [...rawNotes].sort((a: any, b: any) => {
    const aKey = a.created_at || a.note_date || "";
    const bKey = b.created_at || b.note_date || "";
    return bKey.localeCompare(aKey);
  });

  const addMutation = useMutation({
    mutationFn: async () => {
      // Default to +75d long-term touch when user leaves follow-up blank,
      // unless a sooner pending follow-up already exists (preserve priority).
      // Skipped / dismissal note types are excluded — they have their own defer rules.
      let resolvedFollowUp: string | null = nextFollowUp || null;
      const isDismissal = noteType === "Skipped" || noteType === "No Follow-Up Needed";
      if (!resolvedFollowUp && !isDismissal) {
        const customer = await fetchCustomer(customerId).catch(() => null);
        resolvedFollowUp = resolveLongTermFollowUpDate(customer?.next_follow_up_date ?? null);
      }
      return createNote({
        entity_type: "Customer",
        customer_id: customerId,
        note_body: noteText.trim(),
        note_type: noteType,
        next_follow_up_date: resolvedFollowUp,
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["customer-notes-unified", customerId] });
      queryClient.invalidateQueries({ queryKey: ["customer", customerId] });
      queryClient.invalidateQueries({ queryKey: ["customers"] });
      queryClient.invalidateQueries({ queryKey: ["follow-up-queue"] });
      setNoteText("");
      setNoteType("Call");
      setNextFollowUp("");
      setShowForm(false);
      toast.success("Note saved — Last Contacted updated");
    },
    onError: (err: any) => {
      toast.error(`Failed to save note: ${err.message || "Unknown error"}`);
    },
  });

  const deleteMutation = useMutation({
    mutationFn: deleteNote,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["customer-notes-unified", customerId] });
      queryClient.invalidateQueries({ queryKey: ["customer-unified-notes", customerId] });
      queryClient.invalidateQueries({ queryKey: ["customer", customerId] });
      queryClient.invalidateQueries({ queryKey: ["customers"] });
      queryClient.invalidateQueries({ queryKey: ["follow-up-queue"] });
      queryClient.invalidateQueries({ queryKey: ["unified-notes"] });
      toast.success("Activity fully deleted");
    },
  });

  const editMutation = useMutation({
    mutationFn: ({ id, ...updates }: { id: string; note_body?: string; note_date?: string; next_follow_up_date?: string | null }) =>
      updateNote(id, updates),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["customer-notes-unified", customerId] });
      queryClient.invalidateQueries({ queryKey: ["customer", customerId] });
      toast.success("Activity updated");
    },
    onError: (err: any) => toast.error(`Failed to update: ${err.message || "Unknown error"}`),
  });

  const handleSubmit = () => {
    if (!noteText.trim()) return;
    addMutation.mutate();
  };

  return (
    <Card className="border-border/50 shadow-sm">
      <CardHeader className="flex flex-row items-center justify-between pb-2">
        <CardTitle className="text-base">Activity Timeline ({notes.length})</CardTitle>
        <Button size="sm" variant={showForm ? "outline" : "default"} className="text-xs gap-1" onClick={() => setShowForm(!showForm)}>
          <Plus className="w-3 h-3" />{showForm ? "Cancel" : "Add Note"}
        </Button>
      </CardHeader>
      <CardContent>
        {showForm && (
          <div className="mb-4 p-4 rounded-lg bg-primary/5 border-2 border-primary/20 space-y-3">
            <p className="text-sm font-semibold text-foreground">Add Note</p>

            {/* Type pills */}
            <div>
              <label className="text-xs font-medium text-muted-foreground mb-1 block">Type</label>
              <div className="flex flex-wrap gap-1.5">
                {NOTE_TYPES.map((t) => {
                  const Icon = NOTE_TYPE_ICONS[t] || FileText;
                  return (
                    <button
                      key={t}
                      type="button"
                      onClick={() => setNoteType(t)}
                      className={cn(
                        "h-8 px-3 rounded-md text-xs font-medium border transition-colors flex items-center gap-1.5",
                        noteType === t
                          ? "bg-primary text-primary-foreground border-primary"
                          : "border-border bg-background text-muted-foreground hover:bg-muted"
                      )}
                    >
                      <Icon className="w-3 h-3" />
                      {t}
                    </button>
                  );
                })}
              </div>
            </div>

            <div>
              <label className="text-xs font-medium text-muted-foreground mb-1 block">Note *</label>
              <Textarea
                placeholder="What happened in this interaction..."
                value={noteText}
                onChange={(e) => setNoteText(e.target.value)}
                className="min-h-[80px]"
                autoFocus
              />
            </div>

            <div>
              <label className="text-xs font-medium text-muted-foreground mb-1 block">
                Next Follow-Up Date <span className="font-normal">(optional)</span>
              </label>
              <Input
                type="date"
                value={nextFollowUp}
                min={new Date().toISOString().split("T")[0]}
                onChange={(e) => setNextFollowUp(e.target.value)}
                className="h-9 max-w-[200px]"
              />
            </div>

            <Button size="sm" onClick={handleSubmit} disabled={addMutation.isPending || !noteText.trim()}>
              {addMutation.isPending ? "Saving..." : "Save Note"}
            </Button>
          </div>
        )}

        {notes.length === 0 ? (
          <p className="text-center text-muted-foreground py-6">No notes yet</p>
        ) : (
          <div className="relative">
            <div className="absolute left-4 top-0 bottom-0 w-px bg-border" />
            <div className="space-y-3">
              {notes.map((note, idx) => (
                <NoteItem
                  key={note.id}
                  note={note}
                  isLatest={idx === 0}
                  onDelete={() => deleteMutation.mutate(note.id)}
                  onSaveEdit={(updates) => editMutation.mutate({ id: note.id, ...updates })}
                  isSaving={editMutation.isPending}
                />
              ))}
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function NoteItem({
  note,
  onDelete,
  onSaveEdit,
  isSaving,
  isLatest = false,
}: {
  note: Note;
  onDelete: () => void;
  onSaveEdit: (updates: { note_body?: string; note_date?: string; next_follow_up_date?: string | null }) => void;
  isSaving?: boolean;
  isLatest?: boolean;
}) {
  const resultMeta = note.result_type ? RESULT_TYPE_META[note.result_type] : null;
  const Icon = resultMeta?.icon || NOTE_TYPE_ICONS[note.note_type] || FileText;
  const colors = resultMeta?.color || NOTE_TYPE_COLORS[note.note_type] || NOTE_TYPE_COLORS.Other;

  const [editing, setEditing] = useState(false);
  const [body, setBody] = useState(note.note_body || "");
  const [date, setDate] = useState(note.note_date || "");
  const [followUp, setFollowUp] = useState(note.next_follow_up_date || "");

  const handleSave = () => {
    if (!body.trim()) {
      toast.error("Note text required");
      return;
    }
    onSaveEdit({
      note_body: body.trim(),
      note_date: date,
      next_follow_up_date: followUp || null,
    });
    setEditing(false);
  };

  return (
    <div className="relative pl-9 group">
      <div className={cn("absolute left-2 top-1 w-5 h-5 rounded-full flex items-center justify-center z-10", colors)}>
        <Icon className="w-3 h-3" />
      </div>
      <div className={cn(
        "p-3 rounded-lg border",
        isLatest ? "bg-primary/5 border-primary/30 ring-1 ring-primary/10" : "bg-muted/40 border-border/50"
      )}>
        <div className="flex items-start justify-between gap-2">
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 mb-1 flex-wrap">
              {note.result_type && (
                <span className={cn("text-[11px] px-1.5 py-0.5 rounded font-semibold", colors)}>
                  {resultMeta?.emoji} {note.result_type}
                </span>
              )}
              <span className={cn("text-[11px] px-1.5 py-0.5 rounded font-medium",
                note.result_type ? "bg-muted text-muted-foreground" : colors)}>
                {note.note_type}
              </span>
              {isLatest && (
                <span className="text-[10px] px-1.5 py-0.5 rounded bg-primary text-primary-foreground font-semibold uppercase tracking-wide">Latest</span>
              )}
              <span className="text-[11px] text-muted-foreground">
                {new Date(note.note_date + "T00:00:00").toLocaleDateString()}
              </span>
              {note.next_follow_up_date && !editing && (
                <span className="text-[11px] text-primary font-medium">
                  → Follow-up: {new Date(note.next_follow_up_date + "T00:00:00").toLocaleDateString()}
                </span>
              )}
            </div>

            {editing ? (
              <div className="space-y-2 mt-2">
                <Textarea
                  value={body}
                  onChange={(e) => setBody(e.target.value)}
                  className="min-h-[70px] text-sm"
                  autoFocus
                />
                <div className="flex flex-wrap gap-2">
                  <div className="flex-1 min-w-[140px]">
                    <label className="text-[10px] font-medium text-muted-foreground block mb-0.5">Date</label>
                    <Input
                      type="date"
                      value={date}
                      onChange={(e) => setDate(e.target.value)}
                      className="h-8 text-xs"
                    />
                  </div>
                  <div className="flex-1 min-w-[140px]">
                    <label className="text-[10px] font-medium text-muted-foreground block mb-0.5">Follow-up</label>
                    <Input
                      type="date"
                      value={followUp}
                      onChange={(e) => setFollowUp(e.target.value)}
                      className="h-8 text-xs"
                    />
                  </div>
                </div>
                <div className="flex gap-1.5">
                  <Button size="sm" className="h-7 text-xs gap-1" onClick={handleSave} disabled={isSaving}>
                    <Check className="w-3 h-3" />Save
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    className="h-7 text-xs gap-1"
                    onClick={() => {
                      setEditing(false);
                      setBody(note.note_body || "");
                      setDate(note.note_date || "");
                      setFollowUp(note.next_follow_up_date || "");
                    }}
                  >
                    <X className="w-3 h-3" />Cancel
                  </Button>
                </div>
              </div>
            ) : (
              <p className="text-sm text-foreground whitespace-pre-wrap">{note.note_body}</p>
            )}
          </div>
          {!editing && (
            <div className="flex items-center gap-0.5 opacity-0 group-hover:opacity-100 focus-within:opacity-100 transition-opacity shrink-0">
              <Button
                variant="ghost"
                size="icon"
                className="h-6 w-6"
                onClick={() => setEditing(true)}
                title="Edit"
              >
                <Pencil className="w-3 h-3 text-muted-foreground" />
              </Button>
              <Button
                variant="ghost"
                size="icon"
                className="h-6 w-6"
                onClick={onDelete}
                title="Delete"
              >
                <Trash2 className="w-3 h-3 text-destructive" />
              </Button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
