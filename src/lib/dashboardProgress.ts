export type DashboardProgressTone = "underGoal" | "goalHit";

export function getDashboardProgressTone(current: number, goal: number): DashboardProgressTone {
  return goal > 0 && current >= goal ? "goalHit" : "underGoal";
}

export const DASHBOARD_PROGRESS_STYLES = {
  underGoal: {
    text: "text-goal-under",
    bar: "[&>div]:bg-goal-under",
    border: "border-goal-under/40",
  },
  goalHit: {
    text: "text-goal-hit-text",
    bar: "[&>div]:bg-goal-hit",
    border: "border-goal-hit/40",
  },
} as const;