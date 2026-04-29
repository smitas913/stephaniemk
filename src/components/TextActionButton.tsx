import { useState } from "react";
import { MessageSquare, Smartphone, Copy, ExternalLink, CheckCircle2 } from "lucide-react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Button } from "@/components/ui/button";
import { phoneForLink, formatPhone } from "@/lib/phoneUtils";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

interface TextActionButtonProps {
  phone?: string | null;
  /** Visual variant of the trigger */
  trigger?: "icon" | "icon-button" | "labeled";
  /** Override icon size class — defaults sensibly per variant */
  iconClassName?: string;
  className?: string;
  title?: string;
}

/**
 * Reliable "Text" action that gives the user multiple ways to reach the
 * messaging app, since `sms:` links behave inconsistently across
 * desktop browsers/OSes.
 *
 * Options offered:
 *  1. Open default messaging app (sms:)
 *  2. Open Google Messages Web (Android-friendly fallback for desktop)
 *  3. Copy phone number to clipboard
 */
export default function TextActionButton({
  phone,
  trigger = "icon",
  iconClassName,
  className,
  title = "Text",
}: TextActionButtonProps) {
  const [open, setOpen] = useState(false);
  const digits = phoneForLink(phone || "");
  const disabled = !digits;

  const copyNumber = async () => {
    try {
      await navigator.clipboard.writeText(digits);
      toast.success(`Copied ${formatPhone(digits)}`);
    } catch {
      toast.error("Could not copy — your browser blocked clipboard access");
    }
    setOpen(false);
  };

  const openSms = () => {
    if (!digits) return;
    window.location.href = `sms:${digits}`;
    setOpen(false);
  };

  const openGoogleMessages = () => {
    window.open("https://messages.google.com/web", "_blank", "noopener,noreferrer");
    setOpen(false);
  };

  // Renders the trigger element. Stop propagation so it doesn't bubble into
  // parent row click handlers (Today list, etc.).
  const renderTrigger = () => {
    if (trigger === "labeled") {
      return (
        <Button
          variant="outline"
          size="sm"
          disabled={disabled}
          className={className}
          title={title}
          onClick={(e) => e.stopPropagation()}
        >
          <MessageSquare className={cn("w-3.5 h-3.5 mr-1", iconClassName)} />
          Text
        </Button>
      );
    }
    if (trigger === "icon-button") {
      return (
        <Button
          variant="outline"
          size="sm"
          disabled={disabled}
          className={className}
          title={title}
          onClick={(e) => e.stopPropagation()}
        >
          <MessageSquare className={cn("w-4 h-4", iconClassName)} />
        </Button>
      );
    }
    // "icon" — bare icon button (used inline in tables/rows)
    return (
      <button
        type="button"
        disabled={disabled}
        title={title}
        onClick={(e) => e.stopPropagation()}
        className={cn(
          "inline-flex items-center justify-center text-muted-foreground hover:text-primary transition-colors disabled:opacity-40 disabled:cursor-not-allowed",
          className
        )}
      >
        <MessageSquare className={cn("w-3.5 h-3.5 text-primary", iconClassName)} />
      </button>
    );
  };

  if (disabled) {
    // No phone — render disabled trigger directly without the popover.
    return renderTrigger();
  }

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>{renderTrigger()}</PopoverTrigger>
      <PopoverContent
        align="end"
        className="w-60 p-2"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="px-2 py-1.5 mb-1">
          <p className="text-[11px] uppercase tracking-wide text-muted-foreground font-semibold">Text</p>
          <p className="text-sm font-medium text-foreground">{formatPhone(digits)}</p>
        </div>
        <div className="space-y-1">
          <button
            type="button"
            onClick={openSms}
            className="w-full flex items-center gap-2 px-2 py-2 rounded-md text-sm text-left hover:bg-muted transition-colors"
          >
            <Smartphone className="w-4 h-4 text-primary shrink-0" />
            <div className="flex-1 min-w-0">
              <p className="font-medium text-foreground">Open Messaging App</p>
              <p className="text-[11px] text-muted-foreground">Uses your default sms: handler</p>
            </div>
          </button>
          <button
            type="button"
            onClick={openGoogleMessages}
            className="w-full flex items-center gap-2 px-2 py-2 rounded-md text-sm text-left hover:bg-muted transition-colors"
          >
            <ExternalLink className="w-4 h-4 text-primary shrink-0" />
            <div className="flex-1 min-w-0">
              <p className="font-medium text-foreground">Google Messages Web</p>
              <p className="text-[11px] text-muted-foreground">Best for desktop / Android</p>
            </div>
          </button>
          <button
            type="button"
            onClick={copyNumber}
            className="w-full flex items-center gap-2 px-2 py-2 rounded-md text-sm text-left hover:bg-muted transition-colors"
          >
            <Copy className="w-4 h-4 text-primary shrink-0" />
            <div className="flex-1 min-w-0">
              <p className="font-medium text-foreground">Copy Number</p>
              <p className="text-[11px] text-muted-foreground">Paste anywhere you text from</p>
            </div>
          </button>
        </div>
      </PopoverContent>
    </Popover>
  );
}
