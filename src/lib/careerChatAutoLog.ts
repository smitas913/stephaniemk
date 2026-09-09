import { supabase } from "@/integrations/supabase/client";
import { createNote } from "@/lib/queries";
import { checkForDuplicatePerson } from "@/lib/duplicateCheck";
import { toLocalDateKey } from "@/lib/dateOnly";
import { addDays, format } from "date-fns";

/** Event types that represent a 1:1 career-chat style appointment. */
export const CAREER_CHAT_EVENT_TYPES = ["Sharing Appointment", "Career Chat", "Pearl Appointment"];

export const isCareerChatEventType = (t: string | null | undefined) =>
  !!t && CAREER_CHAT_EVENT_TYPES.includes(t);

/**
 * Auto-log a career chat when a 1:1 appointment is marked Held.
 * Returns the prospect id that was credited, or null if nothing was logged.
 * Never throws — callers decide how to surface failures.
 */
export async function autoLogCareerChat(ev: any): Promise<string | null> {
  try {
    const isUnit = ev.event_scope === "Unit";
    const consultantId: string | null = ev.assigned_consultant_id ?? null;

    // Unit event with no consultant assigned yet — don't misfile it as personal.
    if (isUnit && !consultantId) return null;

    const chatDate = ev.event_date || toLocalDateKey();
    const name = (ev.hostess_name || "").trim();
    let prospectId: string | null = ev.prospect_id ?? null;

    if (!prospectId && isUnit && name) {
      // Scope the duplicate check to this consultant's own prospects.
      const { data } = await supabase
        .from("prospects" as any)
        .select("id")
        .eq("assigned_consultant_id", consultantId)
        .ilike("name", name)
        .limit(1)
        .maybeSingle();
      if ((data as any)?.id) prospectId = (data as any).id;
    }

    if (!prospectId && !isUnit && (name || ev.hostess_phone)) {
      const { strong, softName } = await checkForDuplicatePerson({
        fullName: name,
        phone: ev.hostess_phone,
        email: ev.hostess_email,
        kind: "prospect",
        prospectsOnly: true,
      });
      const match = strong || softName;
      if (match?.kind === "prospect") prospectId = match.id;
    }

    if (!prospectId) {
      if (!name) return null;
      const userId = (await supabase.auth.getUser()).data.user?.id;
      // A DB trigger requires a next-step/follow-up date for open statuses.
      const followUpDate = format(addDays(new Date(chatDate + "T12:00"), 14), "yyyy-MM-dd");
      const { data: newProspect, error } = await supabase
        .from("prospects" as any)
        .insert({
          name,
          phone: ev.hostess_phone || null,
          email: ev.hostess_email || null,
          opportunity_status: "Follow-Up",
          ownership_type: isUnit ? "unit" : "personal",
          assigned_consultant_id: isUnit ? consultantId : null,
          is_career_chat: true,
          date_shared: chatDate,
          last_contact_date: chatDate,
          next_follow_up_date: followUpDate,
          owner_user_id: userId,
        } as any)
        .select("id")
        .single();
      if (error) throw error;
      prospectId = (newProspect as any).id;
    }

    if (!prospectId) return null;

    const noteBody = "Career chat held";

    await createNote({
      entity_type: "Prospect",
      person_type: "prospect",
      person_id: prospectId,
      prospect_id: prospectId,
      note_body: noteBody,
      note_type: "Career Chat",
      note_date: chatDate,
      result_type: "Career Chat",
    } as any);

    if (isUnit && consultantId) {
      // Mirror QuickCareerChatDialog: a unit-coached chat also lands on the consultant's timeline.
      await createNote({
        entity_type: "Consultant",
        person_type: "consultant",
        person_id: consultantId,
        note_body: noteBody,
        note_type: "Career Chat",
        note_date: chatDate,
        result_type: "Career Chat",
      } as any);
    }

    await supabase.from("prospects" as any).update({
      last_contact_date: chatDate,
      is_career_chat: true,
      ...(isUnit && consultantId ? { ownership_type: "unit", assigned_consultant_id: consultantId } : {}),
    } as any).eq("id", prospectId);

    return prospectId;

  } catch (e: any) {
    console.error("autoLogCareerChat failed", e);
    return null;
  }
}
