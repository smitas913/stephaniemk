import { cn } from "@/lib/utils";
import { Phone, CheckCircle2, PhoneMissed } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { MobileActionItem } from "./MobileFollowUpRow";

interface Props {
  items: MobileActionItem[];
  onComplete: (item: MobileActionItem) => void;
  onDidNotConnect: (item: MobileActionItem) => void;
}

export default function MobileCallMode({ items, onComplete, onDidNotConnect }: Props) {
  const callableItems = items.filter(i => i.phone);

  if (callableItems.length === 0) {
    return (
      <div className="py-12 text-center">
        <Phone className="w-10 h-10 text-muted-foreground/30 mx-auto mb-3" />
        <p className="text-sm text-muted-foreground">No contacts with phone numbers</p>
      </div>
    );
  }

  return (
    <div className="divide-y divide-border/30">
      {callableItems.map(item => (
        <div key={item.id} className="py-3 px-1">
          <div className="flex items-center gap-3">
            {/* Name + basic info */}
            <div className="flex-1 min-w-0">
              <p className="text-base font-semibold text-foreground truncate">
                {item.name}
              </p>
              <div className="flex items-center gap-2 mt-0.5">
                <span className="text-sm text-muted-foreground">{item.phone}</span>
                {item.follow_up_status === "OVERDUE" && (
                  <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-destructive/10 text-destructive font-semibold">
                    {item.daysOverdue ? `${item.daysOverdue}d` : "Overdue"}
                  </span>
                )}
              </div>
              {item.followUpReason && (
                <p className="text-xs text-muted-foreground mt-0.5 truncate">
                  {item.followUpReason}
                </p>
              )}
            </div>

            {/* Actions */}
            <div className="flex items-center gap-1.5 shrink-0">
              <Button
                size="sm"
                className="h-10 w-10 rounded-full p-0 bg-primary hover:bg-primary/90"
                asChild
              >
                <a href={`tel:${item.phone}`}>
                  <Phone className="w-5 h-5" />
                </a>
              </Button>
              <Button
                variant="outline"
                size="icon"
                className="h-9 w-9 rounded-full"
                onClick={() => onDidNotConnect(item)}
                title="Did not connect"
              >
                <PhoneMissed className="w-4 h-4 text-muted-foreground" />
              </Button>
              <Button
                variant="outline"
                size="icon"
                className="h-9 w-9 rounded-full"
                onClick={() => onComplete(item)}
                title="Mark complete"
              >
                <CheckCircle2 className="w-4 h-4 text-emerald-600" />
              </Button>
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}
