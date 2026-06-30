import { useState, useEffect, useRef } from "react";
import { addDays, differenceInDays, format, parseISO } from "date-fns";
import type { TeamConsultant } from "@/lib/types";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { ChevronDown, ChevronRight, Minus, Plus, UserX } from "lucide-react";
import { cn } from "@/lib/utils";
import { toLocalDateKey, formatDateOnly } from "@/lib/dateOnly";

type Props = {
  consultant: TeamConsultant;
  onUpdate: (fields: Partial<TeamConsultant>) => void;
};

function Counter({
  value, max, onChange,
}: { value: number; max: number; onChange: (n: number) => void }) {
  return (
    <div className="inline-flex items-center gap-2">
      <Button
        type="button" size="icon" variant="outline" className="h-6 w-6 rounded-full"
        onClick={() => onChange(Math.max(0, value - 1))}
        disabled={value <= 0}
      >
        <Minus className="w-3 h-3" />
      </Button>
      <span className="text-xs font-semibold tabular-nums w-10 text-center">
        {value}<span className="text-muted-foreground"> / {max}</span>
      </span>
      <Button
        type="button" size="icon" variant="outline" className="h-6 w-6 rounded-full"
        onClick={() => onChange(Math.min(max, value + 1))}
        disabled={value >= max}
      >
        <Plus className="w-3 h-3" />
      </Button>
    </div>
  );
}

function Row({ label, children }: { label: React.ReactNode; children: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-3 py-1">
      <span className="text-xs text-foreground">{label}</span>
      <div className="shrink-0">{children}</div>
    </div>
  );
}

export default function OnboardingTrackerPanel({ consultant, onUpdate }: Props) {
  const tracker = (consultant.onboarding_tracker || {}) as Record<string, any>;

  // Local text state for debounced fields
  const [greatStartNotes, setGreatStartNotes] = useState<string>(tracker.great_start_notes || "");
  const greatStartTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    setGreatStartNotes(tracker.great_start_notes || "");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [consultant.id]);

  const saveTracker = (patch: Record<string, any>) => {
    onUpdate({ onboarding_tracker: { ...tracker, ...patch } });
  };

  const get = (k: string, fallback: any = false) => (tracker[k] ?? fallback);

  const debutDate = consultant.debut_date || "";
  const debutEnd = debutDate ? format(addDays(parseISO(debutDate), 30), "MMM d, yyyy") : null;
  const daysRemaining = debutDate
    ? 30 - differenceInDays(new Date(), parseISO(debutDate))
    : null;

  const checklistKeys = [
    "checklist_call_scheduled",
    "checklist_photo_sent",
    "checklist_intouch_setup",
    "checklist_social_connected",
  ];
  const checklistDone = checklistKeys.filter((k) => !!tracker[k]).length;
  

  const [preOpen, setPreOpen] = useState(!debutDate);
  const [postOpen, setPostOpen] = useState(!!debutDate);
  const [exitOpen, setExitOpen] = useState(false);

  const powerFaces = Number(get("power_start_faces", 0));
  const powerParties = Number(get("power_start_parties", 0));
  const powerComplete = powerFaces >= 30 && powerParties >= 5;
  const pearlsCount = Number(get("pearls_sharing_count", 0));


  const handleExit = (status: "Personal Use" | "Exited") => {
    onUpdate({
      onboarding_exit_status: status,
      onboarding_exit_date: toLocalDateKey(),
    });
  };

  const CheckpointSection = ({ prefix, label }: { prefix: string; label: string }) => {
    const [open, setOpen] = useState(false);
    const isLogged = !!get(`${prefix}_date`);

    const handleOpen = (val: boolean) => {
      setOpen(val);
      if (val && !get(`${prefix}_date`)) {
        saveTracker({ [`${prefix}_date`]: toLocalDateKey() });
      }
    };

    return (
      <Collapsible open={open} onOpenChange={handleOpen}>
        <CollapsibleTrigger asChild>
          <button className="flex items-center justify-between w-full text-left py-1">
            <div className="flex items-center gap-2">
              {open ? <ChevronDown className="w-3 h-3" /> : <ChevronRight className="w-3 h-3" />}
              <span className="text-xs font-medium">{label}</span>
              {isLogged && <Badge variant="secondary" className="text-[10px] bg-green-100 text-green-700">Logged</Badge>}
            </div>
          </button>
        </CollapsibleTrigger>
        <CollapsibleContent className="pt-1 pl-4 space-y-2">
          <div className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1.5 items-center text-xs">
            <span className="text-muted-foreground">Date logged</span>
            <Input type="date" className="h-7 text-xs w-[140px]"
              value={get(`${prefix}_date`, "") || ""}
              onChange={(e) => saveTracker({ [`${prefix}_date`]: e.target.value || null })} />
            <span className="text-muted-foreground">Faces to date</span>
            <input type="number" min={0} className="h-7 text-xs w-[60px] border rounded px-2 bg-background"
              value={get(`${prefix}_faces`, "") || ""}
              onChange={(e) => saveTracker({ [`${prefix}_faces`]: e.target.value ? Number(e.target.value) : null })} />
            <span className="text-muted-foreground">Parties held</span>
            <input type="number" min={0} className="h-7 text-xs w-[60px] border rounded px-2 bg-background"
              value={get(`${prefix}_parties`, "") || ""}
              onChange={(e) => saveTracker({ [`${prefix}_parties`]: e.target.value ? Number(e.target.value) : null })} />
            <span className="text-muted-foreground">Sharing appts</span>
            <input type="number" min={0} className="h-7 text-xs w-[60px] border rounded px-2 bg-background"
              value={get(`${prefix}_sharing`, "") || ""}
              onChange={(e) => saveTracker({ [`${prefix}_sharing`]: e.target.value ? Number(e.target.value) : null })} />
            <span className="text-muted-foreground">Inventory on hand</span>
            <Checkbox checked={!!get(`${prefix}_inventory`)}
              onCheckedChange={(v) => saveTracker({ [`${prefix}_inventory`]: !!v })} />
            <span className="text-muted-foreground">Great Start status</span>
            <Input className="h-7 text-xs" placeholder="e.g. $420 of $600"
              value={get(`${prefix}_great_start`, "") || ""}
              onChange={(e) => saveTracker({ [`${prefix}_great_start`]: e.target.value || null })} />
          </div>
          <Textarea className="min-h-[40px] text-xs" placeholder="Notes..."
            value={get(`${prefix}_notes`, "") || ""}
            onChange={(e) => saveTracker({ [`${prefix}_notes`]: e.target.value || null })} />
        </CollapsibleContent>
      </Collapsible>
    );
  };

  return (
    <div className="rounded-lg border border-pink-200 bg-pink-50/30 p-3 space-y-3">
      <div className="flex items-center justify-between">
        <p className="text-xs font-semibold text-pink-700 uppercase tracking-wider">
          🌟 New Consultant Onboarding
        </p>
        {daysRemaining !== null && (
          <Badge variant="outline" className="text-[10px] bg-white">
            {daysRemaining > 0 ? `${daysRemaining}d left` : "30-Day Complete"}
          </Badge>
        )}
      </div>

      {/* PRE-DEBUT */}
      <Collapsible open={preOpen} onOpenChange={setPreOpen}>
        <CollapsibleTrigger asChild>
          <button className="flex items-center justify-between w-full text-left">
            <div className="flex items-center gap-2">
              {preOpen ? <ChevronDown className="w-3.5 h-3.5" /> : <ChevronRight className="w-3.5 h-3.5" />}
              <span className="text-xs font-semibold">Pre-Debut</span>
              <Badge variant="secondary" className="text-[10px] bg-pink-100 text-pink-700">
                {checklistDone}/4 checklist
              </Badge>
            </div>
          </button>
        </CollapsibleTrigger>
        <CollapsibleContent className="pt-2 space-y-2">
          <div className="grid grid-cols-[1fr_auto] gap-2 items-center">
            <label className="text-xs">Welcome Call</label>
            <div className="flex items-center gap-2">
              <Input
                type="date" className="h-7 text-xs w-[140px]"
                value={get("welcome_call_date", "") || ""}
                onChange={(e) => saveTracker({ welcome_call_date: e.target.value || null })}
              />
              <Checkbox
                checked={!!get("welcome_call_done")}
                onCheckedChange={(v) => saveTracker({ welcome_call_done: !!v })}
              />
            </div>
            <label className="text-xs">Onboarding Call</label>
            <div className="flex items-center gap-2">
              <Input
                type="date" className="h-7 text-xs w-[140px]"
                value={get("onboarding_call_date", "") || ""}
                onChange={(e) => saveTracker({ onboarding_call_date: e.target.value || null })}
              />
              <Checkbox
                checked={!!get("onboarding_call_done")}
                onCheckedChange={(v) => saveTracker({ onboarding_call_done: !!v })}
              />
            </div>
          </div>

          <div className="space-y-1 pt-1">
            <p className="text-[10px] font-semibold text-muted-foreground uppercase">48-Hour Checklist</p>
            {[
              ["checklist_call_scheduled", "Welcome call with Stephanie scheduled"],
              ["checklist_photo_sent", "Photo sent for recognition"],
              ["checklist_intouch_setup", "InTouch account set up"],
              ["checklist_social_connected", "Social connected + boards downloaded"],
            ].map(([k, label]) => (
              <label key={k} className="flex items-center gap-2 cursor-pointer">
                <Checkbox
                  checked={!!get(k)}
                  onCheckedChange={(v) => saveTracker({ [k]: !!v })}
                />
                <span className="text-xs">{label}</span>
              </label>
            ))}
          </div>

          <div>
            <label className="text-[10px] font-semibold text-muted-foreground uppercase">Debut Date</label>
            <Input
              type="date" className="h-7 text-xs w-[180px]"
              value={debutDate || ""}
              onChange={(e) => onUpdate({ debut_date: e.target.value || null })}
            />
            {debutEnd && (
              <p className="text-[10px] text-muted-foreground mt-1">
                30-Day Challenge ends: {debutEnd}
              </p>
            )}
          </div>
        </CollapsibleContent>
      </Collapsible>

      {/* POST-DEBUT */}
      {debutDate && (
        <>
          <Separator />
          <Collapsible open={postOpen} onOpenChange={setPostOpen}>
            <CollapsibleTrigger asChild>
              <button className="flex items-center justify-between w-full text-left">
                <div className="flex items-center gap-2">
                  {postOpen ? <ChevronDown className="w-3.5 h-3.5" /> : <ChevronRight className="w-3.5 h-3.5" />}
                  <span className="text-xs font-semibold">30-Day Challenge</span>
                  <Badge variant="secondary" className="text-[10px] bg-pink-100 text-pink-700">
                    {daysRemaining! > 0 ? `${daysRemaining} days remaining` : "Complete"}
                  </Badge>
                </div>
              </button>
            </CollapsibleTrigger>
            <CollapsibleContent className="pt-2 space-y-3">
              {/* People */}
              <div>
                <p className="text-[10px] font-semibold text-muted-foreground uppercase mb-1">People</p>
                <Row label="Training appts with Stephanie">
                  <Counter
                    value={Number(get("people_training_stephanie", 0))} max={3}
                    onChange={(n) => saveTracker({ people_training_stephanie: n })}
                  />
                </Row>
                <Row label="Own appointments">
                  <Counter
                    value={Number(get("people_own_appts", 0))} max={3}
                    onChange={(n) => saveTracker({ people_own_appts: n })}
                  />
                </Row>
              </div>

              {/* Parties */}
              <div>
                <p className="text-[10px] font-semibold text-muted-foreground uppercase mb-1">Parties</p>
                <Row label="Next party">
                  <Input
                    type="date" className="h-7 text-xs w-[140px]"
                    value={get("party_next_date", "") || ""}
                    onChange={(e) => saveTracker({ party_next_date: e.target.value || null })}
                  />
                </Row>
                <Row label="Parties held">
                  <Counter value={Number(get("parties_held", 0))} max={20}
                    onChange={(n) => saveTracker({ parties_held: n })} />
                </Row>
              </div>

              {/* Pearls */}
              <div>
                <p className="text-[10px] font-semibold text-muted-foreground uppercase mb-1">Pearls of Sharing</p>
                <Row label="Sharing appts (Stephanie facilitates)">
                  <Counter
                    value={pearlsCount} max={6}
                    onChange={(n) => saveTracker({ pearls_sharing_count: n })}
                  />
                </Row>
                {pearlsCount >= 3 && (
                  <label className="flex items-center gap-2 cursor-pointer py-0.5">
                    <Checkbox
                      checked={!!get("pearls_earrings_given")}
                      onCheckedChange={(v) => saveTracker({ pearls_earrings_given: !!v })}
                    />
                    <span className="text-xs">Pearl Earrings given</span>
                  </label>
                )}
                {pearlsCount >= 6 && (
                  <label className="flex items-center gap-2 cursor-pointer py-0.5">
                    <Checkbox
                      checked={!!get("pearls_bracelet_given")}
                      onCheckedChange={(v) => saveTracker({ pearls_bracelet_given: !!v })}
                    />
                    <span className="text-xs">Bracelet given</span>
                  </label>
                )}
                <label className="flex items-center gap-2 cursor-pointer py-0.5">
                  <Checkbox
                    checked={!!get("pearls_necklace_given")}
                    onCheckedChange={(v) => saveTracker({ pearls_necklace_given: !!v })}
                  />
                  <span className="text-xs">Necklace for 1st Team Member</span>
                </label>
              </div>

              {/* Product */}
              <div>
                <p className="text-[10px] font-semibold text-muted-foreground uppercase mb-1">Product</p>
                {[
                  ["product_inventory_decision", "Inventory decision made"],
                  ["product_first_sale", "First product sold"],
                  ["product_on_hand", "Product on hand"],
                ].map(([k, label]) => (
                  <label key={k} className="flex items-center gap-2 cursor-pointer py-0.5">
                    <Checkbox
                      checked={!!get(k)}
                      onCheckedChange={(v) => saveTracker({ [k]: !!v })}
                    />
                    <span className="text-xs">{label}</span>
                  </label>
                ))}
              </div>

              {/* Power Start */}
              <div>
                <div className="flex items-center justify-between mb-1">
                  <p className="text-[10px] font-semibold text-muted-foreground uppercase">Power Start</p>
                  {powerComplete && (
                    <Badge className="text-[10px] bg-green-100 text-green-700 border-green-200 hover:bg-green-100">
                      Power Start Complete! 🎉
                    </Badge>
                  )}
                </div>
                <Row label="Faces">
                  <Counter value={powerFaces} max={30}
                    onChange={(n) => saveTracker({ power_start_faces: n })} />
                </Row>
                <Row label="Parties">
                  <Counter value={powerParties} max={5}
                    onChange={(n) => saveTracker({ power_start_parties: n })} />
                </Row>
              </div>

              {/* Great Start */}
              <div>
                <p className="text-[10px] font-semibold text-muted-foreground uppercase mb-1">Great Start</p>
                <p className="text-[10px] text-muted-foreground mb-1">
                  Check InTouch for production toward $600 wholesale Great Start bundle
                </p>
                <Textarea
                  className="min-h-[50px] text-xs"
                  placeholder="Notes from InTouch report..."
                  value={greatStartNotes}
                  onChange={(e) => {
                    setGreatStartNotes(e.target.value);
                    if (greatStartTimer.current) clearTimeout(greatStartTimer.current);
                    greatStartTimer.current = setTimeout(() => {
                      saveTracker({ great_start_notes: e.target.value });
                    }, 700);
                  }}
                  onBlur={() => {
                    if (greatStartTimer.current) clearTimeout(greatStartTimer.current);
                    saveTracker({ great_start_notes: greatStartNotes });
                  }}
                />
                <div className="mt-1">
                  <label className="text-[10px] text-muted-foreground">Last checked InTouch</label>
                  <Input
                    type="date" className="h-7 text-xs w-[160px]"
                    value={get("great_start_checked_date", "") || ""}
                    onChange={(e) => saveTracker({ great_start_checked_date: e.target.value || null })}
                  />
                </div>
              </div>

              {/* Launch Party */}
              <div>
                <p className="text-[10px] font-semibold text-muted-foreground uppercase mb-1">Launch Party</p>
                <label className="flex items-center gap-2 cursor-pointer py-0.5">
                  <Checkbox
                    checked={!!get("launch_party_done")}
                    onCheckedChange={(v) => saveTracker({ launch_party_done: !!v })}
                  />
                  <span className="text-xs">Launch Party held</span>
                </label>
                <Input
                  type="date" className="h-7 text-xs w-[160px]"
                  value={get("launch_party_date", "") || ""}
                  onChange={(e) => saveTracker({ launch_party_date: e.target.value || null })}
                />
              </div>
            </CollapsibleContent>
          </Collapsible>
        </>
      )}

      {debutDate && (
        <>
          <Separator />
          <Collapsible>
            <CollapsibleTrigger asChild>
              <button className="flex items-center justify-between w-full text-left">
                <div className="flex items-center gap-2">
                  <ChevronRight className="w-3.5 h-3.5" />
                  <span className="text-xs font-semibold">📍 Coaching Checkpoints</span>
                  <Badge variant="secondary" className="text-[10px]">
                    {["cp30", "cp60", "cp90"].filter(p => !!get(`${p}_date`)).length}/3 logged
                  </Badge>
                </div>
              </button>
            </CollapsibleTrigger>
            <CollapsibleContent className="pt-2 space-y-1">
              <CheckpointSection prefix="cp30" label="Day 30" />
              <CheckpointSection prefix="cp60" label="Day 60" />
              <CheckpointSection prefix="cp90" label="Day 90" />
            </CollapsibleContent>
          </Collapsible>
        </>
      )}

      <Separator />

      {/* Exit Button */}
      <AlertDialog open={exitOpen} onOpenChange={setExitOpen}>
        <AlertDialogTrigger asChild>
          <Button variant="outline" size="sm" className="w-full gap-1 h-7 text-xs text-muted-foreground hover:text-destructive">
            <UserX className="w-3 h-3" />
            Remove from New Consultant Cycle
          </Button>
        </AlertDialogTrigger>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Remove {consultant.name}?</AlertDialogTitle>
            <AlertDialogDescription>
              Choose a reason. This hides the onboarding tracker and removes them from the New Consultants group.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <div className="space-y-2">
            <button
              className="w-full text-left rounded-md border p-3 hover:bg-accent"
              onClick={() => { handleExit("Personal Use"); setExitOpen(false); }}
            >
              <p className="text-sm font-semibold">Personal Use</p>
              <p className="text-xs text-muted-foreground">Joining to support Stephanie; not actively building</p>
            </button>
            <button
              className="w-full text-left rounded-md border p-3 hover:bg-accent"
              onClick={() => { handleExit("Exited"); setExitOpen(false); }}
            >
              <p className="text-sm font-semibold">Exited</p>
              <p className="text-xs text-muted-foreground">No longer active as a consultant</p>
            </button>
          </div>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
