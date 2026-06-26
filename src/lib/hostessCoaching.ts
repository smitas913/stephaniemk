import { supabase } from "@/integrations/supabase/client";
import { toLocalDateKey } from "@/lib/dateOnly";

/**
 * Hostess coaching task sequence.
 * Step 1: Send booking form (immediately, due today)
 * Step 2: Send Canva invite + guest form (after step 1, due today)
 * Step 3: Check in on guest RSVPs (after step 2, due event_date - 3 days; skip if event < 7 days away)
 * Step 4: Text goody bag photo (after step 3 OR auto from step 2 if event within 7 days, due event_date - 1 day)
 */

export const HOSTESS_TASK_TEXT = (step: number, hostessName: string): string => {
  const name = hostessName?.trim() || "your hostess";
  switch (step) {
    case 1: return `Send ${name} her booking form`;
    case 2: return `Send ${name} Canva invite + guest form`;
    case 3: return `Check in with ${name} on guest RSVPs`;
    case 4: return `Text ${name} goody bag photo`;
    default: return `Coaching task for ${name}`;
  }
};

function addDaysLocal(dateKey: string, days: number): string {
  const [y, m, d] = dateKey.split("-").map(Number);
  const dt = new Date(y, m - 1, d);
  dt.setDate(dt.getDate() + days);
  return toLocalDateKey(dt);
}

function daysBetweenLocal(fromKey: string, toKey: string): number {
  const [y1, m1, d1] = fromKey.split("-").map(Number);
  const [y2, m2, d2] = toKey.split("-").map(Number);
  const a = new Date(y1, m1 - 1, d1).getTime();
  const b = new Date(y2, m2 - 1, d2).getTime();
  return Math.round((b - a) / (1000 * 60 * 60 * 24));
}

interface InsertArgs {
  eventId: string;
  hostessName: string | null;
  step: 1 | 2 | 3 | 4;
  dueDate: string;
}

async function insertTask({ eventId, hostessName, step, dueDate }: InsertArgs) {
  const userId = (await supabase.auth.getUser()).data.user?.id;
  if (!userId) return;
  await (supabase as any).from("hostess_coaching_tasks").insert({
    user_id: userId,
    event_id: eventId,
    hostess_name: hostessName?.trim() || "your hostess",
    step,
    text: HOSTESS_TASK_TEXT(step, hostessName || ""),
    due_date: dueDate,
  });
}

/** Called when an event is first created — seeds step 1. */
export async function seedHostessCoaching(eventId: string, hostessName: string | null) {
  const today = toLocalDateKey(new Date());
  await insertTask({ eventId, hostessName, step: 1, dueDate: today });
}

/** Called after a task is completed — creates the next step (if any). */
export async function createNextHostessStep(args: {
  eventId: string;
  hostessName: string | null;
  eventDate: string | null;
  completedStep: number;
}) {
  const { eventId, hostessName, eventDate, completedStep } = args;
  const today = toLocalDateKey(new Date());

  if (completedStep === 1) {
    await insertTask({ eventId, hostessName, step: 2, dueDate: today });
    return;
  }

  if (completedStep === 2) {
    if (!eventDate) return;
    const daysUntilEvent = daysBetweenLocal(today, eventDate);
    if (daysUntilEvent > 7) {
      const due = addDaysLocal(eventDate, -3);
      await insertTask({ eventId, hostessName, step: 3, dueDate: due });
    } else {
      const due = addDaysLocal(eventDate, -1);
      await insertTask({ eventId, hostessName, step: 4, dueDate: due });
    }
    return;
  }

  if (completedStep === 3) {
    if (!eventDate) return;
    const due = addDaysLocal(eventDate, -1);
    await insertTask({ eventId, hostessName, step: 4, dueDate: due });
    return;
  }
  // step 4 is terminal
}
