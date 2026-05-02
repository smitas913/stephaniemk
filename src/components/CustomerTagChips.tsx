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
  className?: string;
}

const tagStyle: Record<CustomerTag, { active: string; inactive: string }> = {
  Lead: {
    active: "bg-blue-500 text-white border-blue-500",
    inactive: "bg-background text-blue-600 border-blue-300 hover:bg-blue-50 dark:hover:bg-blue-950",
  },
  Prospect: {
    active: "bg-purple-500 text-white border-purple-500",
    inactive: "bg-background text-purple-600 border-purple-300 hover:bg-purple-50 dark:hover:bg-purple-950",
  },
  DNC: {
    active: "bg-destructive text-destructive-foreground border-destructive",
    inactive: "bg-background text-destructive border-destructive/40 hover:bg-destructive/10",
  },
};

export default function CustomerTagChips({ customerId, tags, className }: Props) {
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
    onSuccess: (_d, newTags) => {
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

  return (
    <div className={cn("flex gap-1.5 flex-wrap", className)}>
      {CUSTOMER_TAGS.map((tag) => {
        const active = current.includes(tag);
        const style = active ? tagStyle[tag].active : tagStyle[tag].inactive;
        return (
          <button
            key={tag}
            type="button"
            onClick={() => toggle(tag)}
            disabled={mut.isPending}
            className={cn(
              "text-[11px] px-2 py-0.5 rounded-full border font-medium transition-colors disabled:opacity-50",
              style,
              pending === tag && "opacity-60",
            )}
            aria-pressed={active}
          >
            {tag === "DNC" ? "DNC" : tag}
          </button>
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
