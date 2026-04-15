import { useState, useMemo } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import Layout from "@/components/Layout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";
import { SCRIPT_CATEGORIES, MERGE_FIELDS } from "@/lib/scriptCategories";
import {
  Plus, Search, Star, Copy, Pencil, Trash2, X, ChevronDown,
} from "lucide-react";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";

interface Script {
  id: string;
  title: string;
  category: string;
  script_text: string;
  description: string | null;
  tags: string[];
  is_favorite: boolean;
  owner_user_id: string | null;
  created_at: string;
}

export default function Scripts() {
  const { session } = useAuth();
  const qc = useQueryClient();
  const [search, setSearch] = useState("");
  const [categoryFilter, setCategoryFilter] = useState<string>("All");
  const [favOnly, setFavOnly] = useState(false);
  const [editScript, setEditScript] = useState<Script | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [deleteId, setDeleteId] = useState<string | null>(null);

  const { data: scripts = [], isLoading } = useQuery({
    queryKey: ["scripts"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("scripts")
        .select("*")
        .order("is_favorite", { ascending: false })
        .order("updated_at", { ascending: false });
      if (error) throw error;
      return data as Script[];
    },
    enabled: !!session,
  });

  const filtered = useMemo(() => {
    let list = scripts;
    if (favOnly) list = list.filter((s) => s.is_favorite);
    if (categoryFilter !== "All") list = list.filter((s) => s.category === categoryFilter);
    if (search.trim()) {
      const q = search.toLowerCase();
      list = list.filter(
        (s) =>
          s.title.toLowerCase().includes(q) ||
          s.script_text.toLowerCase().includes(q) ||
          s.description?.toLowerCase().includes(q) ||
          s.tags.some((t) => t.toLowerCase().includes(q))
      );
    }
    return list;
  }, [scripts, search, categoryFilter, favOnly]);

  const upsertMutation = useMutation({
    mutationFn: async (script: Partial<Script> & { title: string; script_text: string; category: string }) => {
      const payload = {
        ...script,
        owner_user_id: session!.user.id,
      };
      if (script.id) {
        const { error } = await supabase.from("scripts").update(payload).eq("id", script.id);
        if (error) throw error;
      } else {
        const { error } = await supabase.from("scripts").insert(payload);
        if (error) throw error;
      }
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["scripts"] });
      setShowForm(false);
      setEditScript(null);
      toast({ title: editScript ? "Script updated" : "Script created" });
    },
    onError: (e: Error) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  const toggleFav = useMutation({
    mutationFn: async ({ id, is_favorite }: { id: string; is_favorite: boolean }) => {
      const { error } = await supabase.from("scripts").update({ is_favorite }).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["scripts"] }),
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("scripts").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["scripts"] });
      setDeleteId(null);
      toast({ title: "Script deleted" });
    },
  });

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
    toast({ title: "Copied to clipboard" });
  };

  const openNew = () => { setEditScript(null); setShowForm(true); };
  const openEdit = (s: Script) => { setEditScript(s); setShowForm(true); };

  return (
    <Layout>
      <div className="container py-4 space-y-4 max-w-3xl">
        {/* Header */}
        <div className="flex items-center justify-between gap-2">
          <h1 className="text-xl font-bold text-foreground">Scripts</h1>
          <Button size="sm" onClick={openNew} className="gap-1">
            <Plus className="w-4 h-4" /> New
          </Button>
        </div>

        {/* Search + Filters */}
        <div className="space-y-2">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <Input
              placeholder="Search scripts…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-9"
            />
          </div>
          <div className="flex items-center gap-2 flex-wrap">
            <Select value={categoryFilter} onValueChange={setCategoryFilter}>
              <SelectTrigger className="w-auto min-w-[140px] h-8 text-xs">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="All">All Categories</SelectItem>
                {SCRIPT_CATEGORIES.map((c) => (
                  <SelectItem key={c} value={c}>{c}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Button
              variant={favOnly ? "default" : "outline"}
              size="sm"
              className="h-8 text-xs gap-1"
              onClick={() => setFavOnly(!favOnly)}
            >
              <Star className={cn("w-3.5 h-3.5", favOnly && "fill-current")} />
              Favorites
            </Button>
          </div>
        </div>

        {/* Script list */}
        {isLoading ? (
          <div className="text-center py-8 text-muted-foreground text-sm">Loading…</div>
        ) : filtered.length === 0 ? (
          <div className="text-center py-12 space-y-2">
            <p className="text-muted-foreground text-sm">No scripts found</p>
            <Button variant="outline" size="sm" onClick={openNew}>Create your first script</Button>
          </div>
        ) : (
          <div className="space-y-2">
            {filtered.map((s) => (
              <div key={s.id} className="rounded-xl border border-border bg-card p-3 space-y-1.5">
                <div className="flex items-start gap-2">
                  <button
                    onClick={() => toggleFav.mutate({ id: s.id, is_favorite: !s.is_favorite })}
                    className="mt-0.5 shrink-0"
                  >
                    <Star className={cn("w-4 h-4", s.is_favorite ? "fill-amber-400 text-amber-400" : "text-muted-foreground/40")} />
                  </button>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold text-foreground leading-snug">{s.title}</p>
                    {s.description && (
                      <p className="text-[11px] text-muted-foreground leading-tight mt-0.5">{s.description}</p>
                    )}
                  </div>
                  <div className="flex items-center gap-0.5 shrink-0">
                    <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => copyToClipboard(s.script_text)}>
                      <Copy className="w-3.5 h-3.5 text-primary" />
                    </Button>
                    <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => openEdit(s)}>
                      <Pencil className="w-3.5 h-3.5 text-muted-foreground" />
                    </Button>
                    <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => setDeleteId(s.id)}>
                      <Trash2 className="w-3.5 h-3.5 text-destructive" />
                    </Button>
                  </div>
                </div>
                <div className="flex items-center gap-1.5 flex-wrap">
                  <span className="text-[10px] px-1.5 py-0.5 rounded bg-primary/10 text-primary font-medium">
                    {s.category}
                  </span>
                  {s.tags.map((t) => (
                    <span key={t} className="text-[10px] px-1.5 py-0.5 rounded bg-secondary text-secondary-foreground">
                      {t}
                    </span>
                  ))}
                </div>
                <p className="text-xs text-foreground/80 whitespace-pre-wrap line-clamp-3">
                  {s.script_text}
                </p>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Create / Edit Dialog */}
      <ScriptFormDialog
        open={showForm}
        onOpenChange={(o) => { if (!o) { setShowForm(false); setEditScript(null); } }}
        initial={editScript}
        onSave={(data) => upsertMutation.mutate(data)}
        saving={upsertMutation.isPending}
      />

      {/* Delete Confirmation */}
      <AlertDialog open={!!deleteId} onOpenChange={(o) => !o && setDeleteId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Script?</AlertDialogTitle>
            <AlertDialogDescription>This action cannot be undone.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={() => deleteId && deleteMutation.mutate(deleteId)}>
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </Layout>
  );
}

/* ─── Form Dialog ──────────────────────────────────────────────── */

function ScriptFormDialog({
  open, onOpenChange, initial, onSave, saving,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  initial: Script | null;
  onSave: (data: Partial<Script> & { title: string; script_text: string; category: string }) => void;
  saving: boolean;
}) {
  const [title, setTitle] = useState("");
  const [category, setCategory] = useState<string>(SCRIPT_CATEGORIES[0]);
  const [scriptText, setScriptText] = useState("");
  const [description, setDescription] = useState("");
  const [tagsInput, setTagsInput] = useState("");

  // Reset form when opened
  const handleOpen = (o: boolean) => {
    if (o) {
      setTitle(initial?.title ?? "");
      setCategory(initial?.category ?? SCRIPT_CATEGORIES[0]);
      setScriptText(initial?.script_text ?? "");
      setDescription(initial?.description ?? "");
      setTagsInput(initial?.tags?.join(", ") ?? "");
    }
    onOpenChange(o);
  };

  const handleSubmit = () => {
    if (!title.trim() || !scriptText.trim()) return;
    const tags = tagsInput.split(",").map((t) => t.trim()).filter(Boolean);
    onSave({
      ...(initial ? { id: initial.id } : {}),
      title: title.trim(),
      category,
      script_text: scriptText,
      description: description.trim() || null,
      tags,
    });
  };

  const insertMergeField = (field: string) => {
    setScriptText((prev) => prev + field);
  };

  return (
    <Dialog open={open} onOpenChange={handleOpen}>
      <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{initial ? "Edit Script" : "New Script"}</DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <Input placeholder="Title" value={title} onChange={(e) => setTitle(e.target.value)} />
          <Select value={category} onValueChange={setCategory}>
            <SelectTrigger className="w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {SCRIPT_CATEGORIES.map((c) => (
                <SelectItem key={c} value={c}>{c}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Input
            placeholder="Short description (optional)"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
          />
          <div>
            <Textarea
              placeholder="Script text…"
              value={scriptText}
              onChange={(e) => setScriptText(e.target.value)}
              rows={6}
            />
            <div className="flex items-center gap-1 mt-1 flex-wrap">
              <span className="text-[10px] text-muted-foreground mr-1">Merge:</span>
              {MERGE_FIELDS.map((f) => (
                <button
                  key={f}
                  type="button"
                  className="text-[10px] px-1.5 py-0.5 rounded bg-secondary text-secondary-foreground hover:bg-accent transition-colors"
                  onClick={() => insertMergeField(f)}
                >
                  {f}
                </button>
              ))}
            </div>
          </div>
          <Input
            placeholder="Tags (comma separated)"
            value={tagsInput}
            onChange={(e) => setTagsInput(e.target.value)}
          />
          <div className="flex gap-2 justify-end pt-2">
            <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
            <Button onClick={handleSubmit} disabled={saving || !title.trim() || !scriptText.trim()}>
              {saving ? "Saving…" : initial ? "Update" : "Create"}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
