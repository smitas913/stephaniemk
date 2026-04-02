import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { fetchNotes, createNote, deleteNote } from "@/lib/queries";
import { NOTE_TYPES } from "@/lib/types";
import type { Note } from "@/lib/types";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Plus, Trash2, Phone, Mail, MessageSquare, Calendar, RefreshCw, FileText } from "lucide-react";
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

export default function CustomerNotesTimeline({ customerId }: { customerId: string }) {
  const queryClient = useQueryClient();
  const [showForm, setShowForm] = useState(false);
  const [noteText, setNoteText] = useState("");
  const [noteType, setNoteType] = useState<string>("Call");
  const [nextFollowUp, setNextFollowUp] = useState("");

  const { data: notes = [] } = useQuery({
    queryKey: ["customer-notes-unified", customerId],
    queryFn: () => fetchNotes("Customer", customerId),
  });

  const addMutation = useMutation({
    mutationFn: () =>
      createNote({
        entity_type: "Customer",
        customer_id: customerId,
        note_body: noteText.trim(),
        note_type: noteType,
        next_follow_up_date: nextFollowUp || null,
      }),
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
      toast.success("Note deleted");
    },
  });

  const handleSubmit = () => {
    if (!noteText.trim()) return;
    addMutation.mutate();
  };

  return (
    <Card className="border-border/50 shadow-sm">
      <CardHeader className="flex flex-row items-center justify-between pb-2">
        <CardTitle className="text-base">Notes & Activity ({notes.length})</CardTitle>
        <Button size="sm" variant={showForm ? "outline" : "default"} className="text-xs gap-1" onClick={() => setShowForm(!showForm)}>
          <Plus className="w-3 h-3" />{showForm ? "Cancel" : "Add Note"}
        </Button>
      </CardHeader>
      <CardContent>
        {showForm && (
          <div className="mb-4 p-4 rounded-lg bg-primary/5 border-2 border-primary/20 space-y-3">
            <p className="text-sm font-semibold text-foreground">Log Contact</p>

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
              {addMutation.isPending ? "Saving..." : "Save & Update Last Contacted"}
            </Button>
          </div>
        )}

        {notes.length === 0 ? (
          <p className="text-center text-muted-foreground py-6">No notes yet</p>
        ) : (
          <div className="relative">
            <div className="absolute left-4 top-0 bottom-0 w-px bg-border" />
            <div className="space-y-3">
              {notes.map((note) => (
                <NoteItem key={note.id} note={note} onDelete={() => deleteMutation.mutate(note.id)} />
              ))}
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function NoteItem({ note, onDelete }: { note: Note; onDelete: () => void }) {
  const Icon = NOTE_TYPE_ICONS[note.note_type] || FileText;
  const colors = NOTE_TYPE_COLORS[note.note_type] || NOTE_TYPE_COLORS.Other;

  return (
    <div className="relative pl-9 group">
      <div className={cn("absolute left-2 top-1 w-5 h-5 rounded-full flex items-center justify-center z-10", colors)}>
        <Icon className="w-3 h-3" />
      </div>
      <div className="p-3 rounded-lg bg-muted/40 border border-border/50">
        <div className="flex items-start justify-between gap-2">
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 mb-1">
              <span className={cn("text-[11px] px-1.5 py-0.5 rounded font-medium", colors)}>{note.note_type}</span>
              <span className="text-[11px] text-muted-foreground">
                {new Date(note.note_date + "T00:00:00").toLocaleDateString()}
              </span>
              {note.next_follow_up_date && (
                <span className="text-[11px] text-primary font-medium">
                  → Follow-up: {new Date(note.next_follow_up_date + "T00:00:00").toLocaleDateString()}
                </span>
              )}
            </div>
            <p className="text-sm text-foreground whitespace-pre-wrap">{note.note_body}</p>
          </div>
          <Button
            variant="ghost"
            size="icon"
            className="h-6 w-6 opacity-0 group-hover:opacity-100 transition-opacity shrink-0"
            onClick={onDelete}
          >
            <Trash2 className="w-3 h-3 text-destructive" />
          </Button>
        </div>
      </div>
    </div>
  );
}
