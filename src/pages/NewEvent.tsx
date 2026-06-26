import { useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { useOriginPath } from "@/hooks/usePreviousLocation";
import { useEffect } from "react";
import AddressAutocomplete from "@/components/AddressAutocomplete";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { fetchEvents, insertNewEvent, generateEventWorkflowTasks, generateGuestEventWorkflowTasks, fetchZoomDefaults } from "@/lib/queries";
import { generateEventId } from "@/lib/eventId";
import { toLocalDateKey } from "@/lib/dateOnly";
import Layout from "@/components/Layout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent } from "@/components/ui/card";
import { ArrowLeft, PartyPopper, Sparkles, Share2, Megaphone, Monitor, MapPin, MessageSquare, Users, UserCheck } from "lucide-react";
import { cn } from "@/lib/utils";
import { toast } from "sonner";

const EVENT_TYPES = [
  { value: "Party", label: "Party", icon: PartyPopper },
  { value: "Facial", label: "Facial", icon: Sparkles },
  { value: "customer_appt", label: "Customer Appt", icon: UserCheck },
  { value: "Guest Event", label: "Guest Event", icon: Users },
  { value: "Career Chat", label: "Career Chat", icon: MessageSquare },
  { value: "Sharing Appointment", label: "Sharing Appt", icon: Share2 },
  { value: "Lead Generating Event", label: "Lead Gen", icon: Megaphone },
] as const;

const LEAD_GEN_SUBTYPES = ["Networking Event", "Vendor Event"] as const;

const FORMAT_OPTIONS = [
  { value: "In-Person", label: "In Person", icon: MapPin },
  { value: "Virtual", label: "Virtual", icon: Monitor },
] as const;

const HOSTESS_SOURCE_OPTIONS = ["Party/Event", "David's Bridal", "Warm Chatter", "Networking Event", "Vendor Event", "Facial Box", "Referral", "Current Customer", "Other"] as const;

const VIRTUAL_PLATFORMS = [
  { value: "Zoom", label: "Zoom" },
  { value: "Other", label: "Other" },
] as const;

export default function NewEvent() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const queryClient = useQueryClient();
  const originPath = useOriginPath("/events");
  // Prefer explicit ?from= query (legacy callers), else tracked origin.
  const fromPath = searchParams.get("from") || originPath;
  const { data: events = [] } = useQuery({ queryKey: ["events"], queryFn: fetchEvents });
  const { data: zoomDefaults } = useQuery({ queryKey: ["zoom-defaults"], queryFn: fetchZoomDefaults });

  const [eventType, setEventType] = useState<string>("Party");
  const [leadGenSubtype, setLeadGenSubtype] = useState<string>("Networking Event");
  const [eventFormat, setEventFormat] = useState<string>("In-Person");
  const [virtualPlatform, setVirtualPlatform] = useState<string>("Zoom");
  const [eventDate, setEventDate] = useState(toLocalDateKey());
  const [hostessName, setHostessName] = useState("");
  const [hostessPhone, setHostessPhone] = useState("");
  const [hostessSource, setHostessSource] = useState<string>("");
  const [notes, setNotes] = useState("");
  const [eventLocation, setEventLocation] = useState("");
  const [eventVenueType, setEventVenueType] = useState("");
  const [eventTime, setEventTime] = useState("");
  // Zoom fields
  const [zoomId, setZoomId] = useState("");
  const [zoomPassword, setZoomPassword] = useState("");
  const [zoomLink, setZoomLink] = useState("");
  // Other platform fields
  const [platformName, setPlatformName] = useState("");
  const [platformLink, setPlatformLink] = useState("");
  const [virtualNotes, setVirtualNotes] = useState("");

  // Prefill from query params (e.g. when navigated from "Booking Created" in interaction panel)
  const [pendingGuestName, setPendingGuestName] = useState("");
  const [pendingGuestPhone, setPendingGuestPhone] = useState("");

  useEffect(() => {
    const t = searchParams.get("type");
    const h = searchParams.get("hostess");
    const p = searchParams.get("phone");
    if (t && ["Party", "Facial", "customer_appt", "Guest Event", "Career Chat", "Sharing Appointment", "Lead Generating Event"].includes(t)) {
      setEventType(t);
    }
    if (t === "Guest Event") {
      // For Guest Events, the "hostess" param is actually a guest — save for later
      if (h) setPendingGuestName(h);
      if (p) setPendingGuestPhone(p);
    } else {
      if (h) setHostessName(h);
      if (p) setHostessPhone(p);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const isLeadGen = eventType === "Lead Generating Event";
  const isVirtual = eventFormat === "Virtual";

  // Auto-fill zoom defaults when switching to Zoom
  const handlePlatformChange = (platform: string) => {
    setVirtualPlatform(platform);
    if (platform === "Zoom" && zoomDefaults) {
      setZoomId(zoomDefaults.zoom_id || "");
      setZoomPassword(zoomDefaults.zoom_password || "");
      setZoomLink(zoomDefaults.zoom_link || "");
    }
  };

  const handleFormatChange = (format: string) => {
    setEventFormat(format);
    if (format === "Virtual" && virtualPlatform === "Zoom" && zoomDefaults) {
      setZoomId(zoomDefaults.zoom_id || "");
      setZoomPassword(zoomDefaults.zoom_password || "");
      setZoomLink(zoomDefaults.zoom_link || "");
    }
  };

  const mutation = useMutation({
    mutationFn: async () => {
      const displayType = isLeadGen ? leadGenSubtype : eventType;
      const eventId = generateEventId(eventType, eventDate, hostessName || "Event", events.map(e => e.event_id));
      const payload: Record<string, any> = {
        event_id: eventId,
        event_type: displayType,
        event_format: eventFormat,
        event_date: eventDate || null,
        event_time: eventTime || null,
        hostess_name: hostessName.trim() || null,
        hostess_phone: hostessPhone.trim() || null,
        hostess_source: hostessSource || null,
        guest_count: 0,
        notes: notes.trim() || null,
      };
      if (eventFormat === "In-Person") {
        payload.event_location = eventLocation || null;
        payload.event_venue_type = eventVenueType || null;
      } else if (isVirtual && virtualPlatform === "Zoom") {
        payload.virtual_platform = "Zoom";
        payload.zoom_id = zoomId || null;
        payload.zoom_password = zoomPassword || null;
        payload.zoom_link = zoomLink || null;
      } else if (isVirtual && virtualPlatform === "Other") {
        payload.virtual_platform = platformName.trim() || "Other";
        payload.virtual_platform_link = platformLink || null;
        payload.virtual_notes = virtualNotes.trim() || null;
      }
      await upsertEvent(payload as any);
      return eventId;
    },
    onSuccess: async (eventId) => {
      try {
        if (eventType === "Guest Event") {
          await generateGuestEventWorkflowTasks(eventId, eventDate || null);
        } else {
          await generateEventWorkflowTasks(eventId, eventDate || null);
        }
      } catch (e) {
        console.error("Failed to generate workflow tasks", e);
      }
      queryClient.invalidateQueries({ queryKey: ["events"] });
      queryClient.invalidateQueries({ queryKey: ["event-tasks"] });

      // Auto-add pending guest for Guest Events booked from lead/booking flow
      if (eventType === "Guest Event" && pendingGuestName) {
        try {
          const { supabase } = await import("@/integrations/supabase/client");
          const userId = (await supabase.auth.getUser()).data.user?.id;
          await supabase.from("event_guests" as any).insert({
            event_id: eventId,
            name: pendingGuestName,
            phone: pendingGuestPhone || null,
            owner_user_id: userId,
            attending: false,
          } as any);
          toast.success(`${pendingGuestName} added as guest! 🎉`);
        } catch (e) {
          console.error("Failed to add pending guest", e);
        }
      }

      toast.success("Event created");
      if (eventType === 'Guest Event' && pendingGuestName) {
        navigate(`/events/${eventId}?tab=guests`);
      } else {
        navigate(fromPath, { state: { eventCreated: true } });
      }
    },
    onError: (err: any) => {
      toast.error(err.message || "Failed to create event");
    },
  });

  const canSubmit = eventType && eventDate && (!isLeadGen || leadGenSubtype) && !mutation.isPending;

  return (
    <Layout>
      <div className="space-y-6 max-w-2xl">
        <div className="flex items-center gap-3">
          <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => navigate(fromPath)}>
            <ArrowLeft className="w-4 h-4" />
          </Button>
          <div>
            <h2 className="text-2xl font-bold tracking-tight text-foreground">New Event</h2>
            <p className="text-sm text-muted-foreground">Create a new event</p>
          </div>
        </div>

        <Card className="border-border/50 shadow-sm">
          <CardContent className="p-6 space-y-5">
            {/* Event Type */}
            <div>
              <label className="text-sm font-medium text-foreground mb-2 block">Event Type *</label>
              <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-2">
                {EVENT_TYPES.map((t) => {
                  const Icon = t.icon;
                  return (
                    <button
                      key={t.value}
                      type="button"
                      onClick={() => setEventType(t.value)}
                      className={cn(
                        "flex items-center justify-center gap-2 h-11 rounded-lg border-2 text-sm font-medium transition-colors",
                        eventType === t.value
                          ? "border-primary bg-primary/10 text-primary"
                          : "border-border bg-background text-muted-foreground hover:bg-muted"
                      )}
                    >
                      <Icon className="w-4 h-4" />
                      {t.label}
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Lead Gen Subtype */}
            {isLeadGen && (
              <div>
                <label className="text-sm font-medium text-foreground mb-2 block">Event Subtype *</label>
                <div className="flex gap-3">
                  {LEAD_GEN_SUBTYPES.map((sub) => (
                    <button
                      key={sub}
                      type="button"
                      onClick={() => setLeadGenSubtype(sub)}
                      className={cn(
                        "flex-1 h-10 rounded-lg border-2 text-sm font-medium transition-colors",
                        leadGenSubtype === sub
                          ? "border-primary bg-primary/10 text-primary"
                          : "border-border bg-background text-muted-foreground hover:bg-muted"
                      )}
                    >
                      {sub}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {/* Event Format */}
            <div>
              <label className="text-sm font-medium text-foreground mb-2 block">Format *</label>
              <div className="flex gap-3">
                {FORMAT_OPTIONS.map((f) => {
                  const Icon = f.icon;
                  return (
                    <button
                      key={f.value}
                      type="button"
                      onClick={() => handleFormatChange(f.value)}
                      className={cn(
                        "flex-1 flex items-center justify-center gap-2 h-10 rounded-lg border-2 text-sm font-medium transition-colors",
                        eventFormat === f.value
                          ? "border-primary bg-primary/10 text-primary"
                          : "border-border bg-background text-muted-foreground hover:bg-muted"
                      )}
                    >
                      <Icon className="w-4 h-4" />
                      {f.label}
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Virtual Platform Selection */}
            {isVirtual && (
              <div>
                <label className="text-sm font-medium text-foreground mb-2 block">Platform *</label>
                <div className="flex gap-3">
                  {VIRTUAL_PLATFORMS.map((p) => (
                    <button
                      key={p.value}
                      type="button"
                      onClick={() => handlePlatformChange(p.value)}
                      className={cn(
                        "flex-1 h-10 rounded-lg border-2 text-sm font-medium transition-colors",
                        virtualPlatform === p.value
                          ? "border-primary bg-primary/10 text-primary"
                          : "border-border bg-background text-muted-foreground hover:bg-muted"
                      )}
                    >
                      {p.label}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {/* Zoom Fields */}
            {isVirtual && virtualPlatform === "Zoom" && (
              <div className="space-y-3 p-4 rounded-lg border border-border/50 bg-muted/30">
                <div className="grid grid-cols-2 gap-4 max-w-sm">
                  <div>
                    <label className="text-sm font-medium text-foreground mb-1.5 block">Zoom ID</label>
                    <Input value={zoomId} onChange={(e) => setZoomId(e.target.value)} className="h-10" placeholder="Meeting ID" />
                  </div>
                  <div>
                    <label className="text-sm font-medium text-foreground mb-1.5 block">Zoom Password</label>
                    <Input value={zoomPassword} onChange={(e) => setZoomPassword(e.target.value)} className="h-10" placeholder="Password" />
                  </div>
                </div>
                <div>
                  <label className="text-sm font-medium text-foreground mb-1.5 block">Zoom Link</label>
                  <Input value={zoomLink} onChange={(e) => setZoomLink(e.target.value)} className="h-10 max-w-sm" placeholder="https://zoom.us/j/..." />
                </div>
              </div>
            )}

            {/* Other Platform Fields */}
            {isVirtual && virtualPlatform === "Other" && (
              <div className="space-y-3 p-4 rounded-lg border border-border/50 bg-muted/30">
                <div>
                  <label className="text-sm font-medium text-foreground mb-1.5 block">Platform Name</label>
                  <Input value={platformName} onChange={(e) => setPlatformName(e.target.value)} className="h-10 max-w-sm" placeholder="e.g. Google Meet, Teams" />
                </div>
                <div>
                  <label className="text-sm font-medium text-foreground mb-1.5 block">Link / Access Info</label>
                  <Input value={platformLink} onChange={(e) => setPlatformLink(e.target.value)} className="h-10 max-w-sm" placeholder="Meeting link or access info" />
                </div>
                <div>
                  <label className="text-sm font-medium text-foreground mb-1.5 block">Notes</label>
                  <Input value={virtualNotes} onChange={(e) => setVirtualNotes(e.target.value)} className="h-10 max-w-sm" placeholder="Optional notes" />
                </div>
              </div>
            )}

            {/* Date & Time */}
            <div className="grid grid-cols-2 gap-4 max-w-sm">
              <div>
                <label className="text-sm font-medium text-foreground mb-1.5 block">Date *</label>
                <Input type="date" value={eventDate} onChange={(e) => setEventDate(e.target.value)} className="h-10" />
              </div>
              <div>
                <label className="text-sm font-medium text-foreground mb-1.5 block">Time</label>
                <Input type="time" value={eventTime} onChange={(e) => setEventTime(e.target.value)} className="h-10" />
              </div>
            </div>

            {/* Location — only for In-Person */}
            {!isVirtual && (
              <div className="space-y-3 max-w-sm">
                <div>
                  <label className="text-sm font-medium text-foreground mb-1.5 block">Venue Type</label>
                  <div className="grid grid-cols-3 gap-2">
                    {["Hostess's Home", "My Home Office", "Other Venue"].map((v) => (
                      <button
                        key={v}
                        type="button"
                        onClick={() => {
                          setEventVenueType(v);
                          if (v === "My Home Office" && zoomDefaults?.home_office_address) {
                            setEventLocation(zoomDefaults.home_office_address);
                          } else if (v !== "My Home Office") {
                            setEventLocation("");
                          }
                        }}
                        className={cn(
                          "h-10 rounded-lg border-2 text-xs font-medium transition-colors px-2",
                          eventVenueType === v
                            ? "border-primary bg-primary/10 text-primary"
                            : "border-border bg-background text-muted-foreground hover:bg-muted"
                        )}
                      >
                        {v}
                      </button>
                    ))}
                  </div>
                </div>
                <div>
                  <label className="text-sm font-medium text-foreground mb-1.5 block">
                    {eventVenueType === "Hostess's Home" ? "Hostess's Address" :
                     eventVenueType === "My Home Office" ? "My Address" : "Location / Venue"}
                  </label>
                  <AddressAutocomplete
                    value={eventLocation}
                    onChange={setEventLocation}
                    onAddressSelect={(parsed) => setEventLocation(parsed.formatted)}
                    placeholder={
                      eventVenueType === "Hostess's Home" ? "Hostess's street address" :
                      eventVenueType === "My Home Office" ? "Your home office address" :
                      "Address or venue name"
                    }
                  />
                </div>
              </div>
            )}

            {/* Hostess Name / Event Title */}
            <div>
              <label className="text-sm font-medium text-foreground mb-1.5 block">
                {eventType === "Sharing Appointment" ? "Contact Name" : eventType === "Guest Event" ? "Event Title" : "Hostess Name"}
              </label>
              <Input
                placeholder={eventType === "Guest Event" ? "e.g. Foundation Matching Launch Party" : "Optional — can add later"}
                value={hostessName}
                onChange={(e) => setHostessName(e.target.value)}
                className="h-10 max-w-sm"
              />
            </div>

            {/* Hostess Phone — hide for Guest Events */}
            {eventType !== "Guest Event" && (
            <div>
              <label className="text-sm font-medium text-foreground mb-1.5 block">
                {eventType === "Sharing Appointment" ? "Contact Phone" : "Hostess Phone"}
              </label>
              <Input
                type="tel"
                placeholder="Optional"
                value={hostessPhone}
                onChange={(e) => setHostessPhone(e.target.value)}
                className="h-10 max-w-sm"
              />
            </div>
            )}

            {/* Where did you meet the hostess? — hide for Guest Events */}
            {eventType !== "Guest Event" && (
            <div>
              <label className="text-sm font-medium text-foreground mb-1.5 block">Where did you meet the hostess?</label>
              <select
                value={hostessSource}
                onChange={(e) => setHostessSource(e.target.value)}
                className="h-10 max-w-sm w-full rounded-md border border-input bg-background px-3 text-sm"
              >
                <option value="">— Select —</option>
                {HOSTESS_SOURCE_OPTIONS.map((o) => <option key={o} value={o}>{o}</option>)}
              </select>
            </div>
            )}

            {/* Notes */}
            <div>
              <label className="text-sm font-medium text-foreground mb-1.5 block">Notes</label>
              <Textarea placeholder="Optional notes about the event..." value={notes} onChange={(e) => setNotes(e.target.value)} className="min-h-[80px]" />
            </div>

            {/* Submit */}
            <div className="flex gap-3 pt-2">
              <Button className="h-11 px-8" disabled={!canSubmit} onClick={() => mutation.mutate()}>
                {mutation.isPending ? "Creating..." : "Create Event"}
              </Button>
              <Button variant="outline" className="h-11" onClick={() => navigate(fromPath)}>
                Cancel
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>
    </Layout>
  );
}
