// Stämpelklockans och löneflödets regler i ren TypeScript. Speglar databasfunktionerna i
// supabase/migrations/0028_attendance_and_payroll.sql (som är den skarpa källan) och driver mockläget.
import type {
  AttendanceAbsence,
  AttendanceAudit,
  AttendanceCorrection,
  AttendanceEntry,
  AttendanceEntryType,
  PayrollAdjustment,
  PayrollExportRecord,
  PayrollLogRow,
  PayrollPeriod,
  PayrollStatement,
  UserRole,
} from "../types";
import { localDateKey, minutesBetweenInstants } from "./stockholmTime";

export const CLOCK_CONFLICT = "CLOCK_STATE_CONFLICT";
export const MAX_CLOCK_BACKDATE_MS = 15 * 60000;

export interface AttendanceState {
  entries: AttendanceEntry[];
  audit: AttendanceAudit[];
  corrections: AttendanceCorrection[];
  absences: AttendanceAbsence[];
  periods: PayrollPeriod[];
  statements: PayrollStatement[];
  adjustments: PayrollAdjustment[];
  exports: PayrollExportRecord[];
  log: PayrollLogRow[];
}

export const emptyAttendanceState = (): AttendanceState => ({
  entries: [], audit: [], corrections: [], absences: [], periods: [], statements: [], adjustments: [], exports: [], log: [],
});

export interface Actor {
  id: string;
  orgId: string;
  role: UserRole;
}

const ATTESTER: UserRole[] = ["admin", "projektledare"];
const PAYROLL_ADMIN: UserRole[] = ["admin", "ekonomi"];
export const canAttest = (role: UserRole) => ATTESTER.includes(role);
export const isPayrollAdmin = (role: UserRole) => PAYROLL_ADMIN.includes(role);
export const canViewPayroll = (role: UserRole) => role === "admin" || role === "projektledare" || role === "ekonomi";

const id = () => crypto.randomUUID();

export function lockState(state: AttendanceState, userId: string, from: string, to: string): "exported" | "attested" | null {
  const covering = state.statements.filter((s) => {
    const period = state.periods.find((p) => p.id === s.period_id);
    return s.user_id === userId && period && period.start_date <= to && period.end_date >= from;
  });
  if (covering.some((s) => s.status === "exported")) return "exported";
  if (covering.some((s) => s.status === "attested" || s.status === "reviewed")) return "attested";
  return null;
}

function logRow(actor: Actor, userId: string, action: string, reason: string | null, statement: PayrollStatement | null, nowIso: string): PayrollLogRow {
  return { id: id(), org_id: actor.orgId, statement_id: statement?.id ?? null, period_id: statement?.period_id ?? null, user_id: userId, action, reason, details: null, actor: actor.id, at: nowIso };
}

function coveringStatements(state: AttendanceState, userId: string, from: string, to: string, statuses: string[]) {
  return state.statements.filter((s) => {
    const period = state.periods.find((p) => p.id === s.period_id);
    return s.user_id === userId && statuses.includes(s.status) && period && period.start_date <= to && period.end_date >= from;
  });
}

// Kontrollerar periodlås och öppnar/flaggar berörda sammanställningar (samma regler som i databasen).
export function guardChange(state: AttendanceState, actor: Actor, userId: string, from: string, to: string, reason: string | null, nowIso: string): AttendanceState {
  const lock = lockState(state, userId, from, to);
  const trimmed = (reason ?? "").trim();
  let next = state;
  if (lock === "exported") {
    if (actor.role !== "admin") throw new Error("Perioden är exporterad. Endast admin kan göra en spårbar rättelse.");
    if (!trimmed) throw new Error("Ange orsak till rättelsen.");
    const hit = coveringStatements(state, userId, from, to, ["exported"]);
    next = {
      ...state,
      statements: state.statements.map((s) => (hit.some((h) => h.id === s.id) ? { ...s, pending_adjustment: true } : s)),
      log: [...state.log, ...hit.map((s) => logRow(actor, userId, "correction_after_export", trimmed, s, nowIso))],
    };
  } else if (lock === "attested") {
    if (!canAttest(actor.role)) throw new Error("Perioden är attesterad och kan inte ändras.");
    if (!trimmed) throw new Error("Ange orsak. Attesten öppnas igen.");
    const hit = coveringStatements(state, userId, from, to, ["attested", "reviewed"]);
    next = {
      ...state,
      statements: state.statements.map((s) =>
        hit.some((h) => h.id === s.id)
          ? { ...s, status: "preliminary", attested_at: null, attested_by: null, reviewed_at: null, reviewed_by: null, totals: null, days: null, rule_snapshot: null }
          : s
      ),
      log: [...state.log, ...hit.map((s) => logRow(actor, userId, "reopened_by_change", trimmed, s, nowIso))],
    };
  } else {
    const hit = coveringStatements(state, userId, from, to, ["submitted"]);
    if (hit.length > 0) {
      next = { ...state, statements: state.statements.map((s) => (hit.some((h) => h.id === s.id) ? { ...s, status: "preliminary", submitted_at: null } : s)) };
    }
  }
  return next;
}

function audit(actor: Actor, entry: AttendanceEntry, action: AttendanceAudit["action"], before: AttendanceEntry | null, reason: string | null, nowIso: string): AttendanceAudit {
  return {
    id: id(), org_id: entry.org_id, user_id: entry.user_id, entry_id: entry.id, action, reason,
    before: before ? { ...before } : null, after: action === "delete" ? null : { ...entry }, changed_by: actor.id, changed_at: nowIso,
  };
}

export function validateSpan(entries: AttendanceEntry[], userId: string, ignoreId: string | null, startIso: string, endIso: string, nowIso: string) {
  const start = new Date(startIso).getTime();
  const end = new Date(endIso).getTime();
  if (!Number.isFinite(start) || !Number.isFinite(end) || end <= start) throw new Error("Sluttiden måste vara efter starttiden.");
  if (end > new Date(nowIso).getTime() + 5 * 60000) throw new Error("Tiden kan inte ligga i framtiden.");
  if (end - start > 24 * 3600000) throw new Error("Ett pass kan vara högst 24 timmar.");
  const overlaps = entries.some((e) => {
    if (e.user_id !== userId || e.id === ignoreId) return false;
    const eStart = new Date(e.start_time).getTime();
    const eEnd = e.end_time ? new Date(e.end_time).getTime() : Infinity;
    return eStart < end && start < eEnd;
  });
  if (overlaps) throw new Error("Tiden överlappar ett annat pass.");
}

export type ClockAction = "clockin" | "clockout" | "break" | "lunch" | "resume";

export interface ClockArgs {
  id: string;
  action: ClockAction;
  expected: string | null;
  eventIso: string;
  comment?: string;
}

export function clockTransition(state: AttendanceState, actor: Actor, args: ClockArgs, nowIso = new Date().toISOString()): { state: AttendanceState; current: AttendanceEntry | null } {
  const { action, eventIso } = args;
  const closing = (args.comment ?? "").trim();
  // Samma regel som databasen: stämplingen får inte backdateras (missad tid läggs in manuellt med orsak).
  const skew = new Date(eventIso).getTime() - new Date(nowIso).getTime();
  if (!Number.isFinite(skew) || skew > 5 * 60000 || skew < -MAX_CLOCK_BACKDATE_MS) throw new Error("Ogiltig stämpling.");
  const current = state.entries.find((e) => e.user_id === actor.id && !e.end_time) ?? null;
  if ((current?.id ?? null) !== args.expected) throw new Error(CLOCK_CONFLICT);
  if (!current && state.entries.some((e) => e.user_id === actor.id && e.end_time && new Date(e.end_time) > new Date(eventIso))) throw new Error(CLOCK_CONFLICT);
  if (action === "clockin" && current) throw new Error(CLOCK_CONFLICT);
  if (action !== "clockin" && !current) throw new Error("Ingen pågående stämpling.");
  if (current && new Date(eventIso) <= new Date(current.start_time)) throw new Error("Tiden ligger före det pågående passet.");
  if ((action === "break" || action === "lunch") && current?.entry_type !== "work") throw new Error("Du är redan på rast.");
  if (action === "resume" && current?.entry_type === "work") throw new Error("Ingen pågående rast.");

  let next = guardChange(state, actor, actor.id, localDateKey(current?.start_time ?? eventIso), localDateKey(eventIso), null, nowIso);
  let entries = next.entries.map((e) =>
    current && e.id === current.id
      ? {
          ...e,
          end_time: eventIso,
          total_minutes: minutesBetweenInstants(e.start_time, eventIso),
          comment: closing && ["clockout", "break", "lunch"].includes(action) && e.entry_type === "work" ? (e.comment.trim() ? `${e.comment.trim()}\n${closing}` : closing) : e.comment,
          updated_at: nowIso,
        }
      : e
  );
  let created: AttendanceEntry | null = null;
  if (action !== "clockout") {
    created = {
      id: args.id, org_id: actor.orgId, user_id: actor.id,
      entry_type: action === "break" || action === "lunch" ? action : "work",
      start_time: eventIso, end_time: null, total_minutes: 0, source: "clock",
      comment: action === "clockin" ? closing : "", created_by: actor.id, created_at: nowIso, updated_at: nowIso, edited_by: null, edited_at: null,
    };
    entries = [created, ...entries];
  }
  next = { ...next, entries };
  return { state: next, current: created };
}

export interface NewEntry {
  id?: string;
  type: AttendanceEntryType;
  start: string;
  end: string;
  comment?: string;
}

export function addEntries(state: AttendanceState, actor: Actor, items: NewEntry[], targetUserId: string | null, reason: string | null, nowIso = new Date().toISOString()): AttendanceState {
  const userId = targetUserId ?? actor.id;
  const source = userId === actor.id ? "manual" : "admin";
  if (userId !== actor.id) {
    if (!canAttest(actor.role)) throw new Error("Åtgärden nekas.");
    if (!(reason ?? "").trim()) throw new Error("Ange orsak.");
  }
  if (items.length === 0 || items.length > 10) throw new Error("Ogiltiga pass.");
  let next = state;
  for (const item of items) {
    if (item.id && next.entries.some((e) => e.id === item.id)) continue;
    validateSpan(next.entries, userId, null, item.start, item.end, nowIso);
    next = guardChange(next, actor, userId, localDateKey(item.start), localDateKey(item.end), reason, nowIso);
    const entry: AttendanceEntry = {
      id: item.id ?? id(), org_id: actor.orgId, user_id: userId, entry_type: item.type, start_time: item.start, end_time: item.end,
      total_minutes: minutesBetweenInstants(item.start, item.end), source, comment: (item.comment ?? "").trim(),
      created_by: actor.id, created_at: nowIso, updated_at: nowIso, edited_by: null, edited_at: null,
    };
    next = { ...next, entries: [entry, ...next.entries], audit: [...next.audit, audit(actor, entry, "create", null, reason ?? "Missad stämpling inlagd manuellt", nowIso)] };
  }
  return next;
}

export function changeEntry(state: AttendanceState, actor: Actor, entryId: string, change: { type: AttendanceEntryType; start: string; end: string; comment: string }, reason: string, nowIso = new Date().toISOString()): AttendanceState {
  const target = state.entries.find((e) => e.id === entryId && e.org_id === actor.orgId);
  if (!target) throw new Error("Passet hittades inte.");
  if (target.user_id !== actor.id && !canAttest(actor.role)) throw new Error("Åtgärden nekas.");
  if (!reason.trim()) throw new Error("Ange orsak till ändringen.");
  if (!target.end_time) throw new Error("Ett pågående pass ändras genom att stämpla ut först.");
  validateSpan(state.entries, target.user_id, target.id, change.start, change.end, nowIso);
  const from = [localDateKey(target.start_time), localDateKey(change.start)].sort()[0];
  const to = [localDateKey(target.end_time), localDateKey(change.end)].sort().reverse()[0];
  const guarded = guardChange(state, actor, target.user_id, from, to, reason, nowIso);
  const updated: AttendanceEntry = {
    ...target, entry_type: change.type, start_time: change.start, end_time: change.end,
    total_minutes: minutesBetweenInstants(change.start, change.end), comment: change.comment.trim(),
    source: target.user_id === actor.id ? "correction" : "admin", edited_by: actor.id, edited_at: nowIso, updated_at: nowIso,
  };
  return { ...guarded, entries: guarded.entries.map((e) => (e.id === target.id ? updated : e)), audit: [...guarded.audit, audit(actor, updated, "update", target, reason, nowIso)] };
}

export function deleteEntry(state: AttendanceState, actor: Actor, entryId: string, reason: string, nowIso = new Date().toISOString()): AttendanceState {
  const target = state.entries.find((e) => e.id === entryId && e.org_id === actor.orgId);
  if (!target) throw new Error("Passet hittades inte.");
  if (target.user_id !== actor.id && !canAttest(actor.role)) throw new Error("Åtgärden nekas.");
  if (!reason.trim()) throw new Error("Ange orsak till borttagningen.");
  if (!target.end_time) throw new Error("Ett pågående pass tas inte bort. Stämpla ut först.");
  const guarded = guardChange(state, actor, target.user_id, localDateKey(target.start_time), localDateKey(target.end_time), reason, nowIso);
  return { ...guarded, entries: guarded.entries.filter((e) => e.id !== target.id), audit: [...guarded.audit, audit(actor, target, "delete", target, reason, nowIso)] };
}

export interface CorrectionRequest {
  id: string;
  action: "change" | "add" | "delete";
  entryId: string | null;
  type: AttendanceEntryType | null;
  start: string | null;
  end: string | null;
  reason: string;
}

export function requestCorrection(state: AttendanceState, actor: Actor, req: CorrectionRequest, nowIso = new Date().toISOString()): AttendanceState {
  if (state.corrections.some((c) => c.id === req.id)) return state;
  if (!req.reason.trim()) throw new Error("Ange orsak.");
  if (req.action !== "add" && !state.entries.some((e) => e.id === req.entryId && e.user_id === actor.id)) throw new Error("Passet hittades inte.");
  if (req.action !== "delete" && (!req.type || !req.start || !req.end || new Date(req.end) <= new Date(req.start))) throw new Error("Ogiltiga tider.");
  const correction: AttendanceCorrection = {
    id: req.id, org_id: actor.orgId, user_id: actor.id, action: req.action, entry_id: req.entryId, proposed_type: req.type,
    proposed_start: req.start, proposed_end: req.end, reason: req.reason.trim(), status: "pending", decided_by: null, decided_at: null, decision_note: null, created_at: nowIso,
  };
  return { ...state, corrections: [correction, ...state.corrections] };
}

export function decideCorrection(state: AttendanceState, actor: Actor, correctionId: string, approve: boolean, note: string, nowIso = new Date().toISOString()): AttendanceState {
  const request = state.corrections.find((c) => c.id === correctionId && c.org_id === actor.orgId);
  if (!request) throw new Error("Förfrågan hittades inte.");
  if (!canAttest(actor.role)) throw new Error("Åtgärden nekas.");
  if (request.status !== "pending") throw new Error("Förfrågan är redan hanterad.");
  if (request.user_id === actor.id && actor.role !== "admin") throw new Error("Du kan inte godkänna din egen rättelse.");
  let next = state;
  const reason = `Rättelse godkänd: ${request.reason}`;
  if (approve) {
    if (request.action === "delete" && request.entry_id) next = deleteEntry(next, actor, request.entry_id, reason, nowIso);
    else if (request.action === "add" && request.proposed_type && request.proposed_start && request.proposed_end)
      next = addEntries(next, { ...actor, role: actor.role }, [{ type: request.proposed_type, start: request.proposed_start, end: request.proposed_end }], request.user_id, reason, nowIso);
    else if (request.entry_id && request.proposed_type && request.proposed_start && request.proposed_end) {
      const existing = next.entries.find((e) => e.id === request.entry_id);
      next = changeEntry(next, actor, request.entry_id, { type: request.proposed_type, start: request.proposed_start, end: request.proposed_end, comment: existing?.comment ?? "" }, reason, nowIso);
    }
  }
  return {
    ...next,
    corrections: next.corrections.map((c) => (c.id === correctionId ? { ...c, status: approve ? "approved" : "rejected", decided_by: actor.id, decided_at: nowIso, decision_note: note.trim() || null } : c)),
  };
}

export function saveAbsence(state: AttendanceState, actor: Actor, absence: { id?: string; userId: string; date: string; kind: string; minutes: number; comment: string }, reason: string, nowIso = new Date().toISOString()): AttendanceState {
  if (!["admin", "projektledare", "ekonomi"].includes(actor.role)) throw new Error("Åtgärden nekas.");
  if (!reason.trim()) throw new Error("Ange orsak.");
  if (!(absence.minutes > 0 && absence.minutes <= 1440)) throw new Error("Ogiltig frånvarotid.");
  let next = state;
  if (actor.role === "ekonomi") {
    if (lockState(state, absence.userId, absence.date, absence.date)) throw new Error("Perioden är attesterad eller exporterad.");
  } else {
    next = guardChange(state, actor, absence.userId, absence.date, absence.date, reason, nowIso);
  }
  const row: AttendanceAbsence = { id: absence.id ?? id(), org_id: actor.orgId, user_id: absence.userId, absence_date: absence.date, kind: absence.kind, minutes: absence.minutes, comment: absence.comment.trim(), created_by: actor.id, created_at: nowIso };
  const exists = next.absences.some((a) => a.id === row.id);
  return { ...next, absences: exists ? next.absences.map((a) => (a.id === row.id ? row : a)) : [row, ...next.absences] };
}

export function deleteAbsence(state: AttendanceState, actor: Actor, absenceId: string, reason: string, nowIso = new Date().toISOString()): AttendanceState {
  if (!["admin", "projektledare", "ekonomi"].includes(actor.role)) throw new Error("Åtgärden nekas.");
  if (!reason.trim()) throw new Error("Ange orsak.");
  const target = state.absences.find((a) => a.id === absenceId);
  if (!target) throw new Error("Frånvaron hittades inte.");
  let next = state;
  if (actor.role === "ekonomi") {
    if (lockState(state, target.user_id, target.absence_date, target.absence_date)) throw new Error("Perioden är attesterad eller exporterad.");
  } else {
    next = guardChange(state, actor, target.user_id, target.absence_date, target.absence_date, reason, nowIso);
  }
  return { ...next, absences: next.absences.filter((a) => a.id !== absenceId) };
}
