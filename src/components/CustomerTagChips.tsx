import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { CUSTOMER_TAGS, type CustomerTag } from "@/lib/types";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import { Ban } from "lucide-react";

interface Props {
  customerId: string;
  tags: string[];
  isCustomer?: boolean;
  className?: string;
}

const tagStyle: Record<CustomerTag, { active: string }> = {
  Lead: { active: "bg-blue-500 text-white border-blue-500 shadow-sm" },
  Prospect: { active: "bg-purple-500 text-white border-purple-500 shadow-sm" },
  DNC: { active: "bg-destructive text-destructive-foreground border-destructive shadow-sm" },
};

const inactiveStyle =
  "bg-muted/40 text-muted-foreground border-muted-foreground/20 border-dashed hover:bg-muted hover:text-foreground";

export default function CustomerTagChips({ customerId, tags, isCustomer, className }: Props) {
  const qc = useQueryClient();
  const [pending, setPending] = useState<string | null>(null);
  const current = tags || [];

  const mut = useMutation({
    mutationFn: async (newTags: string[]) => {
      const { error } = await supabase
        .from("customers")
        .update({ tags: newTags } as any)
        .eq("id", customerId);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["customer", customerId] });
      qc.invalidateQueries({ queryKey: ["customers"] });
    },
    onError: (e: any) => toast.error(e.message || "Failed to update tag"),
    onSettled: () => setPending(null),
  });

  const toggle = (tag: CustomerTag) => {
    if (mut.isPending) return;
    setPending(tag);
    const has = current.includes(tag);
    const next = has ? current.filter((t) => t !== tag) : [...current, tag];
    mut.mutate(next);
    if (!has && tag === "DNC") toast.success("Marked Do Not Contact — follow-ups cleared");
  };

  // Surface any non-toggleable tags (e.g. "PCP", "Program: ...") that were applied
  // by imports or automations. These render as read-only badges so users can see
  // why a customer is on a list, but aren't editable here.
  const extraTags = current.filter((t) => !(CUSTOMER_TAGS as readonly string[]).includes(t));

  return (
    <div className={cn("flex gap-1.5 flex-wrap items-center", className)}>
      {isCustomer && (
        <span
          className="text-[11px] px-2 py-0.5 rounded-full border font-medium bg-emerald-500 text-white border-emerald-500 shadow-sm"
          title="This person is an active customer"
        >
          Customer
        </span>
      )}
      {CUSTOMER_TAGS.map((tag) => {
        const active = current.includes(tag);
        return (
          <button
            key={tag}
            type="button"
            onClick={() => toggle(tag)}
            disabled={mut.isPending}
            className={cn(
              "text-[11px] px-2 py-0.5 rounded-full border font-medium transition-colors disabled:opacity-50",
              active ? tagStyle[tag].active : inactiveStyle,
              pending === tag && "opacity-60",
            )}
            aria-pressed={active}
            title={active ? `Click to remove ${tag}` : `Click to add ${tag}`}
          >
            {tag === "DNC" ? "DNC" : tag}
          </button>
        );
      })}
      {extraTags.map((tag) => {
        const isPcp = tag === "PCP";
        const isProgram = tag.startsWith("Program: ");
        return (
          <span
            key={tag}
            className={cn(
              "text-[11px] px-2 py-0.5 rounded-full border font-medium",
              isPcp
                ? "bg-primary text-primary-foreground border-primary shadow-sm"
                : isProgram
                  ? "bg-primary/10 text-primary border-primary/30"
                  : "bg-muted text-muted-foreground border-muted-foreground/20",
            )}
            title={isPcp ? "On Preferred Customer Program list" : tag}
          >
            {isProgram ? tag.replace(/^Program:\s*/, "") : tag}
          </span>
        );
      })}
    </div>
  );
}

export function DncBadge({ tags, className }: { tags: string[] | null | undefined; className?: string }) {
  if (!tags?.includes("DNC")) return null;
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 text-[11px] px-2 py-0.5 rounded-full bg-destructive text-destructive-foreground font-semibold",
        className,
      )}
    >
      <Ban className="w-3 h-3" />
      Do Not Contact
    </span>
  );
}
