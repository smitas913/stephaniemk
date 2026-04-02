import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { fetchCustomerNotes, createCustomerNote, deleteCustomerNote } from "@/lib/queries";
import { NOTE_TYPES } from "@/lib/types";
import type { CustomerNote } from "@/lib/types";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Plus, Trash2, Phone, Mail, MessageSquare, Calendar, RefreshCw, FileText } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

const NOTE_TYPE_ICONS: Record<string, React.ElementType> = {
  Call: Phone,
  Text: MessageSquare,
  Email: Mail,
  Appointment: Calendar,
  "Follow-Up": RefreshCw,
  General: FileText,
};

const NOTE_TYPE_COLORS: Record<string, string> = {
  Call: "bg-blue-100 text-blue-700",
  Text: "bg-green-100 text-green-700",
  Email: "bg-purple-100 text-purple-700",
  Appointment: "bg-orange-100 text-orange-700",
  "Follow-Up": "bg-yellow-100 text-yellow-700",
  General: "bg-accent text-accent-foreground",
};

export default function CustomerNotesTimeline({ customerId }: { customerId: string }) {
  const queryClient = useQueryClient();
  const [showForm, setShowForm] = useState(false);
  const [noteText, setNoteText] = useState("");
  const [noteType, setNoteType] = useState<string>("General");

  const { data: notes = [] } = useQuery({
    queryKey: ["customer-notes", customerId],
    queryFn: () => fetchCustomerNotes(customerId),
  });

  const addMutation = useMutation({
    mutationFn: createCustomerNote,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["customer-notes", customerId] });
      queryClient.invalidateQueries({ queryKey: ["all-notes"] });
      setNoteText("");
      setNoteType("General");
      setShowForm(false);
      toast.success("Note added");
    },
  });

  const deleteMutation = useMutation({
    mutationFn: deleteCustomerNote,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["customer-notes", customerId] });
      queryClient.invalidateQueries({ queryKey: ["all-notes"] });
      toast.success("Note deleted");
    },
  });

  const handleSubmit = () => {
    if (!noteText.trim()) return;
    addMutation.mutate({ customer_id: customerId, note_text: noteText.trim(), note_type: noteType });
  };

  return (
    <Card className="border-border/50 shadow-sm">
      <CardHeader className="flex flex-row items-center justify-between pb-2">
        <CardTitle className="text-base">Notes & Activity ({notes.length})</CardTitle>
        <Button size="sm" variant="ghost" className="text-primary text-xs" onClick={() => setShowForm(!showForm)}>
          <Plus className="w-3 h-3 mr-1" />{showForm ? "Cancel" : "Add Note"}
        </Button>
      </CardHeader>
      <CardContent>
        {showForm && (
          <div className="mb-4 p-3 rounded-lg bg-muted/40 border border-border/50 space-y-2">
            <div className="flex gap-2">
              <Select value={noteType} onValueChange={setNoteType}>
                <SelectTrigger className="w-[140px] h-9">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {NOTE_TYPES.map((t) => (
                    <SelectItem key={t} value={t}>{t}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Button size="sm" onClick={handleSubmit} disabled={addMutation.isPending || !noteText.trim()}>
                {addMutation.isPending ? "Saving..." : "Save"}
              </Button>
            </div>
            <Textarea
              placeholder="Enter note..."
              value={noteText}
              onChange={(e) => setNoteText(e.target.value)}
              className="min-h-[80px]"
              autoFocus
            />
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

function NoteItem({ note, onDelete }: { note: CustomerNote; onDelete: () => void }) {
  const Icon = NOTE_TYPE_ICONS[note.note_type] || FileText;
  const colors = NOTE_TYPE_COLORS[note.note_type] || NOTE_TYPE_COLORS.General;

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
                {new Date(note.created_at).toLocaleDateString()} {new Date(note.created_at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
              </span>
            </div>
            <p className="text-sm text-foreground whitespace-pre-wrap">{note.note_text}</p>
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
