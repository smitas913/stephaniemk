import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Lock, RotateCcw } from "lucide-react";
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
          <p className="text-[11px] text-muted-foreground leading-snug">
            Slots 1–5 are fixed activity categories (labels locked). Slot 6 is your <strong>Custom Focus</strong> —
            rename it to whatever you want to prioritize. Set daily targets for every slot on the Day Type Targets tab.
          </p>
          {draft.map((item, idx) => {
            const isCustomSlot = idx === 5;
            const PRESETS = ["Personal Appointments", "Social Media", "Recruiting", "Admin / Cleanup", "Other"];
            return (
              <div key={idx} className="space-y-1">
                <div className="flex items-center gap-1.5">
                  <span className="text-xs font-bold text-primary w-5 text-center shrink-0">{idx + 1}</span>
                  {isCustomSlot ? (
                    <Input
                      value={item.label}
                      onChange={(e) => {
                        const next = [...draft];
                        next[idx] = { ...next[idx], label: e.target.value };
                        setDraft(next);
                      }}
                      className="h-8 text-sm flex-1"
                      placeholder="Custom Focus name…"
                    />
                  ) : (
                    <div className="h-8 flex-1 flex items-center gap-1.5 px-3 rounded-md border border-border/60 bg-muted/40 text-sm text-foreground">
                      <Lock className="w-3 h-3 text-muted-foreground shrink-0" />
                      <span className="truncate">{item.label}</span>
                    </div>
                  )}
                </div>
                {isCustomSlot && (
                  <div className="flex flex-wrap gap-1 pl-7">
                    {PRESETS.map(preset => (
                      <button
                        key={preset}
                        type="button"
                        onClick={() => {
                          const next = [...draft];
                          next[idx] = { ...next[idx], label: preset };
                          setDraft(next);
                        }}
                        className="text-[10px] px-2 py-0.5 rounded-full border border-border bg-muted/40 hover:bg-primary/10 hover:border-primary/40 transition-colors"
                      >
                        {preset}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            );
          })}
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
