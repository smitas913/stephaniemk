import { useState, useEffect, useMemo, useCallback } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { cn } from "@/lib/utils";
import { Star, Pencil, ArrowUp, ArrowDown, RotateCcw, Plus, Minus, Check, Zap } from "lucide-react";
import { useFocusItems, DEFAULT_FOCUS_ITEMS } from "@/hooks/useFocusItems";
import type { FocusItemConfig } from "@/hooks/useFocusItems";
import { toLocalDateKey } from "@/lib/dateOnly";
import { useIsMobile } from "@/hooks/use-mobile";

interface AutoCounts {
  followups: number;
  recruiting: number;
  appointments: number;
  relationship: number;
}

interface SixMostImportantProps {
  autoCounts?: AutoCounts;
}

export default function SixMostImportant({ autoCounts }: SixMostImportantProps) {
  const isMobile = useIsMobile();
  const { configs, progress, isLoading, seedDefaults, saveConfigs, upsertProgress } = useFocusItems();
  const [editMode, setEditMode] = useState(false);
  const [draft, setDraft] = useState<Omit<FocusItemConfig, "id">[]>([]);

  // Seed defaults on first load
  useEffect(() => {
    if (!isLoading && configs.length === 0) {
      seedDefaults();
    }
  }, [isLoading, configs.length, seedDefaults]);

  // Sync auto-counts to progress
  useEffect(() => {
    if (!autoCounts || configs.length === 0) return;
    for (const config of configs) {
      if (!config.auto_track_key) continue;
      const autoVal = autoCounts[config.auto_track_key as keyof AutoCounts] ?? 0;
      const existing = progress.find((p) => p.sort_order === config.sort_order);
      if (!existing || existing.auto_count !== autoVal) {
        upsertProgress({ sort_order: config.sort_order, auto_count: autoVal });
      }
    }
  }, [autoCounts, configs, progress, upsertProgress]);

  const items = useMemo(() => {
    return configs.map((config) => {
      const prog = progress.find((p) => p.sort_order === config.sort_order);
      const autoCount = prog?.auto_count ?? 0;
      const manualAdj = prog?.manual_adjustment ?? 0;
      const current = autoCount + manualAdj;
      const target = config.default_target;
      const isComplete = prog?.is_complete ?? false;
      const isAutoTracked = !!config.auto_track_key;
      return { ...config, autoCount, manualAdj, current, target, isComplete, isAutoTracked };
    });
  }, [configs, progress]);

  const completedCount = items.filter((i) => i.isComplete || i.current >= i.target).length;

  const handleManualAdjust = useCallback(
    (sortOrder: number, delta: number) => {
      const existing = progress.find((p) => p.sort_order === sortOrder);
      const currentAdj = existing?.manual_adjustment ?? 0;
      const autoCount = existing?.auto_count ?? 0;
      const newAdj = Math.max(-autoCount, currentAdj + delta); // Don't go below 0 total
      upsertProgress({ sort_order: sortOrder, manual_adjustment: newAdj });
    },
    [progress, upsertProgress]
  );

  const handleToggleComplete = useCallback(
    (sortOrder: number) => {
      const existing = progress.find((p) => p.sort_order === sortOrder);
      upsertProgress({ sort_order: sortOrder, is_complete: !(existing?.is_complete ?? false) });
    },
    [progress, upsertProgress]
  );

  const startEdit = () => {
    setDraft(configs.map(({ id, ...rest }) => rest));
    setEditMode(true);
  };

  const saveDraft = async () => {
    await saveConfigs(draft);
    setEditMode(false);
  };

  const resetToDefaults = async () => {
    setDraft([...DEFAULT_FOCUS_ITEMS]);
  };

  const moveDraftItem = (from: number, dir: -1 | 1) => {
    const to = from + dir;
    if (to < 0 || to >= draft.length) return;
    setDraft((prev) => {
      const next = [...prev];
      [next[from], next[to]] = [next[to], next[from]];
      return next.map((item, idx) => ({ ...item, sort_order: idx }));
    });
  };

  if (isLoading) return null;

  return (
    <Card className="border-primary/20 shadow-md bg-primary/5">
      <CardHeader className={cn(isMobile ? "pb-1 px-3 py-2" : "pb-2")}>
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="p-1.5 rounded-md bg-primary/10">
              <Star className="w-4 h-4 text-primary" />
            </div>
            <CardTitle className="text-sm font-semibold text-foreground">6 Most Important Things</CardTitle>
            <Badge variant="secondary" className="text-xs">
              {completedCount} / {items.length || 6}
            </Badge>
          </div>
          {!editMode && (
            <Button variant="ghost" size="icon" className="h-7 w-7" onClick={startEdit}>
              <Pencil className="w-3.5 h-3.5 text-muted-foreground" />
            </Button>
          )}
        </div>
      </CardHeader>
      <CardContent className={cn("pt-0", isMobile && "px-3")}>
        {editMode ? (
          <EditView
            draft={draft}
            setDraft={setDraft}
            onSave={saveDraft}
            onCancel={() => setEditMode(false)}
            onReset={resetToDefaults}
            onMove={moveDraftItem}
          />
        ) : (
          <div className="space-y-1.5">
            {items.map((item) => (
              <FocusItemRow
                key={item.sort_order}
                item={item}
                onAdjust={(delta) => handleManualAdjust(item.sort_order, delta)}
                onToggleComplete={() => handleToggleComplete(item.sort_order)}
                isMobile={isMobile}
              />
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function FocusItemRow({
  item,
  onAdjust,
  onToggleComplete,
  isMobile,
}: {
  item: {
    label: string;
    current: number;
    target: number;
    isComplete: boolean;
    isAutoTracked: boolean;
    sort_order: number;
  };
  onAdjust: (delta: number) => void;
  onToggleComplete: () => void;
  isMobile: boolean;
}) {
  const met = item.current >= item.target;
  const done = item.isComplete || met;
  const pct = item.target > 0 ? Math.min(100, Math.round((item.current / item.target) * 100)) : 0;

  return (
    <div
      className={cn(
        "flex items-center gap-2 p-2 rounded-lg border transition-colors",
        done
          ? "border-emerald-200 bg-emerald-50/50 dark:border-emerald-800/40 dark:bg-emerald-900/10"
          : "border-border/50 bg-background/80"
      )}
    >
      {/* Complete toggle */}
      <button
        type="button"
        onClick={onToggleComplete}
        className={cn(
          "flex-shrink-0 w-5 h-5 rounded-full border-2 flex items-center justify-center transition-colors",
          done
            ? "border-emerald-500 bg-emerald-500 text-white"
            : "border-muted-foreground/30 hover:border-primary"
        )}
      >
        {done && <Check className="w-3 h-3" />}
      </button>

      {/* Label + progress */}
      <div className="flex-1 min-w-0">
        <div className="flex items-center justify-between mb-0.5">
          <span
            className={cn(
              "text-sm truncate",
              done ? "line-through text-muted-foreground" : "text-foreground font-medium"
            )}
          >
            {item.label}
          </span>
          <div className="flex items-center gap-1 shrink-0 ml-2">
            {item.isAutoTracked && (
              <Zap className="w-3 h-3 text-amber-500" title="Auto-tracked" />
            )}
            <span className={cn("text-xs font-medium", done ? "text-emerald-600 dark:text-emerald-400" : "text-muted-foreground")}>
              {item.current}/{item.target}
            </span>
          </div>
        </div>
        <Progress value={pct} className="h-1.5" />
      </div>

      {/* Manual +/- controls */}
      <div className="flex items-center gap-0.5 shrink-0">
        <button
          type="button"
          onClick={() => onAdjust(-1)}
          className="w-6 h-6 rounded flex items-center justify-center text-muted-foreground hover:bg-muted transition-colors"
          disabled={item.current <= 0}
        >
          <Minus className="w-3 h-3" />
        </button>
        <button
          type="button"
          onClick={() => onAdjust(1)}
          className="w-6 h-6 rounded flex items-center justify-center text-muted-foreground hover:bg-muted transition-colors"
        >
          <Plus className="w-3 h-3" />
        </button>
      </div>
    </div>
  );
}

function EditView({
  draft,
  setDraft,
  onSave,
  onCancel,
  onReset,
  onMove,
}: {
  draft: Omit<FocusItemConfig, "id">[];
  setDraft: React.Dispatch<React.SetStateAction<Omit<FocusItemConfig, "id">[]>>;
  onSave: () => void;
  onCancel: () => void;
  onReset: () => void;
  onMove: (from: number, dir: -1 | 1) => void;
}) {
  return (
    <div className="space-y-2">
      {draft.map((item, idx) => (
        <div key={idx} className="flex items-center gap-1.5">
          <span className="text-xs font-bold text-primary w-5 text-center shrink-0">{idx + 1}</span>
          <Input
            value={item.label}
            onChange={(e) => {
              const next = [...draft];
              next[idx] = { ...next[idx], label: e.target.value };
              setDraft(next);
            }}
            className="h-8 text-sm flex-1"
          />
          <Input
            type="number"
            value={item.default_target}
            onChange={(e) => {
              const next = [...draft];
              next[idx] = { ...next[idx], default_target: Math.max(1, parseInt(e.target.value) || 1) };
              setDraft(next);
            }}
            className="h-8 text-sm w-14 text-center"
            min={1}
            title="Daily target"
          />
          <Button variant="ghost" size="icon" className="h-7 w-7 shrink-0" onClick={() => onMove(idx, -1)} disabled={idx === 0}>
            <ArrowUp className="w-3.5 h-3.5" />
          </Button>
          <Button variant="ghost" size="icon" className="h-7 w-7 shrink-0" onClick={() => onMove(idx, 1)} disabled={idx === draft.length - 1}>
            <ArrowDown className="w-3.5 h-3.5" />
          </Button>
        </div>
      ))}
      <div className="flex items-center gap-2 pt-1">
        <Button size="sm" className="h-7 text-xs" onClick={onSave}>
          Save
        </Button>
        <Button variant="outline" size="sm" className="h-7 text-xs" onClick={onCancel}>
          Cancel
        </Button>
        <Button variant="ghost" size="sm" className="h-7 text-xs gap-1 ml-auto text-muted-foreground" onClick={onReset}>
          <RotateCcw className="w-3 h-3" /> Reset
        </Button>
      </div>
    </div>
  );
}
