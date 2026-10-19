// Uppdrag på stämpelklockan i ren TypeScript. Speglar session_* i supabase/migrations/0030_assignment_sessions.sql
// och driver mockläget. Uppdrag är underlag för rapportering: de ändrar aldrig närvaro (lönegrundande tid), och
// flera uppdrag får pågå samtidigt så att fakturerbar tid kan bli högre än arbetad tid.
import type { AssignmentSession } from "../types";

export interface SessionActor {
  id: string;
  orgId: string;
}

export interface SessionProject {
  id: string;
  org_id: string;
  status: string;
  tasks?: { id: string }[];
}

export const MAX_OPEN_SESSIONS = 5;
const MAX_BACKDATE_MS = 15 * 60000;

const round2 = (value: number) => Math.round((value + Number.EPSILON) * 100) / 100;
const minutesBetween = (fromMs: number, toMs: number) => Math.max(Math.floor((toMs - fromMs) / 60000), 0);

export function elapsedMinutes(session: AssignmentSession, nowMs: number): number {
  const end = session.ended_at ? new Date(session.ended_at).getTime() : nowMs;
  return minutesBetween(new Date(session.started_at).getTime(), end);
}

export function waitingMinutes(session: AssignmentSession, nowMs: number): number {
  const end = session.ended_at ? new Date(session.ended_at).getTime() : nowMs;
  const running = session.waiting_started_at ? minutesBetween(new Date(session.waiting_started_at).getTime(), end) : 0;
  return session.waiting_minutes + running;
}

// Förslag till rapporten: arbetstid (utan väntetid) och väntetid var för sig, så väntetiden inte debiteras två gånger.
export function suggestedReport(session: AssignmentSession, nowMs: number): { hours: number; waitingHours: number } {
  const waiting = waitingMinutes(session, nowMs);
  const work = Math.max(elapsedMinutes(session, nowMs) - waiting, 0);
  return { hours: round2(work / 60), waitingHours: round2(waiting / 60) };
}

export function startSession(
  sessions: AssignmentSession[],
  actor: SessionActor,
  args: { id: string; projectId: string; taskId: string | null; startedIso: string },
  project: SessionProject | undefined,
  nowIso: string
): AssignmentSession[] {
  const existing = sessions.find((s) => s.id === args.id);
  if (existing) {
    if (existing.user_id !== actor.id) throw new Error("Åtgärden nekas.");
    return sessions;
  }
  if (!project || project.org_id !== actor.orgId) throw new Error("Projektet hittades inte.");
  if (project.status === "Avbokad" || project.status === "Fakturerad") throw new Error(`Projektet är ${project.status.toLowerCase()} och kan inte få nya uppdrag.`);
  if (args.taskId && !(project.tasks ?? []).some((t) => t.id === args.taskId)) throw new Error("Arbetsordern tillhör inte projektet.");
  const skew = new Date(args.startedIso).getTime() - new Date(nowIso).getTime();
  if (!Number.isFinite(skew) || skew > 5 * 60000 || skew < -MAX_BACKDATE_MS) throw new Error("Ogiltig starttid.");
  const open = sessions.filter((s) => s.user_id === actor.id && !s.ended_at);
  if (open.some((s) => s.project_id === project.id)) throw new Error("Uppdraget pågår redan.");
  if (open.length >= MAX_OPEN_SESSIONS) throw new Error("Du har redan fem pågående uppdrag. Avsluta något först.");
  return [
    {
      id: args.id, org_id: actor.orgId, user_id: actor.id, project_id: project.id, task_id: args.taskId, started_at: args.startedIso,
      ended_at: null, waiting_started_at: null, waiting_minutes: 0, report_id: null, created_at: nowIso,
    },
    ...sessions,
  ];
}

export function setWaiting(sessions: AssignmentSession[], actor: SessionActor, id: string, on: boolean, nowIso: string): AssignmentSession[] {
  const target = sessions.find((s) => s.id === id && s.user_id === actor.id);
  if (!target) throw new Error("Uppdraget hittades inte.");
  if (target.ended_at) throw new Error("Uppdraget är redan avslutat.");
  const nowMs = new Date(nowIso).getTime();
  let next = target;
  if (on && !target.waiting_started_at) next = { ...target, waiting_started_at: nowIso };
  else if (!on && target.waiting_started_at) next = { ...target, waiting_minutes: waitingMinutes(target, nowMs), waiting_started_at: null };
  return sessions.map((s) => (s.id === id ? next : s));
}

// Anropas först när rapporten är sparad. Misslyckas sparningen förblir uppdraget öppet.
export function finishSession(sessions: AssignmentSession[], actor: SessionActor, id: string, endedIso: string | null, reportId: string, nowIso: string): AssignmentSession[] {
  const target = sessions.find((s) => s.id === id && s.user_id === actor.id);
  if (!target) throw new Error("Uppdraget hittades inte.");
  if (target.ended_at) return sessions;
  const nowMs = new Date(nowIso).getTime();
  let endMs = Math.min(new Date(endedIso ?? nowIso).getTime(), nowMs + 5 * 60000);
  endMs = Math.max(endMs, new Date(target.started_at).getTime());
  const endIso = new Date(endMs).toISOString();
  const waiting = waitingMinutes({ ...target, ended_at: endIso }, nowMs);
  return sessions.map((s) => (s.id === id ? { ...s, ended_at: endIso, waiting_started_at: null, waiting_minutes: waiting, report_id: reportId } : s));
}

export function cancelSession(sessions: AssignmentSession[], actor: SessionActor, id: string): AssignmentSession[] {
  const target = sessions.find((s) => s.id === id && s.user_id === actor.id);
  if (!target) return sessions;
  if (target.ended_at) throw new Error("Uppdraget är redan avslutat och har en rapport.");
  return sessions.filter((s) => s.id !== id);
}
