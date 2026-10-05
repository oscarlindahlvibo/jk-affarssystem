import type { Project, ProjectPriority } from "../types";

const DAY_MS = 24 * 60 * 60 * 1000;

function localDateValue(date: Date): number {
  return Date.UTC(date.getFullYear(), date.getMonth(), date.getDate());
}

export function calculateProjectPriority(
  loadingDate: string | null | undefined,
  today = new Date()
): ProjectPriority {
  if (!loadingDate) return "Kommande";
  const [year, month, day] = loadingDate.split("-").map(Number);
  if (!year || !month || !day) return "Kommande";
  const daysUntilLoading = Math.ceil(
    (Date.UTC(year, month - 1, day) - localDateValue(today)) / DAY_MS
  );
  if (daysUntilLoading <= 7) return "Prioriterad";
  if (daysUntilLoading <= 14) return "Planera";
  return "Kommande";
}

export function effectiveProjectPriority(project: Pick<Project, "planned_loading_date" | "priority" | "priority_is_manual">): ProjectPriority {
  if (project.priority_is_manual && project.priority) return project.priority;
  return calculateProjectPriority(project.planned_loading_date);
}
