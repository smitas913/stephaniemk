import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ArrowUp, ArrowDown, RotateCcw } from "lucide-react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import type { FocusItemConfig, DayType } from "@/hooks/useFocusItems";
import { DEFAULT_FOCUS_ITEMS, DEFAULT_DAY_TYPE_TARGETS, DAY_TYPE_INFO } from "@/hooks/useFocusItems";

interface FocusEditViewProps {
  draft: Omit<FocusItemConfig, "id">[];
  dayTypeTargetsDraft: Record<DayType, number[]>;
  setDraft: React.Dispatch<React.SetStateAction<Omit<FocusItemConfig, "id">[]>>;
  setDayTypeTargetsDraft: React.Dispatch<React.SetStateAction<Record<DayType, number[]>>>;
  onSave: () => void;
  onCancel: () => void;
}

export default function FocusEditView({
  draft, dayTypeTargetsDraft, setDraft, setDayTypeTargetsDraft, onSave, onCancel,
}: FocusEditViewProps) {
  const [activeTab, setActiveTab] = useState<string>("items");

  const moveDraftItem = (from: number, dir: -1 | 1) => {
    const to = from + dir;
    if (to < 0 || to >= draft.length) return;
    setDraft((prev) => {
      const next = [...prev];
      [next[from], next[to]] = [next[to], next[from]];
      return next.map((item, idx) => ({ ...item, sort_order: idx }));
    });
    // Also reorder targets
    setDayTypeTargetsDraft(prev => {
      const updated = { ...prev };
      for (const dt of Object.keys(updated) as DayType[]) {
        const arr = [...updated[dt]];
        [arr[from], arr[to]] = [arr[to], arr[from]];
        updated[dt] = arr;
      }
      return updated;
    });
  };

  const resetToDefaults = () => {
    setDraft([...DEFAULT_FOCUS_ITEMS]);
    setDayTypeTargetsDraft({ ...DEFAULT_DAY_TYPE_TARGETS });
  };

  return (
    <div className="space-y-2">
      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList className="h-7 w-full">
          <TabsTrigger value="items" className="text-xs h-6 flex-1">Labels & Order</TabsTrigger>
          <TabsTrigger value="targets" className="text-xs h-6 flex-1">Day Type Targets</TabsTrigger>
        </TabsList>

        <TabsContent value="items" className="mt-2 space-y-2">
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
              <Button variant="ghost" size="icon" className="h-7 w-7 shrink-0" onClick={() => moveDraftItem(idx, -1)} disabled={idx === 0}>
                <ArrowUp className="w-3.5 h-3.5" />
              </Button>
              <Button variant="ghost" size="icon" className="h-7 w-7 shrink-0" onClick={() => moveDraftItem(idx, 1)} disabled={idx === draft.length - 1}>
                <ArrowDown className="w-3.5 h-3.5" />
              </Button>
            </div>
          ))}
        </TabsContent>

        <TabsContent value="targets" className="mt-2 space-y-3">
          {DAY_TYPE_INFO.map(dt => (
            <div key={dt.value} className="space-y-1">
              <p className="text-xs font-semibold text-foreground">{dt.label}</p>
              <div className="grid grid-cols-3 gap-1">
                {draft.map((item, idx) => (
                  <div key={idx} className="flex items-center gap-1">
                    <span className="text-[10px] text-muted-foreground truncate flex-1">{item.label.split(" ")[0]}</span>
                    <Input
                      type="number"
                      value={dayTypeTargetsDraft[dt.value]?.[idx] ?? 1}
                      onChange={(e) => {
                        setDayTypeTargetsDraft(prev => {
                          const updated = { ...prev };
                          const arr = [...(updated[dt.value] || [])];
                          arr[idx] = Math.max(0, parseInt(e.target.value) || 0);
                          updated[dt.value] = arr;
                          return updated;
                        });
                      }}
                      className="h-6 text-xs w-12 text-center"
                      min={0}
                    />
                  </div>
                ))}
              </div>
            </div>
          ))}
        </TabsContent>
      </Tabs>

      <div className="flex items-center gap-2 pt-1">
        <Button size="sm" className="h-7 text-xs" onClick={onSave}>Save</Button>
        <Button variant="outline" size="sm" className="h-7 text-xs" onClick={onCancel}>Cancel</Button>
        <Button variant="ghost" size="sm" className="h-7 text-xs gap-1 ml-auto text-muted-foreground" onClick={resetToDefaults}>
          <RotateCcw className="w-3 h-3" /> Reset
        </Button>
      </div>
    </div>
  );
}
