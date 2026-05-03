import { useMemo, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Heart, Plus, Mail, Gift, Phone } from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { fetchNotes } from "@/lib/queries";
import { formatDateOnly } from "@/lib/dateOnly";
import ThoughtfulTouchDialog from "@/components/ThoughtfulTouchDialog";

const TYPE_ICON: Record<string, typeof Mail> = {
  Card: Mail,
  Gift: Gift,
  "Check-in": Phone,
};

export default function ThoughtfulTouchesCard({ customerId, customerName }: { customerId: string; customerName?: string | null }) {
  const [open, setOpen] = useState(false);
  const { data: notes = [] } = useQuery({
    queryKey: ["customer-unified-notes", customerId],
    queryFn: () => fetchNotes("Customer", customerId),
  });

  const touches = useMemo(
    () => (notes as any[]).filter((n) => n.note_type === "Thoughtful Touch"),
    [notes]
  );

  const yearStart = `${new Date().getFullYear()}-01-01`;
  const ytdCount = touches.filter((t) => (t.note_date || t.created_at || "").slice(0, 10) >= yearStart).length;
  const last = touches[0];
  const lastType = last ? (last.tags || []).find((t: string) => t === "Card" || t === "Gift" || t === "Check-in") : null;
  const Icon = (lastType && TYPE_ICON[lastType]) || Heart;

  return (
    <>
      <Card className="border-border/50 shadow-sm">
        <CardHeader className="flex flex-row items-center justify-between pb-2">
          <CardTitle className="text-base flex items-center gap-2">
            <Heart className="h-4 w-4 text-pink-600" />
            Thoughtful Touches
            {ytdCount > 0 && <Badge variant="secondary" className="text-xs">{ytdCount} YTD</Badge>}
          </CardTitle>
          <Button size="sm" variant="ghost" onClick={() => setOpen(true)}>
            <Plus className="h-4 w-4 mr-1" /> Log Touch
          </Button>
        </CardHeader>
        <CardContent>
          {!last ? (
            <p className="text-sm text-muted-foreground">No thoughtful touches logged yet. Cards, gifts, and check-ins live here.</p>
          ) : (
            <div className="flex items-start gap-2 text-sm">
              <Icon className="w-4 h-4 mt-0.5 text-pink-600 shrink-0" />
              <div className="min-w-0 flex-1">
                <div className="text-foreground">
                  <span className="font-medium">{lastType || "Touch"}</span>
                  {(last.tags || []).filter((t: string) => !["Thoughtful Touch", "Card", "Gift", "Check-in"].includes(t)).slice(0, 1).map((occ: string) => (
                    <span key={occ} className="text-muted-foreground"> · {occ}</span>
                  ))}
                  <span className="text-muted-foreground"> · {formatDateOnly((last.note_date || last.created_at || "").slice(0, 10))}</span>
                </div>
                {last.note_body && <p className="text-xs text-muted-foreground whitespace-pre-wrap mt-0.5 line-clamp-2">{last.note_body}</p>}
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      <ThoughtfulTouchDialog
        open={open}
        onClose={() => setOpen(false)}
        customerId={customerId}
        customerName={customerName}
      />
    </>
  );
}
