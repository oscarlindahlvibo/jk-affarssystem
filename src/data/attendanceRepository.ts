import { supabase } from "../lib/supabase";
import type {
  AttendanceAbsence, AttendanceAudit, AttendanceCorrection, AttendanceEntry, EmployeeTermsRow, OvertimeRuleSetRow,
  PayrollAdjustment, PayrollCodeMapping, PayrollExportRecord, PayrollLogRow, PayrollPeriod, PayrollStatement,
} from "../types";
import type { AttendanceState, ClockAction, NewEntry, CorrectionRequest } from "../lib/attendanceEngine";

function client() {
  if (!supabase) throw new Error("Databasen är inte tillgänglig.");
  return supabase;
}

function check(error: { message: string } | null) {
  if (error) {
    if (error.message.includes("CLOCK_STATE_CONFLICT")) throw new Error("CLOCK_STATE_CONFLICT");
    throw new Error(error.message);
  }
}

export interface AttendanceData {
  state: AttendanceState;
  terms: EmployeeTermsRow[];
  ruleSets: OvertimeRuleSetRow[];
  mappings: PayrollCodeMapping[];
}

const num = (value: unknown) => (value === null || value === undefined ? null : Number(value));

export async function loadAttendanceData(): Promise<AttendanceData> {
  const db = client();
  const since = new Date(Date.now() - 400 * 86400000).toISOString();
  const [entries, absences, corrections, audit, periods, statements, adjustments, exportsResult, log, terms, ruleSets, mappings] = await Promise.all([
    db.from("attendance_entries").select("*").gte("start_time", since).order("start_time", { ascending: false }).limit(20000),
    db.from("attendance_absences").select("*").gte("absence_date", since.slice(0, 10)),
    db.from("attendance_corrections").select("*").order("created_at", { ascending: false }).limit(2000),
    db.from("attendance_audit").select("*").gte("changed_at", since).order("changed_at", { ascending: false }).limit(5000),
    db.from("payroll_periods").select("*").order("start_date", { ascending: false }),
    db.from("payroll_statements").select("*"),
    db.from("payroll_adjustments").select("*"),
    db.from("payroll_exports").select("*").order("created_at", { ascending: false }),
    db.from("payroll_log").select("*").order("at", { ascending: false }).limit(2000),
    db.from("employee_terms").select("*").order("valid_from", { ascending: false }),
    db.from("overtime_rule_sets").select("*").order("name"),
    db.from("payroll_code_mappings").select("*").order("time_type"),
  ]);
  for (const result of [entries, absences, corrections, audit, periods, statements, adjustments, exportsResult, log, terms, ruleSets, mappings]) check(result.error);
  return {
    state: {
      entries: (entries.data ?? []) as AttendanceEntry[],
      absences: (absences.data ?? []) as AttendanceAbsence[],
      corrections: (corrections.data ?? []) as AttendanceCorrection[],
      audit: (audit.data ?? []) as AttendanceAudit[],
      periods: (periods.data ?? []) as PayrollPeriod[],
      statements: (statements.data ?? []) as PayrollStatement[],
      adjustments: ((adjustments.data ?? []) as PayrollAdjustment[]).map((a) => ({ ...a, minutes_delta: Number(a.minutes_delta) })),
      exports: (exportsResult.data ?? []) as PayrollExportRecord[],
      log: (log.data ?? []) as PayrollLogRow[],
    },
    terms: ((terms.data ?? []) as EmployeeTermsRow[]).map((t) => ({ ...t, weekly_hours: num(t.weekly_hours), employment_rate: num(t.employment_rate) })),
    ruleSets: (ruleSets.data ?? []) as OvertimeRuleSetRow[],
    mappings: (mappings.data ?? []) as PayrollCodeMapping[],
  };
}

export async function rpcClock(args: { id: string; action: ClockAction; expected: string | null; eventIso: string; comment?: string }) {
  const { error } = await client().rpc("attendance_clock_transition", { p_id: args.id, p_action: args.action, p_expected: args.expected, p_event: args.eventIso, p_comment: args.comment ?? "" });
  check(error);
}

export async function rpcAddEntries(items: NewEntry[], userId: string | null, reason: string | null) {
  const { error } = await client().rpc("attendance_add_entries", { p_entries: items, p_user: userId, p_reason: reason });
  check(error);
}

export async function rpcChangeEntry(id: string, change: { type: string; start: string; end: string; comment: string }, reason: string) {
  const { error } = await client().rpc("attendance_change_entry", { p_id: id, p_type: change.type, p_start: change.start, p_end: change.end, p_comment: change.comment, p_reason: reason });
  check(error);
}

export async function rpcDeleteEntry(id: string, reason: string) {
  const { error } = await client().rpc("attendance_delete_entry", { p_id: id, p_reason: reason });
  check(error);
}

export async function rpcRequestCorrection(req: CorrectionRequest) {
  const { error } = await client().rpc("attendance_request_correction", { p_id: req.id, p_action: req.action, p_entry_id: req.entryId, p_type: req.type, p_start: req.start, p_end: req.end, p_reason: req.reason });
  check(error);
}

export async function rpcDecideCorrection(id: string, approve: boolean, note: string) {
  const { error } = await client().rpc("attendance_decide_correction", { p_id: id, p_approve: approve, p_note: note });
  check(error);
}

export async function rpcSaveAbsence(a: { id?: string; userId: string; date: string; kind: string; minutes: number; comment: string }, reason: string) {
  const { error } = await client().rpc("attendance_absence_save", { p_id: a.id ?? null, p_user: a.userId, p_date: a.date, p_kind: a.kind, p_minutes: a.minutes, p_comment: a.comment, p_reason: reason });
  check(error);
}

export async function rpcDeleteAbsence(id: string, reason: string) {
  const { error } = await client().rpc("attendance_absence_delete", { p_id: id, p_reason: reason });
  check(error);
}

export async function rpcSaveTerms(terms: Record<string, unknown>) {
  const { error } = await client().rpc("employee_terms_save", { p_terms: terms });
  check(error);
}

export async function rpcSaveRuleSet(id: string | null, name: string, config: Record<string, unknown>, active: boolean) {
  const { error } = await client().rpc("overtime_rule_set_save", { p_id: id, p_name: name, p_config: config, p_active: active });
  check(error);
}

export async function rpcSaveMapping(timeType: string, code: string, label: string) {
  const { error } = await client().rpc("payroll_code_mapping_save", { p_time_type: timeType, p_external_code: code, p_label: label });
  check(error);
}

export async function rpcCreatePeriod(name: string, start: string, end: string) {
  const { error } = await client().rpc("payroll_period_create", { p_name: name, p_start: start, p_end: end });
  check(error);
}

export async function rpcSubmitStatement(periodId: string) {
  const { error } = await client().rpc("payroll_statement_submit", { p_period_id: periodId });
  check(error);
}

export async function rpcAttest(periodId: string, userId: string, totals: unknown, days: unknown, ruleSnapshot: unknown) {
  const { error } = await client().rpc("payroll_statement_attest", { p_period_id: periodId, p_user_id: userId, p_totals: totals, p_days: days, p_rule_snapshot: ruleSnapshot });
  check(error);
}

export async function rpcUnattest(statementId: string, reason: string) {
  const { error } = await client().rpc("payroll_statement_unattest", { p_statement_id: statementId, p_reason: reason });
  check(error);
}

export async function rpcReview(statementId: string) {
  const { error } = await client().rpc("payroll_statement_review", { p_statement_id: statementId });
  check(error);
}

export async function rpcRecordAdjustment(statementId: string, totals: unknown, days: unknown, reason: string) {
  const { error } = await client().rpc("payroll_record_adjustment", { p_statement_id: statementId, p_new_totals: totals, p_new_days: days, p_reason: reason });
  check(error);
}

export async function rpcCreateExport(req: { periodId: string; statementIds: string[]; format: string; checksum: string; rowCount: number; force: boolean; reason: string }) {
  const { error } = await client().rpc("payroll_export_create", { p_period_id: req.periodId, p_statement_ids: req.statementIds, p_format: req.format, p_checksum: req.checksum, p_row_count: req.rowCount, p_force: req.force, p_reason: req.reason });
  check(error);
}
