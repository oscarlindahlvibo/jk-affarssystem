// Löneperioder, inlämning, attestering, granskning, export och rättelser efter export.
// Speglar payroll_*-funktionerna i supabase/migrations/0028_attendance_and_payroll.sql.
import type { PayrollAdjustment, PayrollExportRecord, PayrollPeriod, PayrollStatement } from "../types";
import { canAttest, isPayrollAdmin, type Actor, type AttendanceState } from "./attendanceEngine";
import { localDateKey } from "./stockholmTime";

const uuid = () => crypto.randomUUID();

export interface TotalsLike {
  workedMinutes?: number;
  ordinaryMinutes?: number;
  overtime?: Record<string, number>;
  absence?: Record<string, number>;
}

export function createPeriod(state: AttendanceState, actor: Actor, name: string, start: string, end: string): AttendanceState {
  if (!isPayrollAdmin(actor.role)) throw new Error("Åtgärden nekas.");
  if (end < start) throw new Error("Slutdatum måste vara efter startdatum.");
  if (state.periods.some((p) => p.org_id === actor.orgId && p.start_date <= end && p.end_date >= start)) throw new Error("Perioden överlappar en befintlig löneperiod.");
  const period: PayrollPeriod = { id: uuid(), org_id: actor.orgId, name: name.trim(), start_date: start, end_date: end };
  return { ...state, periods: [...state.periods, period] };
}

function statementOf(state: AttendanceState, periodId: string, userId: string) {
  return state.statements.find((s) => s.period_id === periodId && s.user_id === userId) ?? null;
}

function blankStatement(actor: Actor, periodId: string, userId: string): PayrollStatement {
  return {
    id: uuid(), org_id: actor.orgId, period_id: periodId, user_id: userId, status: "preliminary", totals: null, days: null, rule_snapshot: null,
    submitted_at: null, attested_at: null, attested_by: null, reviewed_at: null, reviewed_by: null, exported_at: null, last_export_id: null, pending_adjustment: false,
  };
}

function hasOpenEntry(state: AttendanceState, userId: string, period: PayrollPeriod) {
  return state.entries.some((e) => e.user_id === userId && !e.end_time && localDateKey(e.start_time) >= period.start_date && localDateKey(e.start_time) <= period.end_date);
}

function upsertStatement(state: AttendanceState, next: PayrollStatement): AttendanceState {
  const exists = state.statements.some((s) => s.id === next.id);
  return { ...state, statements: exists ? state.statements.map((s) => (s.id === next.id ? next : s)) : [...state.statements, next] };
}

export function submitStatement(state: AttendanceState, actor: Actor, periodId: string, nowIso = new Date().toISOString()): AttendanceState {
  const period = state.periods.find((p) => p.id === periodId && p.org_id === actor.orgId);
  if (!period) throw new Error("Löneperioden hittades inte.");
  if (hasOpenEntry(state, actor.id, period)) throw new Error("Du har en pågående stämpling i perioden. Stämpla ut först.");
  const existing = statementOf(state, periodId, actor.id);
  if (existing && ["attested", "reviewed", "exported"].includes(existing.status)) throw new Error("Perioden är redan attesterad.");
  return upsertStatement(state, { ...(existing ?? blankStatement(actor, periodId, actor.id)), status: "submitted", submitted_at: nowIso });
}

export function attestStatement(
  state: AttendanceState, actor: Actor, periodId: string, userId: string,
  totals: Record<string, unknown>, days: unknown[], ruleSnapshot: Record<string, unknown>, nowIso = new Date().toISOString()
): AttendanceState {
  if (!canAttest(actor.role)) throw new Error("Endast admin eller projektledare kan attestera.");
  if (userId === actor.id && actor.role !== "admin") throw new Error("Du kan inte attestera din egen tid.");
  const period = state.periods.find((p) => p.id === periodId && p.org_id === actor.orgId);
  if (!period) throw new Error("Löneperioden hittades inte.");
  if (!totals || typeof totals !== "object" || !("workedMinutes" in totals) || !Array.isArray(days)) throw new Error("Ogiltigt löneunderlag.");
  if (hasOpenEntry(state, userId, period)) throw new Error("Personen har en pågående stämpling i perioden.");
  const existing = statementOf(state, periodId, userId);
  if (existing && ["attested", "reviewed", "exported"].includes(existing.status)) throw new Error("Perioden är redan attesterad.");
  const next = { ...(existing ?? blankStatement(actor, periodId, userId)), status: "attested" as const, totals, days, rule_snapshot: ruleSnapshot, attested_at: nowIso, attested_by: actor.id };
  return { ...upsertStatement(state, next), log: [...state.log, { id: uuid(), org_id: actor.orgId, statement_id: next.id, period_id: periodId, user_id: userId, action: "attested", reason: null, details: null, actor: actor.id, at: nowIso }] };
}

export function unattestStatement(state: AttendanceState, actor: Actor, statementId: string, reason: string, nowIso = new Date().toISOString()): AttendanceState {
  if (!canAttest(actor.role)) throw new Error("Åtgärden nekas.");
  const target = state.statements.find((s) => s.id === statementId && s.org_id === actor.orgId);
  if (!target) throw new Error("Sammanställningen hittades inte.");
  if (!["attested", "reviewed"].includes(target.status)) throw new Error("Endast attesterade sammanställningar kan öppnas igen. Exporterade rättas via spårbar rättelse.");
  if (!reason.trim()) throw new Error("Ange orsak.");
  const next = { ...target, status: "preliminary" as const, attested_at: null, attested_by: null, reviewed_at: null, reviewed_by: null, totals: null, days: null, rule_snapshot: null };
  return { ...upsertStatement(state, next), log: [...state.log, { id: uuid(), org_id: actor.orgId, statement_id: target.id, period_id: target.period_id, user_id: target.user_id, action: "unattested", reason: reason.trim(), details: null, actor: actor.id, at: nowIso }] };
}

export function reviewStatement(state: AttendanceState, actor: Actor, statementId: string, nowIso = new Date().toISOString()): AttendanceState {
  if (!isPayrollAdmin(actor.role)) throw new Error("Åtgärden nekas.");
  const target = state.statements.find((s) => s.id === statementId && s.org_id === actor.orgId);
  if (!target) throw new Error("Sammanställningen hittades inte.");
  if (target.status !== "attested") throw new Error("Endast attesterade sammanställningar kan granskas.");
  return upsertStatement(state, { ...target, status: "reviewed", reviewed_at: nowIso, reviewed_by: actor.id });
}

function flatten(totals: TotalsLike | null): Record<string, number> {
  return { ordinary: totals?.ordinaryMinutes ?? 0, ...(totals?.overtime ?? {}), ...(totals?.absence ?? {}) };
}

export function recordAdjustment(state: AttendanceState, actor: Actor, statementId: string, newTotals: Record<string, unknown>, newDays: unknown[], reason: string, nowIso = new Date().toISOString()): { state: AttendanceState; rows: number } {
  if (!isPayrollAdmin(actor.role)) throw new Error("Åtgärden nekas.");
  const target = state.statements.find((s) => s.id === statementId && s.org_id === actor.orgId);
  if (!target) throw new Error("Sammanställningen hittades inte.");
  if (target.status !== "exported") throw new Error("Rättelser registreras bara för exporterade sammanställningar.");
  if (!reason.trim()) throw new Error("Ange orsak.");
  const before = flatten(target.totals as TotalsLike | null);
  const after = flatten(newTotals as TotalsLike);
  const rows: PayrollAdjustment[] = [];
  for (const key of new Set([...Object.keys(before), ...Object.keys(after)])) {
    const delta = (after[key] ?? 0) - (before[key] ?? 0);
    if (delta !== 0) rows.push({ id: uuid(), org_id: actor.orgId, statement_id: target.id, user_id: target.user_id, time_type: key, minutes_delta: delta, reason: reason.trim(), created_by: actor.id, created_at: nowIso, export_id: null });
  }
  const next = { ...state, adjustments: [...state.adjustments, ...rows] };
  return { state: upsertStatement(next, { ...target, totals: newTotals, days: newDays, pending_adjustment: false }), rows: rows.length };
}

export interface ExportRequest {
  periodId: string;
  statementIds: string[];
  format: string;
  checksum: string;
  rowCount: number;
  force: boolean;
  reason: string;
}

export function createExport(state: AttendanceState, actor: Actor, req: ExportRequest, nowIso = new Date().toISOString()): { state: AttendanceState; exportId: string; kind: PayrollExportRecord["kind"] } {
  if (!isPayrollAdmin(actor.role)) throw new Error("Endast admin eller ekonomi kan exportera.");
  const period = state.periods.find((p) => p.id === req.periodId && p.org_id === actor.orgId);
  if (!period) throw new Error("Löneperioden hittades inte.");
  if (req.statementIds.length === 0) throw new Error("Inga sammanställningar valda.");
  const statements = state.statements.filter((s) => req.statementIds.includes(s.id) && s.period_id === req.periodId);
  if (statements.length !== req.statementIds.length) throw new Error("Någon sammanställning hittades inte i perioden.");

  let kind: PayrollExportRecord["kind"] = "regular";
  const alreadyExported: string[] = [];
  for (const s of statements) {
    const hasPending = state.adjustments.some((a) => a.statement_id === s.id && a.export_id === null);
    if (s.status === "reviewed") {
      // ok
    } else if (s.status === "exported" && hasPending) {
      if (kind === "regular") kind = "correction";
    } else if (s.status === "exported") {
      alreadyExported.push(s.user_id);
    } else {
      throw new Error(`Alla sammanställningar måste vara granskade innan export (${s.user_id} är ${s.status}).`);
    }
    if (s.pending_adjustment) throw new Error(`En rättelse väntar på att registreras för personen ${s.user_id} innan ny export.`);
  }
  if (alreadyExported.length > 0) {
    if (!req.force || !req.reason.trim()) throw new Error(`Redan exporterat för: ${alreadyExported.join(", ")}. Bekräfta ny export med orsak.`);
    kind = "reexport";
  }
  const exportId = uuid();
  const record: PayrollExportRecord = { id: exportId, org_id: actor.orgId, period_id: req.periodId, format: req.format, kind, statement_ids: req.statementIds, row_count: req.rowCount, checksum: req.checksum, reason: req.reason.trim() || null, created_by: actor.id, created_at: nowIso };
  return {
    exportId,
    kind,
    state: {
      ...state,
      exports: [record, ...state.exports],
      statements: state.statements.map((s) =>
        req.statementIds.includes(s.id) && (s.status === "reviewed" || s.status === "exported")
          ? { ...s, status: "exported", exported_at: s.exported_at ?? nowIso, last_export_id: exportId }
          : s
      ),
      adjustments: state.adjustments.map((a) => (req.statementIds.includes(a.statement_id) && a.export_id === null ? { ...a, export_id: exportId } : a)),
      log: [...state.log, { id: uuid(), org_id: actor.orgId, statement_id: null, period_id: req.periodId, user_id: null, action: "exported", reason: req.reason.trim() || null, details: { export_id: exportId, kind, format: req.format }, actor: actor.id, at: nowIso }],
    },
  };
}
