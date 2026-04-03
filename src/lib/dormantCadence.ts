import { addDays, addYears, format } from "date-fns";

/**
 * Dormant customer follow-up cadence:
 * Stage 1 → (initial, already scheduled)
 * Stage 2 → 4-5 days after Stage 1 completion
 * Stage 3 → 4-5 days after Stage 2 completion
 * Annual  → 1 year after Stage 3 completion
 */

export type DormantStage = "Stage 1" | "Stage 2" | "Stage 3" | "Annual" | null;

const TOUCH_GAP_DAYS = 5; // days between touches (4-5 range, using 5)

export function getNextDormantStage(current: DormantStage): DormantStage {
  switch (current) {
    case null:
    case "Stage 1": return "Stage 2";
    case "Stage 2": return "Stage 3";
    case "Stage 3": return "Annual";
    case "Annual": return "Annual"; // stays annual
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
