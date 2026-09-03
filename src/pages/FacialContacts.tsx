import { useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Droplets, ScanLine, Search, Calendar, ExternalLink, Loader2, RotateCcw } from "lucide-react";
import { SKIN_TYPES } from "@/lib/types";
import { fetchFacialContacts, facialContactMatches } from "@/lib/facialContacts";
import { formatPhone } from "@/lib/phoneUtils";
import ScanCardDialog from "@/components/ScanCardDialog";
import FacialContactDetailSheet from "@/components/FacialContactDetailSheet";

export default function FacialContacts() {
  const qc = useQueryClient();
  const [search, setSearch] = useState("");
  const [skinFilter, setSkinFilter] = useState<string>("all");
  const [rebookOnly, setRebookOnly] = useState(false);
  const [scanOpen, setScanOpen] = useState(false);
  const [detailId, setDetailId] = useState<string | null>(null);

  const { data: contacts = [], isLoading } = useQuery({
    queryKey: ["facial-contacts"],
    queryFn: fetchFacialContacts,
  });

  const filtered = useMemo(
    () =>
      contacts.filter(
        (c) =>
          facialContactMatches(c, search) &&
          (skinFilter === "all" || c.skin_type === skinFilter) &&
          (!rebookOnly || c.interested_in_rebooking),
      ),
    [contacts, search, skinFilter, rebookOnly],
  );

  return (
    <div className="container py-6 space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight flex items-center gap-2">
            <Droplets className="w-6 h-6 text-primary" />
            Facial Contacts
          </h1>
          <p className="text-sm text-muted-foreground">
            Scanned profile cards for faces who haven't become customers — kept out of Clients and Leads.
          </p>
        </div>
        <Button onClick={() => setScanOpen(true)} className="gap-2">
          <ScanLine className="w-4 h-4" />Scan Card
        </Button>
      </div>

      <Card className="border-border/50 shadow-sm">
        <CardHeader className="pb-3">
          <CardTitle className="text-base">
            {isLoading ? "Loading…" : `${filtered.length} of ${contacts.length} contact${contacts.length === 1 ? "" : "s"}`}
          </CardTitle>
          <div className="flex flex-wrap gap-2 pt-2">
            <div className="relative flex-1 min-w-[220px]">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <Input
                className="pl-8 h-9"
                placeholder="Search name, phone, email, skin type, shade…"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
            </div>
            <Select value={skinFilter} onValueChange={setSkinFilter}>
              <SelectTrigger className="h-9 w-[190px]"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All skin types</SelectItem>
                {SKIN_TYPES.map((t) => <SelectItem key={t} value={t}>{t}</SelectItem>)}
              </SelectContent>
            </Select>
            <button
              type="button"
              onClick={() => setRebookOnly((v) => !v)}
              className={`text-xs px-2.5 py-1 rounded-full border transition-colors ${
                rebookOnly
                  ? "border-primary bg-primary/10 text-primary"
                  : "border-border text-muted-foreground hover:bg-muted"
              }`}
            >
              {rebookOnly ? (
                <span className="inline-flex items-center gap-1.5"><RotateCcw className="w-3 h-3" /> Show all</span>
              ) : (
                "Rebook Candidates"
              )}
            </button>
          </div>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="py-10 flex justify-center"><Loader2 className="w-5 h-5 animate-spin text-muted-foreground" /></div>
          ) : filtered.length === 0 ? (
            <p className="py-10 text-center text-sm text-muted-foreground">
              {contacts.length === 0 ? "No facial contacts yet. Scan a card to add the first one." : "No matches for that search."}
            </p>
          ) : (
            <>
              {/* Desktop table */}
              <div className="hidden md:block overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-border text-left text-xs uppercase tracking-wide text-muted-foreground">
                      <th className="py-2 pr-3 font-medium">Name</th>
                      <th className="py-2 pr-3 font-medium">Phone</th>
                      <th className="py-2 pr-3 font-medium">Skin type</th>
                      <th className="py-2 pr-3 font-medium">Shade</th>
                      <th className="py-2 pr-3 font-medium">Facial date</th>
                      <th className="py-2 pr-3 font-medium">Event</th>
                      <th className="py-2 font-medium">Scan</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filtered.map((c) => (
                      <tr
                        key={c.id}
                        className="border-b border-border/50 hover:bg-muted/40 cursor-pointer"
                        onClick={() => setDetailId(c.id)}
                      >
                        <td className="py-2.5 pr-3">
                          <div className="flex items-center gap-2">
                            <span className="font-medium text-foreground">{c.full_name}</span>
                            {c.interested_in_rebooking && (
                              <Badge variant="secondary" className="font-normal text-[10px] px-1.5 py-0 h-5">
                                Might rebook
                              </Badge>
                            )}
                          </div>
                        </td>
                        <td className="py-2.5 pr-3 text-muted-foreground">{c.phone ? formatPhone(c.phone) : "—"}</td>
                        <td className="py-2.5 pr-3">{c.skin_type ? <Badge variant="secondary" className="font-normal">{c.skin_type}</Badge> : <span className="text-muted-foreground">—</span>}</td>
                        <td className="py-2.5 pr-3 text-muted-foreground">{c.foundation_shade || "—"}</td>
                        <td className="py-2.5 pr-3 text-muted-foreground">{c.facial_date || "—"}</td>
                        <td className="py-2.5 pr-3">
                          {c.event_id ? (
                            <Link to={`/events/${encodeURIComponent(c.event_id)}`} className="text-primary hover:underline" onClick={(e) => e.stopPropagation()}>
                              {c.event_id}
                            </Link>
                          ) : <span className="text-muted-foreground">—</span>}
                        </td>
                        <td className="py-2.5">
                          {c.scan_pdf_url ? (
                            <a href={c.scan_pdf_url} target="_blank" rel="noreferrer" className="text-primary inline-flex items-center gap-1 hover:underline" onClick={(e) => e.stopPropagation()}>
                              PDF <ExternalLink className="w-3 h-3" />
                            </a>
                          ) : <span className="text-muted-foreground">—</span>}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {/* Mobile cards */}
              <div className="md:hidden space-y-2">
                {filtered.map((c) => (
                  <button
                    key={c.id}
                    onClick={() => setDetailId(c.id)}
                    className="w-full text-left rounded-lg border border-border/60 p-3 hover:bg-muted/40 transition-colors"
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span className="font-medium text-foreground">{c.full_name}</span>
                      <div className="flex items-center gap-1.5">
                        {c.interested_in_rebooking && (
                          <Badge variant="secondary" className="font-normal text-[10px] px-1.5 py-0 h-5">
                            Might rebook
                          </Badge>
                        )}
                        {c.skin_type && <Badge variant="secondary" className="font-normal text-[11px]">{c.skin_type}</Badge>}
                      </div>
                    </div>
                    <div className="mt-1 text-xs text-muted-foreground flex flex-wrap gap-x-3 gap-y-1">
                      {c.phone && <span>{formatPhone(c.phone)}</span>}
                      {c.foundation_shade && <span>Shade: {c.foundation_shade}</span>}
                      {c.facial_date && <span className="inline-flex items-center gap-1"><Calendar className="w-3 h-3" />{c.facial_date}</span>}
                      {c.event_id && <span>Event: {c.event_id}</span>}
                    </div>
                  </button>
                ))}
              </div>
            </>
          )}
        </CardContent>
      </Card>

      <ScanCardDialog
        open={scanOpen}
        onOpenChange={setScanOpen}
        onCreated={() => qc.invalidateQueries({ queryKey: ["facial-contacts"] })}
      />
      <FacialContactDetailSheet
        contactId={detailId}
        open={Boolean(detailId)}
        onOpenChange={(v) => { if (!v) setDetailId(null); }}
      />
    </div>
  );
}
