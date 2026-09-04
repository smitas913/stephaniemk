import { useState, useMemo } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { useOriginPath } from "@/hooks/usePreviousLocation";
import { useEffect } from "react";
import AddressAutocomplete from "@/components/AddressAutocomplete";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { fetchEvents, insertNewEvent, fetchZoomDefaults, fetchTeamConsultants, createNote } from "@/lib/queries";
import { supabase } from "@/integrations/supabase/client";
import { checkForDuplicatePerson, type DuplicateMatch } from "@/lib/duplicateCheck";
import DuplicateGuardDialog from "@/components/DuplicateGuardDialog";
import { normalizePhoneForStorage } from "@/lib/phoneUtils";
import { generateEventId } from "@/lib/eventId";
import { toLocalDateKey } from "@/lib/dateOnly";
import Layout from "@/components/Layout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent } from "@/components/ui/card";
import { ArrowLeft, PartyPopper, Sparkles, Share2, Megaphone, Monitor, MapPin, Users, UserCheck } from "lucide-react";
import { cn } from "@/lib/utils";
import { toast } from "sonner";

const EVENT_TYPES = [
  { value: "Party", label: "Party", icon: PartyPopper },
  { value: "Facial", label: "Facial", icon: Sparkles },
  { value: "customer_appt", label: "Customer Appt", icon: UserCheck },
  { value: "Guest Event", label: "Guest Event", icon: Users },
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
  // Sharing Appointment — recruiting linkage
  const [sharingOwnership, setSharingOwnership] = useState<"personal" | "unit">("personal");
  const [consultantQuery, setConsultantQuery] = useState("");
  const [selectedConsultant, setSelectedConsultant] = useState<{ id: string; name: string } | null>(null);
  const [dupCheck, setDupCheck] = useState<{ strong: DuplicateMatch | null; softName: DuplicateMatch | null } | null>(null);
  const [dupChecking, setDupChecking] = useState(false);

  // Prefill from query params (e.g. when navigated from "Booking Created" in interaction panel)
  const [pendingGuestName, setPendingGuestName] = useState("");
  const [pendingGuestPhone, setPendingGuestPhone] = useState("");

  useEffect(() => {
    const t = searchParams.get("type");
    const h = searchParams.get("hostess");
    const p = searchParams.get("phone");
    if (t && ["Party", "Facial", "customer_appt", "Guest Event", "Sharing Appointment", "Lead Generating Event"].includes(t)) {
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
  const isSharing = eventType === "Sharing Appointment";

  const { data: consultants = [] } = useQuery({ queryKey: ["team-consultants"], queryFn: fetchTeamConsultants });
  const consultantMatches = useMemo(() => {
    const q = consultantQuery.toLowerCase().trim();
    if (!q || selectedConsultant) return [];
    return (consultants as any[]).filter((c: any) => c.name?.toLowerCase().includes(q)).slice(0, 5);
  }, [consultants, consultantQuery, selectedConsultant]);

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
    mutationFn: async (vars?: { linkProspectId?: string }) => {
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
      // Sharing Appointment: connect the booking to the recruiting pipeline.
      if (isSharing) {
        const contactName = hostessName.trim();
        const contactPhone = normalizePhoneForStorage(hostessPhone) || null;
        const userId = (await supabase.auth.getUser()).data.user?.id || null;
        let prospectId: string | null = vars?.linkProspectId || null;

        if (!prospectId && contactName) {
          const { data: created, error: pErr } = await supabase
            .from("prospects")
            .insert({
              name: contactName,
              phone: contactPhone,
              ownership_type: sharingOwnership,
              assigned_consultant_id: sharingOwnership === "unit" ? selectedConsultant?.id ?? null : null,
              is_career_chat: true,
              opportunity_status: "Booked",
              date_shared: eventDate || null,
              next_step_type: "Sharing Appointment",
              next_step_date: eventDate || null,
              next_follow_up_date: eventDate || null,
              owner_user_id: userId,
            } as any)
            .select("id")
            .single();
          if (pErr) throw pErr;
          prospectId = (created as any)?.id || null;
        } else if (prospectId) {
          // Linking to an existing prospect — reflect the new booking on their record.
          await supabase.from("prospects").update({
            opportunity_status: "Booked",
            is_career_chat: true,
            next_step_type: "Sharing Appointment",
            next_step_date: eventDate || null,
            next_follow_up_date: eventDate || null,
            ...(sharingOwnership === "unit" && selectedConsultant
              ? { ownership_type: "unit", assigned_consultant_id: selectedConsultant.id }
              : {}),
          } as any).eq("id", prospectId);
        }

        if (prospectId) payload.prospect_id = prospectId;

        const inserted = await insertNewEvent(payload as any);

        if (prospectId) {
          const body = `Sharing appointment scheduled for ${eventDate}${eventTime ? ` at ${eventTime}` : ""}.`;
          try {
            // NOTE: no result_type here on purpose — the career_chats metric should only
            // move once the conversation is actually logged after the appointment.
            await createNote({
              entity_type: "Prospect",
              person_type: "prospect",
              person_id: prospectId,
              prospect_id: prospectId,
              note_body: body,
              note_type: "Sharing Appointment",
              note_date: toLocalDateKey(),
            });
            if (sharingOwnership === "unit" && selectedConsultant) {
              await createNote({
                entity_type: "Consultant",
                person_type: "consultant",
                person_id: selectedConsultant.id,
                note_body: `${contactName || "Prospect"} — ${body}`,
                note_type: "Sharing Appointment",
                note_date: toLocalDateKey(),
              });
            }
          } catch (e) {
            console.error("Failed to add sharing appointment notes", e);
          }
        }
        return (inserted?.event_id as string) || eventId;
      }

      const inserted = await insertNewEvent(payload as any);
      return (inserted?.event_id as string) || eventId;
    },
    onSuccess: async (eventId) => {
      queryClient.invalidateQueries({ queryKey: ["events"] });
      queryClient.invalidateQueries({ queryKey: ["event-tasks"] });
      queryClient.invalidateQueries({ queryKey: ["prospects"] });
      queryClient.invalidateQueries({ queryKey: ["unified-notes"] });


      // Auto-add pending guest for Guest Events booked from lead/booking flow
      if (eventType === "Guest Event" && pendingGuestName) {
        if (pendingGuestName.trim().toLowerCase() !== (hostessName || "").trim().toLowerCase()) {
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
      }

      // Auto-add guest from "Booked Next Event" flow (any event type)
      if (searchParams.get("addGuest") === "true") {
        const guestName = searchParams.get("guestName");
        const guestPhone = searchParams.get("guestPhone");
        if (guestName && guestName.trim().toLowerCase() !== (hostessName || "").trim().toLowerCase()) {
          try {
            const { supabase } = await import("@/integrations/supabase/client");
            const userId = (await supabase.auth.getUser()).data.user?.id;
            await supabase.from("event_guests" as any).insert({
              event_id: eventId,
              name: guestName,
              phone: guestPhone || null,
              owner_user_id: userId,
              rsvp: "Yes",
              attending: true,
            } as any);
          } catch (e) {
            console.error("Failed to add booked guest", e);
          }
        }
      }

      toast.success("Event created");
      navigate("/events");
    },
    onError: (err: any) => {
      toast.error(err.message || "Failed to create event");
    },
  });

  const canSubmit = eventType && eventDate && (!isLeadGen || leadGenSubtype)
    && (!isSharing || sharingOwnership === "personal" || !!selectedConsultant)
    && !mutation.isPending && !dupChecking;

  // For Sharing Appointments, look for an existing prospect before creating a new one.
  const handleCreate = async () => {
    const contactName = hostessName.trim();
    if (!isSharing || !contactName) {
      mutation.mutate({});
      return;
    }
    setDupChecking(true);
    try {
      const res = await checkForDuplicatePerson({
        fullName: contactName,
        phone: hostessPhone,
        kind: "prospect",
        prospectsOnly: true,
      });
      if (res.strong || res.softName) {
        setDupCheck(res);
        return;
      }
    } catch (e) {
      console.error("Prospect duplicate check failed", e);
    } finally {
      setDupChecking(false);
    }
    mutation.mutate({});
  };

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

            {/* Location — Sharing Appointment: single plain location field */}
            {!isVirtual && isSharing && (
              <div className="max-w-sm">
                <label className="text-sm font-medium text-foreground mb-1.5 block">Location</label>
                <AddressAutocomplete
                  value={eventLocation}
                  onChange={setEventLocation}
                  onAddressSelect={(parsed) => setEventLocation(parsed.formatted)}
                  placeholder="Address, coffee shop, or meeting spot"
                />
              </div>
            )}

            {/* Location — only for In-Person */}
            {!isVirtual && !isSharing && (
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
                {eventType === "Sharing Appointment" ? "Prospect Name" : eventType === "Guest Event" ? "Event Title" : "Hostess Name"}
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
                {eventType === "Sharing Appointment" ? "Prospect Number" : "Hostess Phone"}
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

            {/* Personal / Unit toggle — Sharing Appointment only */}
            {isSharing && (
              <div className="max-w-sm space-y-3">
                <div>
                  <label className="text-sm font-medium text-foreground mb-2 block">Who is this for?</label>
                  <div className="flex gap-3">
                    {([["personal", "Personal"], ["unit", "For a Consultant"]] as const).map(([val, label]) => (
                      <button
                        key={val}
                        type="button"
                        onClick={() => {
                          setSharingOwnership(val);
                          if (val === "personal") { setSelectedConsultant(null); setConsultantQuery(""); }
                        }}
                        className={cn(
                          "flex-1 h-10 rounded-lg border-2 text-sm font-medium transition-colors",
                          sharingOwnership === val
                            ? "border-primary bg-primary/10 text-primary"
                            : "border-border bg-background text-muted-foreground hover:bg-muted"
                        )}
                      >
                        {label}
                      </button>
                    ))}
                  </div>
                </div>
                {sharingOwnership === "unit" && (
                  <div>
                    <label className="text-sm font-medium text-foreground mb-1.5 block">Which consultant? *</label>
                    <Input
                      placeholder="Search consultant..."
                      value={selectedConsultant ? selectedConsultant.name : consultantQuery}
                      onChange={(e) => { setConsultantQuery(e.target.value); setSelectedConsultant(null); }}
                      className="h-10"
                    />
                    {consultantMatches.length > 0 && !selectedConsultant && (
                      <div className="border border-border rounded-lg mt-1 divide-y divide-border/40">
                        {consultantMatches.map((c: any) => (
                          <button key={c.id} type="button" className="w-full text-left px-3 py-2 hover:bg-muted/50 text-sm"
                            onClick={() => { setSelectedConsultant({ id: c.id, name: c.name }); setConsultantQuery(c.name); }}>
                            {c.name}
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                )}
              </div>
            )}

            {/* Where did you meet the hostess? — hide for Guest Events and Sharing Appointments */}
            {eventType !== "Guest Event" && !isSharing && (
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
              <Button className="h-11 px-8" disabled={!canSubmit} onClick={handleCreate}>
                {mutation.isPending || dupChecking ? "Creating..." : "Create Event"}
              </Button>
              <Button variant="outline" className="h-11" onClick={() => navigate(fromPath)}>
                Cancel
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>

      <DuplicateGuardDialog
        open={!!dupCheck}
        onOpenChange={(v) => { if (!v) { setDupCheck(null); setDupChecking(false); } }}
        strong={dupCheck?.strong || null}
        softName={dupCheck?.softName || null}
        attemptedName={hostessName.trim()}
        targetKind="prospect"
        linkLabel="Link to existing prospect"
        createLabel="Create new prospect"
        linkPending={mutation.isPending}
        onLinkExisting={(match) => { setDupCheck(null); setDupChecking(false); mutation.mutate({ linkProspectId: match.id }); }}
        onCreateAnyway={() => { setDupCheck(null); setDupChecking(false); mutation.mutate({}); }}
      />
    </Layout>
  );
}
