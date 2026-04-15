import { useState, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { Copy, Star, FileText, ChevronDown, ChevronUp } from "lucide-react";
import { toast } from "@/hooks/use-toast";
import { CONTEXT_CATEGORY_MAP } from "@/lib/scriptCategories";

interface Props {
  /** The context type to filter scripts by (e.g. "customer", "prospect", "hostess") */
  contextType: string;
  /** Optional first name to replace {first_name} merge field */
  firstName?: string;
}

export default function ScriptPicker({ contextType, firstName }: Props) {
  const { session } = useAuth();
  const [expanded, setExpanded] = useState(false);

  const categories = CONTEXT_CATEGORY_MAP[contextType] ?? [];

  const { data: scripts = [] } = useQuery({
    queryKey: ["scripts", "context", contextType],
    queryFn: async () => {
      if (categories.length === 0) return [];
      const { data, error } = await supabase
        .from("scripts")
        .select("*")
        .in("category", categories)
        .order("is_favorite", { ascending: false })
        .order("title");
      if (error) throw error;
      return data ?? [];
    },
    enabled: !!session && categories.length > 0,
  });

  const copyScript = (text: string) => {
    let resolved = text;
    if (firstName) resolved = resolved.replace(/\{first_name\}/g, firstName);
    navigator.clipboard.writeText(resolved);
    toast({ title: "Script copied" });
  };

  if (scripts.length === 0) return null;

  const shown = expanded ? scripts : scripts.slice(0, 3);

  return (
    <div className="space-y-1.5">
      <button
        className="flex items-center gap-1 text-xs font-medium text-muted-foreground hover:text-foreground transition-colors"
        onClick={() => setExpanded(!expanded)}
      >
        <FileText className="w-3.5 h-3.5" />
        Scripts ({scripts.length})
        {expanded ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
      </button>
      {(expanded || scripts.length <= 3) && (
        <div className="space-y-1">
          {shown.map((s: any) => (
            <div key={s.id} className="flex items-center gap-2 rounded-lg border border-border bg-card/50 px-2.5 py-1.5">
              {s.is_favorite && <Star className="w-3 h-3 fill-amber-400 text-amber-400 shrink-0" />}
              <div className="flex-1 min-w-0">
                <p className="text-xs font-medium text-foreground truncate">{s.title}</p>
              </div>
              <Button variant="ghost" size="icon" className="h-7 w-7 shrink-0" onClick={() => copyScript(s.script_text)}>
                <Copy className="w-3.5 h-3.5 text-primary" />
              </Button>
            </div>
          ))}
          {!expanded && scripts.length > 3 && (
            <button
              className="text-[11px] text-primary hover:underline"
              onClick={() => setExpanded(true)}
            >
              Show {scripts.length - 3} more…
            </button>
          )}
        </div>
      )}
    </div>
  );
}
