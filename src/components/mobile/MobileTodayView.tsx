import { useState, useMemo, useCallback } from "react";
import { cn } from "@/lib/utils";
import { Clock, CalendarCheck, List, Phone, Users, ChevronDown, ChevronUp } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import MobileFollowUpRow from "./MobileFollowUpRow";
import type { MobileActionItem } from "./MobileFollowUpRow";
import MobileQuickFilters, { filterItems } from "./MobileQuickFilters";
import type { FilterKey } from "./MobileQuickFilters";
import MobileCallMode from "./MobileCallMode";

interface Props {
  overdueItems: MobileActionItem[];
  dueTodayItems: MobileActionItem[];
  highPriorityItems: MobileActionItem[];
  generalItems: MobileActionItem[];
  onTapItem: (item: MobileActionItem) => void;
  onCompleteItem: (item: MobileActionItem) => void;
  onRescheduleItem: (item: MobileActionItem) => void;
  onSkipItem: (item: MobileActionItem) => void;
  onAddNoteItem: (item: MobileActionItem) => void;
  onDidNotConnect: (item: MobileActionItem) => void;
}

function SectionHeader({ icon: Icon, label, count, iconColor, collapsed, onToggle }: {
  icon: React.ElementType;
  label: string;
  count: number;
  iconColor: string;
  collapsed: boolean;
  onToggle: () => void;
}) {
  if (count === 0) return null;
  return (
    <button
      type="button"
      onClick={onToggle}
      className="w-full flex items-center gap-2 py-2 px-1"
    >
      <Icon className={cn("w-3.5 h-3.5", iconColor)} />
      <span className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
        {label}
      </span>
      <Badge variant="secondary" className="text-[10px] px-1.5 py-0 h-4">
        {count}
      </Badge>
      <div className="flex-1" />
      {collapsed ? (
        <ChevronDown className="w-3.5 h-3.5 text-muted-foreground" />
      ) : (
        <ChevronUp className="w-3.5 h-3.5 text-muted-foreground" />
      )}
    </button>
  );
}

export default function MobileTodayView({
  overdueItems, dueTodayItems, highPriorityItems, generalItems,
  onTapItem, onCompleteItem, onRescheduleItem, onSkipItem, onAddNoteItem, onDidNotConnect,
}: Props) {
  const [viewMode, setViewMode] = useState<"list" | "call">("list");
  const [filter, setFilter] = useState<FilterKey>("all");
  const [collapsedSections, setCollapsedSections] = useState<Record<string, boolean>>({});

  const allItems = useMemo(() =>
    [...overdueItems, ...dueTodayItems, ...highPriorityItems, ...generalItems],
    [overdueItems, dueTodayItems, highPriorityItems, generalItems]
  );

  const filteredOverdue = useMemo(() => filterItems(overdueItems, filter), [overdueItems, filter]);
  const filteredDueToday = useMemo(() => filterItems(dueTodayItems, filter), [dueTodayItems, filter]);
  const filteredHighPriority = useMemo(() => filterItems(highPriorityItems, filter), [highPriorityItems, filter]);
  const filteredGeneral = useMemo(() => filterItems(generalItems, filter), [generalItems, filter]);
  const filteredAll = useMemo(() => filterItems(allItems, filter), [allItems, filter]);

  const toggleSection = useCallback((key: string) => {
    setCollapsedSections(prev => ({ ...prev, [key]: !prev[key] }));
  }, []);

  const renderRow = useCallback((item: MobileActionItem) => (
    <MobileFollowUpRow
      key={`${item.itemType}-${item.id}`}
      item={item}
      onTap={() => onTapItem(item)}
      onComplete={() => onCompleteItem(item)}
      onReschedule={() => onRescheduleItem(item)}
      onSkip={() => onSkipItem(item)}
      onAddNote={() => onAddNoteItem(item)}
    />
  ), [onTapItem, onCompleteItem, onRescheduleItem, onSkipItem, onAddNoteItem]);

  return (
    <div className="space-y-2">
      {/* View mode toggle */}
      <div className="flex items-center gap-2">
        <div className="flex gap-0.5 rounded-full border border-border p-0.5 bg-card">
          <button
            type="button"
            onClick={() => setViewMode("list")}
            className={cn(
              "flex items-center gap-1 px-3 py-1 rounded-full text-xs font-medium transition-all",
              viewMode === "list"
                ? "bg-primary text-primary-foreground shadow-sm"
                : "text-muted-foreground hover:bg-muted"
            )}
          >
            <List className="w-3.5 h-3.5" /> List
          </button>
          <button
            type="button"
            onClick={() => setViewMode("call")}
            className={cn(
              "flex items-center gap-1 px-3 py-1 rounded-full text-xs font-medium transition-all",
              viewMode === "call"
                ? "bg-primary text-primary-foreground shadow-sm"
                : "text-muted-foreground hover:bg-muted"
            )}
          >
            <Phone className="w-3.5 h-3.5" /> Calls
          </button>
        </div>
        <div className="flex-1" />
        <span className="text-xs text-muted-foreground">
          {filteredAll.length} item{filteredAll.length !== 1 ? "s" : ""}
        </span>
      </div>

      {/* Quick filters */}
      <MobileQuickFilters items={allItems} active={filter} onChange={setFilter} />

      {viewMode === "call" ? (
        <MobileCallMode
          items={filteredAll}
          onComplete={onCompleteItem}
          onDidNotConnect={onDidNotConnect}
        />
      ) : (
        <div className="space-y-1">
          {/* Overdue Section */}
          {filteredOverdue.length > 0 && (
            <div className="rounded-xl border border-destructive/20 bg-destructive/5 overflow-hidden">
              <SectionHeader
                icon={Clock}
                label="Overdue"
                count={filteredOverdue.length}
                iconColor="text-destructive"
                collapsed={!!collapsedSections.overdue}
                onToggle={() => toggleSection("overdue")}
              />
              {!collapsedSections.overdue && (
                <div className="divide-y divide-border/30">
                  {filteredOverdue.map(renderRow)}
                </div>
              )}
            </div>
          )}

          {/* Due Today Section */}
          {filteredDueToday.length > 0 && (
            <div className="rounded-xl border border-primary/20 bg-primary/5 overflow-hidden">
              <SectionHeader
                icon={CalendarCheck}
                label="Due Today"
                count={filteredDueToday.length}
                iconColor="text-primary"
                collapsed={!!collapsedSections.dueToday}
                onToggle={() => toggleSection("dueToday")}
              />
              {!collapsedSections.dueToday && (
                <div className="divide-y divide-border/30">
                  {filteredDueToday.map(renderRow)}
                </div>
              )}
            </div>
          )}

          {/* High Priority */}
          {filteredHighPriority.length > 0 && (
            <div className="rounded-xl border border-accent bg-accent/30 overflow-hidden">
              <SectionHeader
                icon={CalendarCheck}
                label="High Priority"
                count={filteredHighPriority.length}
                iconColor="text-accent-foreground"
                collapsed={!!collapsedSections.highPriority}
                onToggle={() => toggleSection("highPriority")}
              />
              {!collapsedSections.highPriority && (
                <div className="divide-y divide-border/30">
                  {filteredHighPriority.map(renderRow)}
                </div>
              )}
            </div>
          )}

          {/* General */}
          {filteredGeneral.length > 0 && (
            <div className="rounded-xl border border-border/50 bg-card overflow-hidden">
              <SectionHeader
                icon={Users}
                label="General"
                count={filteredGeneral.length}
                iconColor="text-muted-foreground"
                collapsed={!!collapsedSections.general}
                onToggle={() => toggleSection("general")}
              />
              {!collapsedSections.general && (
                <div className="divide-y divide-border/30">
                  {filteredGeneral.map(renderRow)}
                </div>
              )}
            </div>
          )}

          {filteredAll.length === 0 && (
            <div className="py-12 text-center">
              <p className="text-sm text-muted-foreground">All caught up! 🎉</p>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
