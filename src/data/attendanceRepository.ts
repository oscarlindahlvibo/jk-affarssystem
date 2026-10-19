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

// PostgREST returnerar högst ett serverbestämt antal rader per anrop (normalt 1000) utan felmeddelande.
// Alla listor hämtas därför sida för sida tills en sida är kortare än sidstorleken.
const PAGE = 1000;
async function pageAll<T>(query: (from: number, to: number) => PromiseLike<{ data: T[] | null; error: { message: string } | null }>, maxRows = 50000): Promise<T[]> {
  const rows: T[] = [];
  for (let from = 0; from < maxRows; from += PAGE) {
    const { data, error } = await query(from, from + PAGE - 1);
    check(error);
    rows.push(...(data ?? []));
    if ((data ?? []).length < PAGE) break;
  }
  return rows;
}

export interface AttendanceWindow {
  entries: AttendanceEntry[];
  absences: AttendanceAbsence[];
  audit: AttendanceAudit[];
}

// Närvaro, frånvaro och ändringslogg för ett datumintervall (svenska lokala datum). RLS gäller som vanligt.
export async function loadAttendanceWindow(fromDate: string, toDate: string): Promise<AttendanceWindow> {
  const db = client();
  // Marginal i UTC så att pass nära midnatt (svensk tid) inte tappas; exakt filtrering sker i beräkningen.
  const fromIso = new Date(`${fromDate}T00:00:00Z`).getTime() - 86400000;
  const toIso = new Date(`${toDate}T00:00:00Z`).getTime() + 2 * 86400000;
  const [entries, absences, audit] = await Promise.all([
    pageAll<AttendanceEntry>((from, to) => db.from("attendance_entries").select("*").gte("start_time", new Date(fromIso).toISOString()).lt("start_time", new Date(toIso).toISOString()).order("start_time", { ascending: false }).order("id").range(from, to)),
    pageAll<AttendanceAbsence>((from, to) => db.from("attendance_absences").select("*").gte("absence_date", fromDate).lte("absence_date", toDate).order("absence_date", { ascending: false }).order("id").range(from, to)),
    pageAll<AttendanceAudit>((from, to) => db.from("attendance_audit").select("*").gte("changed_at", new Date(fromIso).toISOString()).lt("changed_at", new Date(toIso).toISOString()).order("changed_at", { ascending: false }).order("id").range(from, to)),
  ]);
  return { entries, absences, audit };
}

// Grunddata: perioder, sammanställningar, inställningar och de senaste dagarnas närvaro.
// Äldre perioder hämtas vid behov med loadAttendanceWindow när användaren öppnar dem.
export const DEFAULT_WINDOW_DAYS = 100;

export async function loadAttendanceData(): Promise<AttendanceData & { windowFrom: string }> {
  const db = client();
  const today = new Date();
  const windowFrom = new Date(today.getTime() - DEFAULT_WINDOW_DAYS * 86400000).toISOString().slice(0, 10);
  const [window, corrections, periods, statements, adjustments, exportsRows, log, terms, ruleSets, mappings] = await Promise.all([
    loadAttendanceWindow(windowFrom, today.toISOString().slice(0, 10)),
    pageAll<AttendanceCorrection>((from, to) => db.from("attendance_corrections").select("*").order("created_at", { ascending: false }).order("id").range(from, to), 5000),
    pageAll<PayrollPeriod>((from, to) => db.from("payroll_periods").select("*").order("start_date", { ascending: false }).order("id").range(from, to)),
    pageAll<PayrollStatement>((from, to) => db.from("payroll_statements").select("*").order("id").range(from, to)),
    pageAll<PayrollAdjustment>((from, to) => db.from("payroll_adjustments").select("*").order("id").range(from, to)),
    pageAll<PayrollExportRecord>((from, to) => db.from("payroll_exports").select("*").order("created_at", { ascending: false }).order("id").range(from, to)),
    pageAll<PayrollLogRow>((from, to) => db.from("payroll_log").select("*").order("at", { ascending: false }).order("id").range(from, to), 3000),
    pageAll<EmployeeTermsRow>((from, to) => db.from("employee_terms").select("*").order("valid_from", { ascending: false }).order("id").range(from, to)),
    pageAll<OvertimeRuleSetRow>((from, to) => db.from("overtime_rule_sets").select("*").order("name").order("id").range(from, to)),
    pageAll<PayrollCodeMapping>((from, to) => db.from("payroll_code_mappings").select("*").order("time_type").order("id").range(from, to)),
  ]);
  return {
    windowFrom,
    state: {
      entries: window.entries,
      absences: window.absences,
      corrections,
      audit: window.audit,
      periods,
      statements,
      adjustments: adjustments.map((a) => ({ ...a, minutes_delta: Number(a.minutes_delta) })),
      exports: exportsRows,
      log,
    },
    terms: terms.map((t) => ({ ...t, weekly_hours: num(t.weekly_hours), employment_rate: num(t.employment_rate) })),
    ruleSets,
    mappings,
  };
}

export interface PayrollInputs {
  entries: AttendanceEntry[];
  absences: AttendanceAbsence[];
  terms: EmployeeTermsRow[];
  ruleSets: OvertimeRuleSetRow[];
  fingerprint: string;
}

// Färska rader + fingeravtryck från servern. Attest och rättelse räknas alltid på dessa.
export async function rpcInputs(periodId: string, userId: string): Promise<PayrollInputs> {
  const { data, error } = await client().rpc("payroll_inputs", { p_period_id: periodId, p_user_id: userId });
  check(error);
  const row = data as PayrollInputs;
  return { ...row, terms: row.terms.map((t) => ({ ...t, weekly_hours: num(t.weekly_hours), employment_rate: num(t.employment_rate) })) };
}

export async function rpcApproveRuleSet(id: string, note: string) {
  const { error } = await client().rpc("overtime_rule_set_approve", { p_id: id, p_note: note });
  check(error);
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

export async function rpcAttest(periodId: string, userId: string, totals: unknown, days: unknown, fingerprint: string) {
  const { error } = await client().rpc("payroll_statement_attest", { p_period_id: periodId, p_user_id: userId, p_totals: totals, p_days: days, p_fingerprint: fingerprint });
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

export async function rpcRecordAdjustment(statementId: string, totals: unknown, days: unknown, reason: string, fingerprint: string) {
  const { error } = await client().rpc("payroll_record_adjustment", { p_statement_id: statementId, p_new_totals: totals, p_new_days: days, p_reason: reason, p_fingerprint: fingerprint });
  check(error);
}

export async function rpcCreateExport(req: { periodId: string; statementIds: string[]; format: string; checksum: string; rowCount: number; force: boolean; reason: string }) {
  const { error } = await client().rpc("payroll_export_create", { p_period_id: req.periodId, p_statement_ids: req.statementIds, p_format: req.format, p_checksum: req.checksum, p_row_count: req.rowCount, p_force: req.force, p_reason: req.reason });
  check(error);
}
