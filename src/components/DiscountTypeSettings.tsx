import { useEffect, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import {
  ensureDefaultDiscountTypes,
  createDiscountType,
  updateDiscountType,
  deleteDiscountType,
  type DiscountType,
} from "@/lib/discountTypes";
import { toast } from "sonner";
import { Tag, Plus, ArrowUp, ArrowDown, Archive, ArchiveRestore, Trash2, Check, X, Pencil } from "lucide-react";

export default function DiscountTypeSettings() {
  const qc = useQueryClient();
  const { data: types = [], refetch, isLoading } = useQuery<DiscountType[]>({
    queryKey: ["discount-types-admin"],
    queryFn: ensureDefaultDiscountTypes,
  });

  const [newName, setNewName] = useState("");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editingName, setEditingName] = useState("");

  const invalidate = () => {
    qc.invalidateQueries({ queryKey: ["discount-types-admin"] });
    qc.invalidateQueries({ queryKey: ["discount-types", { seed: true }] });
    qc.invalidateQueries({ queryKey: ["discount-types", { seed: false }] });
  };

  const handleAdd = async () => {
    const name = newName.trim();
    if (!name) return;
    try {
      const max = types.reduce((m, t) => Math.max(m, t.sort_order), -1);
      await createDiscountType(name, max + 1);
      setNewName("");
      invalidate();
      toast.success("Added");
    } catch (e: any) {
      toast.error(e.message || "Failed to add");
    }
  };

  const startEdit = (t: DiscountType) => {
    setEditingId(t.id);
    setEditingName(t.name);
  };

  const saveEdit = async () => {
    if (!editingId) return;
    const name = editingName.trim();
    if (!name) return;
    try {
      await updateDiscountType(editingId, { name });
      setEditingId(null);
      invalidate();
    } catch (e: any) {
      toast.error(e.message || "Failed to update");
    }
  };

  const move = async (idx: number, dir: -1 | 1) => {
    const target = idx + dir;
    if (target < 0 || target >= types.length) return;
    const a = types[idx];
    const b = types[target];
    try {
      await Promise.all([
        updateDiscountType(a.id, { sort_order: b.sort_order }),
        updateDiscountType(b.id, { sort_order: a.sort_order }),
      ]);
      invalidate();
    } catch (e: any) {
      toast.error(e.message || "Failed to reorder");
    }
  };

  const toggleArchive = async (t: DiscountType) => {
    try {
      await updateDiscountType(t.id, { is_archived: !t.is_archived });
      invalidate();
    } catch (e: any) {
      toast.error(e.message || "Failed");
    }
  };

  const remove = async (t: DiscountType) => {
    if (!confirm(`Delete "${t.name}"? Old orders will keep showing the name only if archived. Prefer Archive.`)) return;
    try {
      await deleteDiscountType(t.id);
      invalidate();
      toast.success("Deleted");
    } catch (e: any) {
      toast.error(e.message || "Failed to delete");
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base flex items-center gap-2">
          <Tag className="w-4 h-4 text-primary" />
          Discount Types
        </CardTitle>
        <p className="text-xs text-muted-foreground">
          Define why discounts get applied. Selectable on each order alongside the discount amount.
          Archived types stay visible on existing orders but are hidden from new ones.
        </p>
      </CardHeader>
      <CardContent className="space-y-3 max-w-xl">
        <div className="flex gap-2">
          <Input
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            placeholder="New discount type name…"
            onKeyDown={(e) => e.key === "Enter" && handleAdd()}
            className="h-9"
          />
          <Button onClick={handleAdd} size="sm">
            <Plus className="w-4 h-4 mr-1" /> Add
          </Button>
        </div>

        {isLoading ? (
          <p className="text-xs text-muted-foreground">Loading…</p>
        ) : (
          <div className="rounded-md border border-border/60 divide-y divide-border/60">
            {types.map((t, i) => (
              <div key={t.id} className="flex items-center gap-2 p-2">
                <div className="flex flex-col">
                  <button
                    type="button"
                    onClick={() => move(i, -1)}
                    disabled={i === 0}
                    className="p-0.5 text-muted-foreground hover:text-foreground disabled:opacity-30"
                    aria-label="Move up"
                  >
                    <ArrowUp className="w-3 h-3" />
                  </button>
                  <button
                    type="button"
                    onClick={() => move(i, 1)}
                    disabled={i === types.length - 1}
                    className="p-0.5 text-muted-foreground hover:text-foreground disabled:opacity-30"
                    aria-label="Move down"
                  >
                    <ArrowDown className="w-3 h-3" />
                  </button>
                </div>
                <div className="flex-1 min-w-0">
                  {editingId === t.id ? (
                    <div className="flex gap-1">
                      <Input
                        value={editingName}
                        onChange={(e) => setEditingName(e.target.value)}
                        onKeyDown={(e) => e.key === "Enter" && saveEdit()}
                        autoFocus
                        className="h-8 text-sm"
                      />
                      <Button size="icon" variant="ghost" onClick={saveEdit} className="h-8 w-8">
                        <Check className="w-4 h-4 text-emerald-600" />
                      </Button>
                      <Button size="icon" variant="ghost" onClick={() => setEditingId(null)} className="h-8 w-8">
                        <X className="w-4 h-4 text-muted-foreground" />
                      </Button>
                    </div>
                  ) : (
                    <div className="flex items-center gap-2">
                      <span className={`text-sm ${t.is_archived ? "text-muted-foreground line-through" : "text-foreground"}`}>
                        {t.name}
                      </span>
                      {t.is_archived && (
                        <span className="text-[10px] uppercase tracking-wider text-muted-foreground">archived</span>
                      )}
                    </div>
                  )}
                </div>
                {editingId !== t.id && (
                  <div className="flex items-center gap-1">
                    <Button size="icon" variant="ghost" onClick={() => startEdit(t)} className="h-8 w-8" aria-label="Rename">
                      <Pencil className="w-3.5 h-3.5" />
                    </Button>
                    <Button
                      size="icon"
                      variant="ghost"
                      onClick={() => toggleArchive(t)}
                      className="h-8 w-8"
                      aria-label={t.is_archived ? "Unarchive" : "Archive"}
                    >
                      {t.is_archived ? <ArchiveRestore className="w-3.5 h-3.5" /> : <Archive className="w-3.5 h-3.5" />}
                    </Button>
                    <Button
                      size="icon"
                      variant="ghost"
                      onClick={() => remove(t)}
                      className="h-8 w-8 text-rose-600 hover:text-rose-700"
                      aria-label="Delete"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </Button>
                  </div>
                )}
              </div>
            ))}
            {types.length === 0 && (
              <p className="p-3 text-xs text-muted-foreground">No discount types yet.</p>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
