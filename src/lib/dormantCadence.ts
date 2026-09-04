import { addDays, addYears, format } from "date-fns";

/**
 * Dormant customer follow-up cadence:
 * Stage 1 → (initial, already scheduled)
 * Stage 2 → 4-5 days after Stage 1 completion
 * Stage 3 → 4-5 days after Stage 2 completion
 * Annual  → 1 year after Stage 3 completion
 *
 * Annual does not repeat forever: after MAX_DORMANT_ANNUAL_CYCLES completed
 * Annual touches with no reorder in between, the customer is auto-archived.
 */

export type DormantStage = "Stage 1" | "Stage 2" | "Stage 3" | "Annual" | null;

const TOUCH_GAP_DAYS = 5; // days between touches (4-5 range, using 5)

/** Completed Annual cycles allowed before the customer is auto-archived. */
export const MAX_DORMANT_ANNUAL_CYCLES = 2;

export function getNextDormantStage(current: DormantStage): DormantStage {
  switch (current) {
    case null:
    case "Stage 1": return "Stage 2";
    case "Stage 2": return "Stage 3";
    case "Stage 3": return "Annual";
    case "Annual": return "Annual"; // stays annual until the cycle cap is hit
    default: return "Stage 2";
  }
}

export function getNextDormantFollowUpDate(currentStage: DormantStage): string {
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const nextStage = getNextDormantStage(currentStage);

  if (nextStage === "Annual") {
    return format(addYears(today, 1), "yyyy-MM-dd");
  }

  // Stage 2 or Stage 3: 4-5 days from now
  return format(addDays(today, TOUCH_GAP_DAYS), "yyyy-MM-dd");
}

export function getDormantStageLabel(stage: DormantStage): string {
  switch (stage) {
    case "Stage 1": return "Touch 1 of 3";
    case "Stage 2": return "Touch 2 of 3";
    case "Stage 3": return "Touch 3 of 3";
    case "Annual": return "Annual Check-In";
    default: return "Touch 1 of 3";
  }
}

export type DormantAdvance = {
  nextStage: DormantStage;
  nextDate: string;
  label: string;
  /** Annual cycles completed after this touch. */
  cyclesCompleted: number;
  /** True when the cycle cap is reached and the customer should be archived. */
  autoArchive: boolean;
};

/**
 * Resolve what happens when a dormant touch is marked complete.
 * Completing an "Annual" touch increments the annual-cycle counter; once it
 * reaches MAX_DORMANT_ANNUAL_CYCLES the customer is archived instead of being
 * scheduled for another Annual check-in.
 */
export function resolveDormantAdvance(
  currentStage: DormantStage,
  cyclesCompleted: number | null | undefined
): DormantAdvance {
  const effectiveStage: DormantStage = currentStage || "Stage 1";
  const prior = Number(cyclesCompleted) || 0;
  const nextStage = getNextDormantStage(effectiveStage);

  if (effectiveStage === "Annual") {
    const cycles = prior + 1;
    if (cycles >= MAX_DORMANT_ANNUAL_CYCLES) {
      return {
        nextStage: "Annual",
        nextDate: "",
        label: `Archived after ${cycles} annual check-ins with no reorder`,
        cyclesCompleted: cycles,
        autoArchive: true,
      };
    }
    return {
      nextStage: "Annual",
      nextDate: getNextDormantFollowUpDate(effectiveStage),
      label: getDormantStageLabel("Annual"),
      cyclesCompleted: cycles,
      autoArchive: false,
    };
  }

  return {
    nextStage,
    nextDate: getNextDormantFollowUpDate(effectiveStage),
    label: getDormantStageLabel(nextStage),
    cyclesCompleted: prior,
    autoArchive: false,
  };
}

/** Note appended to a customer record when auto-archived by the dormant cadence. */
export function dormantAutoArchiveNote(cycles: number, existingNotes?: string | null): string {
  const stamp = format(new Date(), "yyyy-MM-dd");
  const line = `[${stamp}] Auto-archived after ${cycles} dormant annual cycles with no reorder.`;
  return existingNotes && existingNotes.trim() ? `${existingNotes.trim()}\n\n${line}` : line;
}
