// Stämpelklockans regler i ren TypeScript. Speglar databasfunktionerna i
// supabase/migrations/0025_time_tracking.sql och används i mockläget.
import type { Project, TimeCategory, TimeEntry } from "../types";

export type ClockAction = "clockin" | "clockout" | "switch" | "break" | "lunch" | "resume";

export interface ClockJob {
  projectId: string | null;
  taskId: string | null;
  categoryKey: string | null;
}

export interface TimeActor {
  id: string;
  orgId: string;
}

export const CLOCK_CONFLICT = "CLOCK_STATE_CONFLICT";

export function minutesBetween(startIso: string, endIso: string) {
  return Math.max(Math.floor((new Date(endIso).getTime() - new Date(startIso).getTime()) / 60000), 0);
}

export function projectLabel(project: Pick<Project, "project_number" | "name">) {
  return `${project.project_number} · ${project.name}`;
}

function validateJob(job: ClockJob, actor: TimeActor, categories: TimeCategory[], projects: Project[]) {
  if (!job.categoryKey || !categories.some((c) => c.org_id === actor.orgId && c.key === job.categoryKey && c.active)) {
    throw new Error("Tidskategorin är inte tillgänglig.");
  }
  if (job.taskId && !job.projectId) throw new Error("En arbetsorder kräver ett projekt.");
  if (!job.projectId) return null;
  const project = projects.find((p) => p.id === job.projectId && p.org_id === actor.orgId);
  if (!project) throw new Error("Projektet hittades inte.");
  if (job.taskId && !(project.tasks ?? []).some((t) => t.id === job.taskId)) {
    throw new Error("Arbetsordern tillhör inte projektet.");
  }
  return projectLabel(project);
}

function overlaps(entries: TimeEntry[], userId: string, startIso: string, endIso: string, ignoreId?: string) {
  const start = new Date(startIso).getTime();
  const end = new Date(endIso).getTime();
  return entries.some((e) => {
    if (e.user_id !== userId || e.id === ignoreId) return false;
    const eStart = new Date(e.start_time).getTime();
    const eEnd = e.end_time ? new Date(e.end_time).getTime() : Infinity;
    return eStart < end && start < eEnd;
  });
}

function validateSpan(startIso: string, endIso: string, nowMs: number) {
  const start = new Date(startIso).getTime();
  const end = new Date(endIso).getTime();
  if (!Number.isFinite(start) || !Number.isFinite(end) || end <= start) throw new Error("Sluttiden måste vara efter starttiden.");
  if (end > nowMs + 5 * 60000) throw new Error("Tiden kan inte ligga i framtiden.");
  if (end - start > 24 * 3600000) throw new Error("Ett pass kan vara högst 24 timmar.");
}

export interface ClockTransitionArgs {
  id: string;
  action: ClockAction;
  expected: string | null;
  eventIso: string;
  job?: ClockJob;
  closingComment?: string;
  openingComment?: string;
}

export function applyClockTransition(
  entries: TimeEntry[],
  actor: TimeActor,
  args: ClockTransitionArgs,
  categories: TimeCategory[],
  projects: Project[],
  nowIso = new Date().toISOString()
): { entries: TimeEntry[]; current: TimeEntry | null } {
  const { action, eventIso } = args;
  const closing = (args.closingComment ?? "").trim();
  const opening = (args.openingComment ?? "").trim();
  if (new Date(eventIso).getTime() > new Date(nowIso).getTime() + 5 * 60000) throw new Error("Ogiltig stämpling.");

  const open = entries.filter((e) => e.user_id === actor.id && !e.end_time);
  const current = open[0] ?? null;
  if ((current?.id ?? null) !== args.expected) throw new Error(CLOCK_CONFLICT);
  if (!current && entries.some((e) => e.user_id === actor.id && e.end_time && new Date(e.end_time) > new Date(eventIso))) {
    throw new Error(CLOCK_CONFLICT);
  }
  if (action !== "clockin" && !current) throw new Error("Ingen pågående stämpling.");
  if (action === "clockin" && current) throw new Error(CLOCK_CONFLICT);
  if (current && new Date(eventIso) <= new Date(current.start_time)) throw new Error("Tiden ligger före det pågående passet.");
  if ((action === "break" || action === "lunch") && current?.entry_type !== "work") throw new Error("Du är redan på rast.");
  if (action === "resume" && current?.entry_type === "work") throw new Error("Ingen pågående rast.");

  let subject: TimeEntry | null = null;
  if (current?.entry_type === "work") subject = current;
  else if (current) {
    subject = entries
      .filter((e) => e.user_id === actor.id && e.entry_type === "work" && e.end_time === current.start_time)
      .sort((a, b) => (a.start_time < b.start_time ? 1 : -1))[0] ?? null;
  }

  let job: ClockJob = args.job ?? { projectId: null, taskId: null, categoryKey: null };
  let label: string | null = null;
  if (action === "resume" && current) {
    job = { projectId: current.project_id, taskId: current.task_id, categoryKey: current.category_key };
  }
  if (action === "clockin" || action === "switch" || action === "resume") {
    label = validateJob(job, actor, categories, projects);
  }
  if ((action === "break" || action === "lunch") && current) {
    job = { projectId: current.project_id, taskId: current.task_id, categoryKey: current.category_key };
    label = current.project_label;
  }

  let next = entries.map((e) => {
    if (current && e.id === current.id) {
      const withNote =
        subject && subject.id === e.id && closing && ["switch", "clockout", "break", "lunch"].includes(action)
          ? { ...e, comment: e.comment.trim() ? `${e.comment.trim()}\n${closing}` : closing }
          : e;
      return { ...withNote, end_time: eventIso, total_minutes: minutesBetween(e.start_time, eventIso), updated_at: nowIso };
    }
    if (subject && current && subject.id === e.id && subject.id !== current.id && closing && ["switch", "clockout", "break", "lunch"].includes(action)) {
      return { ...e, comment: e.comment.trim() ? `${e.comment.trim()}\n${closing}` : closing, updated_at: nowIso };
    }
    return e;
  });

  let created: TimeEntry | null = null;
  if (action !== "clockout") {
    created = {
      id: args.id,
      org_id: actor.orgId,
      user_id: actor.id,
      project_id: job.projectId,
      project_label: label,
      task_id: job.taskId,
      category_key: job.categoryKey,
      entry_type: action === "break" || action === "lunch" ? action : "work",
      start_time: eventIso,
      end_time: null,
      total_minutes: 0,
      comment: action === "break" ? "Rast" : action === "lunch" ? "Lunch" : opening,
      source: "clock",
      edited_by: null,
      edited_at: null,
      created_at: nowIso,
      updated_at: nowIso,
    };
    next = [created, ...next];
  }
  return { entries: next, current: created };
}

export interface ManualEntryArgs {
  id: string;
  projectId: string | null;
  taskId: string | null;
  categoryKey: string;
  startIso: string;
  endIso: string;
  comment: string;
}

export function addManualEntry(
  entries: TimeEntry[],
  actor: TimeActor,
  args: ManualEntryArgs,
  categories: TimeCategory[],
  projects: Project[],
  nowIso = new Date().toISOString()
): { entries: TimeEntry[]; entry: TimeEntry } {
  validateSpan(args.startIso, args.endIso, new Date(nowIso).getTime());
  const label = validateJob({ projectId: args.projectId, taskId: args.taskId, categoryKey: args.categoryKey }, actor, categories, projects);
  if (overlaps(entries, actor.id, args.startIso, args.endIso)) throw new Error("Tiden överlappar ett annat pass.");
  const entry: TimeEntry = {
    id: args.id,
    org_id: actor.orgId,
    user_id: actor.id,
    project_id: args.projectId,
    project_label: label,
    task_id: args.taskId,
    category_key: args.categoryKey,
    entry_type: "work",
    start_time: args.startIso,
    end_time: args.endIso,
    total_minutes: minutesBetween(args.startIso, args.endIso),
    comment: args.comment.trim(),
    source: "manual",
    edited_by: null,
    edited_at: null,
    created_at: nowIso,
    updated_at: nowIso,
  };
  return { entries: [entry, ...entries], entry };
}

export function updateEntry(
  entries: TimeEntry[],
  actor: TimeActor & { isAdmin: boolean },
  args: Omit<ManualEntryArgs, "id"> & { id: string },
  categories: TimeCategory[],
  projects: Project[],
  nowIso = new Date().toISOString()
): TimeEntry[] {
  const target = entries.find((e) => e.id === args.id);
  if (!target || (target.user_id !== actor.id && !actor.isAdmin)) throw new Error("Ändring nekad.");
  if (!target.end_time) throw new Error("Ett pågående pass ändras genom att stämpla ut först.");
  validateSpan(args.startIso, args.endIso, new Date(nowIso).getTime());
  const isWork = target.entry_type === "work";
  const label = isWork
    ? validateJob({ projectId: args.projectId, taskId: args.taskId, categoryKey: args.categoryKey }, { id: target.user_id, orgId: target.org_id }, categories, projects)
    : target.project_label;
  if (overlaps(entries, target.user_id, args.startIso, args.endIso, target.id)) throw new Error("Tiden överlappar ett annat pass.");
  return entries.map((e) =>
    e.id === target.id
      ? {
          ...e,
          project_id: isWork ? args.projectId : e.project_id,
          project_label: label,
          task_id: isWork ? args.taskId : e.task_id,
          category_key: isWork ? args.categoryKey : e.category_key,
          start_time: args.startIso,
          end_time: args.endIso,
          total_minutes: minutesBetween(args.startIso, args.endIso),
          comment: args.comment.trim(),
          edited_by: actor.id,
          edited_at: nowIso,
          updated_at: nowIso,
        }
      : e
  );
}

export function deleteEntry(entries: TimeEntry[], actor: TimeActor & { isAdmin: boolean }, id: string): TimeEntry[] {
  const target = entries.find((e) => e.id === id);
  if (!target || (target.user_id !== actor.id && !actor.isAdmin)) throw new Error("Radering nekad.");
  if (!target.end_time) throw new Error("Ett pågående pass raderas inte. Stämpla ut först.");
  return entries.filter((e) => e.id !== id);
}
