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
    const chatDate = ev.event_date || toLocalDateKey();
    const name = (ev.hostess_name || "").trim();
    let prospectId: string | null = ev.prospect_id ?? null;

    if (!prospectId && (name || ev.hostess_phone)) {
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
          ownership_type: "personal",
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

    await createNote({
      entity_type: "Prospect",
      person_type: "prospect",
      person_id: prospectId,
      prospect_id: prospectId,
      note_body: "Career chat held",
      note_type: "Career Chat",
      note_date: chatDate,
      result_type: "Career Chat",
    } as any);

    await supabase.from("prospects" as any).update({
      last_contact_date: chatDate,
      is_career_chat: true,
    } as any).eq("id", prospectId);

    return prospectId;
  } catch (e: any) {
    console.error("autoLogCareerChat failed", e);
    return null;
  }
}
