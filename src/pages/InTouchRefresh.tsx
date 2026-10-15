import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useQueryClient } from "@tanstack/react-query";
import Layout from "@/components/Layout";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Users, Crown, FileSpreadsheet, Upload } from "lucide-react";
import ImportConsultantsDialog from "@/components/ImportConsultantsDialog";
import PCPImportDialog from "@/components/PCPImportDialog";
import { useInTouchImportStatus, isDue } from "@/hooks/useInTouchImportStatus";

const fmt = (ts: string | null | undefined) =>
  ts ? new Date(ts).toLocaleString(undefined, { month: "short", day: "numeric", year: "numeric", hour: "numeric", minute: "2-digit" }) : "Never";

export default function InTouchRefresh() {
  const navigate = useNavigate();
  const qc = useQueryClient();
  const { data } = useInTouchImportStatus();
  const [consultantsOpen, setConsultantsOpen] = useState(false);
  const [pcpOpen, setPcpOpen] = useState(false);
  const refresh = (open: boolean, set: (v: boolean) => void) => {
    set(open);
    if (!open) qc.invalidateQueries({ queryKey: ["intouch-import-status"] });
  };

  const cards = [
    { title: "Customers (InTouch customer CSV)", icon: Users, ts: data?.customers, due: data ? isDue(data.customers) : false, action: () => navigate("/import-customers") },
    { title: "Team consultants (InTouch consultant CSV)", icon: Crown, ts: data?.consultants, due: data ? isDue(data.consultants) : false, action: () => setConsultantsOpen(true) },
    { title: "PCP list (.xlsx)", icon: FileSpreadsheet, ts: data?.pcp, due: false, action: () => setPcpOpen(true) },
  ];

  return (
    <Layout>
      <div className="space-y-4">
        <div>
          <h1 className="text-2xl font-bold text-foreground">InTouch Refresh</h1>
          <p className="text-sm text-muted-foreground">Bring your latest InTouch exports into the CRM.</p>
        </div>
        <div className="grid gap-3 md:grid-cols-3">
          {cards.map((c) => (
            <Card key={c.title}>
              <CardContent className="p-4 space-y-3">
                <div className="flex items-start justify-between gap-2">
                  <div className="flex items-center gap-2 min-w-0">
                    <c.icon className="w-5 h-5 text-primary shrink-0" />
                    <h2 className="font-semibold text-sm text-foreground">{c.title}</h2>
                  </div>
                  {c.due && <Badge variant="outline" className="shrink-0 border-amber-400 bg-amber-50 text-amber-800">Due for refresh</Badge>}
                </div>
                <p className="text-sm"><span className="text-muted-foreground">Last imported:</span> <span className="font-medium">{data ? fmt(c.ts) : "…"}</span></p>
                <p className="text-xs text-muted-foreground">Export from InTouch, then upload here. Matching skips duplicates.</p>
                <Button className="w-full" onClick={c.action}><Upload className="w-4 h-4 mr-1" />Upload</Button>
              </CardContent>
            </Card>
          ))}
        </div>
      </div>
      <ImportConsultantsDialog open={consultantsOpen} onOpenChange={(v) => refresh(v, setConsultantsOpen)} />
      <PCPImportDialog open={pcpOpen} onOpenChange={(v) => refresh(v, setPcpOpen)} />
    </Layout>
  );
}
