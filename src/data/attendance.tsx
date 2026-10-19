import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import type { AttendanceEntry, EmployeeTermsRow, OvertimeRuleSetRow, PayrollCodeMapping, PayrollPeriod, PayrollStatement } from "../types";
import { useAuth } from "../lib/auth";
import { useStore } from "./store";
import { isSupabaseConfigured } from "../lib/supabase";
import {
  addEntries as engineAddEntries,
  CLOCK_CONFLICT,
  canAttest as roleCanAttest,
  canViewPayroll as roleCanView,
  changeEntry as engineChangeEntry,
  clockTransition,
  decideCorrection as engineDecide,
  deleteAbsence as engineDeleteAbsence,
  deleteEntry as engineDeleteEntry,
  emptyAttendanceState,
  isPayrollAdmin as roleIsPayrollAdmin,
  requestCorrection as engineRequest,
  saveAbsence as engineSaveAbsence,
  type Actor,
  type AttendanceState,
  type ClockAction,
  type CorrectionRequest,
  type NewEntry,
} from "../lib/attendanceEngine";
import { attestStatement, createExport, createPeriod, recordAdjustment, reviewStatement, submitStatement, unattestStatement } from "../lib/payrollFlow";
import { computeEmployeePayroll, payrollBlockers } from "../lib/payrollCompute";
import { DEFAULT_OVERTIME_RULES, type PayrollResult } from "../lib/payrollRules";
import { addDays } from "../lib/stockholmTime";
import { adapterById } from "../lib/payrollExport/adapters";
import { buildExportLines, exportInput, MissingCodesError } from "../lib/payrollExport/lines";
import { sha256Hex } from "../lib/payrollExport/format";
import type { BuiltExport, ExportEmployee } from "../lib/payrollExport/types";
import * as repo from "./attendanceRepository";

const MOCK_STATE_KEY = "jk-mock-attendance";
const MOCK_SETTINGS_KEY = "jk-mock-payroll-settings";

interface Settings {
  terms: EmployeeTermsRow[];
  ruleSets: OvertimeRuleSetRow[];
  mappings: PayrollCodeMapping[];
}

function readJson<T>(key: string, fallback: T): T {
  try {
    const raw = window.localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : fallback;
  } catch {
    return fallback;
  }
}

function writeJson(key: string, value: unknown) {
  try {
    window.localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // Mockläget fungerar ändå för den öppna sessionen.
  }
}

export interface ExportOptions {
  periodId: string;
  statementIds: string[];
  formatId: string;
  force: boolean;
  reason: string;
  // Måste uttryckligen sättas för att exportera rader utan lönekod.
  allowMissingCodes?: boolean;
}

export type PayrollComputation = PayrollResult & { hasTerms: boolean; blockers: string[] };

interface AttendanceShape {
  isLoading: boolean;
  error: string | null;
  actor: Actor | null;
  canAttest: boolean;
  isPayrollAdmin: boolean;
  canViewPayroll: boolean;
  state: AttendanceState;
  terms: EmployeeTermsRow[];
  ruleSets: OvertimeRuleSetRow[];
  mappings: PayrollCodeMapping[];
  myEntries: AttendanceEntry[];
  openEntry: AttendanceEntry | null;
  clock: (action: ClockAction, comment?: string) => Promise<void>;
  addEntries: (items: NewEntry[], userId?: string | null, reason?: string | null) => Promise<void>;
  changeEntry: (id: string, change: { type: AttendanceEntry["entry_type"]; start: string; end: string; comment: string }, reason: string) => Promise<void>;
  deleteEntry: (id: string, reason: string) => Promise<void>;
  requestCorrection: (req: Omit<CorrectionRequest, "id"> & { id?: string }) => Promise<void>;
  decideCorrection: (id: string, approve: boolean, note: string) => Promise<void>;
  saveAbsence: (a: { id?: string; userId: string; date: string; kind: string; minutes: number; comment: string }, reason: string) => Promise<void>;
  deleteAbsence: (id: string, reason: string) => Promise<void>;
  createPeriod: (name: string, start: string, end: string) => Promise<void>;
  submitStatement: (periodId: string) => Promise<void>;
  attest: (periodId: string, userId: string) => Promise<void>;
  unattest: (statementId: string, reason: string) => Promise<void>;
  review: (statementId: string) => Promise<void>;
  recordAdjustment: (statementId: string, reason: string) => Promise<void>;
  exportPeriod: (options: ExportOptions) => Promise<BuiltExport>;
  saveTerms: (terms: Omit<EmployeeTermsRow, "id" | "org_id">) => Promise<void>;
  saveRuleSet: (id: string | null, name: string, config: Record<string, unknown>, active: boolean) => Promise<void>;
  saveMapping: (timeType: string, code: string, label: string) => Promise<void>;
  compute: (userId: string, period: Pick<PayrollPeriod, "start_date" | "end_date">) => PayrollComputation;
  // Säkerställer att närvaro för intervallet är inläst (äldre perioder hämtas vid behov).
  ensureRange: (from: string, to: string) => Promise<void>;
  isRangeLoaded: (from: string, to: string) => boolean;
  approveRuleSet: (id: string, note: string) => Promise<void>;
  statementFor: (periodId: string, userId: string) => PayrollStatement | null;
  employeeInfo: (userId: string) => ExportEmployee;
  refresh: () => Promise<void>;
}

const Ctx = createContext<AttendanceShape | null>(null);

function mockSettings(orgId: string, userIds: string[]): Settings {
  const ruleSetId = "mock-rules";
  return {
    ruleSets: [{ id: ruleSetId, org_id: orgId, name: "EXEMPEL – ej bekräftade avtalsregler", config: DEFAULT_OVERTIME_RULES as unknown as Record<string, unknown>, active: true, approved_at: null, approved_by: null, approval_note: null }],
    mappings: [],
    terms: userIds.map((userId, index) => ({
      id: `mock-terms-${userId}`, org_id: orgId, user_id: userId, valid_from: "2026-01-01", employment_number: String(1001 + index), employment_type: "tillsvidare",
      weekly_hours: 40, employment_rate: 100, schedule: { mon: 480, tue: 480, wed: 480, thu: 480, fri: 480, sat: 0, sun: 0 }, rule_set_id: ruleSetId, external_employee_ref: null, note: "Exempeldata i testläge",
    })),
  };
}

export function AttendanceProvider({ children }: { children: ReactNode }) {
  const { currentProfile } = useAuth();
  const { profiles } = useStore();
  const active = currentProfile?.status === "aktiv";
  const actor = useMemo<Actor | null>(() => (currentProfile && active ? { id: currentProfile.id, orgId: currentProfile.org_id, role: currentProfile.role } : null), [currentProfile, active]);

  const [state, setState] = useState<AttendanceState>(() => (isSupabaseConfigured ? emptyAttendanceState() : { ...emptyAttendanceState(), ...readJson<Partial<AttendanceState>>(MOCK_STATE_KEY, {}) }));
  const [settings, setSettings] = useState<Settings>(() => (isSupabaseConfigured ? { terms: [], ruleSets: [], mappings: [] } : readJson<Settings | null>(MOCK_SETTINGS_KEY, null) ?? { terms: [], ruleSets: [], mappings: [] }));
  const [isLoading, setIsLoading] = useState(isSupabaseConfigured);
  const [error, setError] = useState<string | null>(null);
  // Senaste tillstånd även mellan renderingar, så två snabba åtgärder i mockläget inte skriver över varandra.
  const stateRef = useRef(state);
  const commit = useCallback((next: AttendanceState) => {
    stateRef.current = next;
    setState(next);
  }, []);
  // Intervall (lokala datum) vars närvaro är inläst. Standard är de senaste dagarna; äldre hämtas vid behov.
  const rangesRef = useRef<{ from: string; to: string }[]>([]);
  const [rangeVersion, setRangeVersion] = useState(0);

  const mergeWindow = useCallback((base: AttendanceState, window: repo.AttendanceWindow): AttendanceState => {
    const byId = <T extends { id: string | number }>(existing: T[], incoming: T[]) => {
      const map = new Map(existing.map((row) => [row.id, row]));
      for (const row of incoming) map.set(row.id, row);
      return [...map.values()];
    };
    return { ...base, entries: byId(base.entries, window.entries), absences: byId(base.absences, window.absences), audit: byId(base.audit, window.audit) };
  }, []);

  const reload = useCallback(async () => {
    if (!isSupabaseConfigured || !active) return;
    const data = await repo.loadAttendanceData();
    let next = data.state;
    // Behåll tidigare inlästa äldre intervall (färska rader ersätter gamla).
    const extra = rangesRef.current.filter((r) => r.from < data.windowFrom);
    for (const range of extra) next = mergeWindow(next, await repo.loadAttendanceWindow(range.from, range.to));
    rangesRef.current = [{ from: data.windowFrom, to: "9999-12-31" }, ...extra];
    commit(next);
    setRangeVersion((v) => v + 1);
    setSettings({ terms: data.terms, ruleSets: data.ruleSets, mappings: data.mappings });
  }, [active, commit, mergeWindow]);

  const isRangeLoaded = useCallback(
    (from: string, to: string) => !isSupabaseConfigured || rangesRef.current.some((r) => r.from <= from && r.to >= to),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [rangeVersion]
  );
  const ensureRange = useCallback(
    async (from: string, to: string) => {
      if (!isSupabaseConfigured || isRangeLoaded(from, to)) return;
      const window = await repo.loadAttendanceWindow(from, to);
      commit(mergeWindow(stateRef.current, window));
      rangesRef.current = [...rangesRef.current, { from, to }];
      setRangeVersion((v) => v + 1);
    },
    [commit, isRangeLoaded, mergeWindow]
  );

  useEffect(() => {
    if (!isSupabaseConfigured || !active) return;
    let live = true;
    setIsLoading(true);
    reload()
      .then(() => live && setError(null))
      .catch((e) => live && setError(e instanceof Error ? e.message : "Kunde inte läsa närvarodata."))
      .finally(() => live && setIsLoading(false));
    return () => {
      live = false;
    };
  }, [active, reload]);

  useEffect(() => {
    if (isSupabaseConfigured || !actor) return;
    setSettings((prev) => (prev.terms.length > 0 ? prev : mockSettings(actor.orgId, profiles.filter((p) => p.org_id === actor.orgId).map((p) => p.id))));
  }, [actor, profiles]);
  useEffect(() => {
    if (!isSupabaseConfigured) writeJson(MOCK_STATE_KEY, state);
  }, [state]);
  useEffect(() => {
    if (!isSupabaseConfigured) writeJson(MOCK_SETTINGS_KEY, settings);
  }, [settings]);

  const role = actor?.role ?? null;
  const canAttest = Boolean(role && roleCanAttest(role));
  const isPayrollAdmin = Boolean(role && roleIsPayrollAdmin(role));
  const canViewPayroll = Boolean(role && roleCanView(role));

  // Anställda ser bara egna rader (databasen gör samma sak med RLS; mockläget filtrerar här).
  const visible = useMemo<AttendanceState>(() => {
    if (!actor) return emptyAttendanceState();
    const own = <T extends { user_id: string; org_id: string }>(rows: T[]) => rows.filter((r) => r.org_id === actor.orgId && (canViewPayroll || r.user_id === actor.id));
    return {
      ...state,
      entries: own(state.entries),
      absences: own(state.absences),
      audit: own(state.audit),
      statements: own(state.statements),
      corrections: state.corrections.filter((c) => c.org_id === actor.orgId && (canAttest || c.user_id === actor.id)),
      periods: state.periods.filter((p) => p.org_id === actor.orgId),
      adjustments: isPayrollAdmin ? state.adjustments.filter((a) => a.org_id === actor.orgId) : [],
      exports: isPayrollAdmin ? state.exports.filter((e) => e.org_id === actor.orgId) : [],
      log: canViewPayroll ? state.log.filter((l) => l.org_id === actor.orgId) : [],
    };
  }, [state, actor, canViewPayroll, canAttest, isPayrollAdmin]);

  const visibleSettings = useMemo(
    () => ({
      terms: actor ? settings.terms.filter((t) => t.org_id === actor.orgId && (canViewPayroll || t.user_id === actor.id)) : [],
      ruleSets: actor ? settings.ruleSets.filter((r) => r.org_id === actor.orgId) : [],
      mappings: actor && canViewPayroll ? settings.mappings.filter((m) => m.org_id === actor.orgId) : [],
    }),
    [settings, actor, canViewPayroll]
  );

  const myEntries = useMemo(() => visible.entries.filter((e) => e.user_id === actor?.id), [visible.entries, actor]);
  const openEntry = useMemo(() => myEntries.find((e) => !e.end_time) ?? null, [myEntries]);

  const requireActor = useCallback(() => {
    if (!actor) throw new Error("Kontot är inte aktivt.");
    return actor;
  }, [actor]);

  // Kör en ändring antingen mot databasen (RPC + omläsning) eller mot mockmotorn.
  const mutate = useCallback(
    async (live: () => Promise<void>, mock: (current: AttendanceState, who: Actor) => AttendanceState) => {
      const who = requireActor();
      if (isSupabaseConfigured) {
        await live();
        await reload();
        return;
      }
      commit(mock(stateRef.current, who));
    },
    [commit, reload, requireActor]
  );

  const clock: AttendanceShape["clock"] = useCallback(
    async (action, comment = "") => {
      const args = { id: crypto.randomUUID(), action, expected: openEntry?.id ?? null, eventIso: new Date().toISOString(), comment };
      try {
        await mutate(() => repo.rpcClock(args), (s, who) => clockTransition(s, who, args).state);
      } catch (e) {
        if (e instanceof Error && e.message === CLOCK_CONFLICT) {
          if (isSupabaseConfigured) await reload().catch(() => undefined);
          throw new Error("Din stämpling har ändrats från en annan enhet. Vyn är uppdaterad, försök igen.");
        }
        throw e;
      }
    },
    [mutate, openEntry, reload]
  );

  const addEntries: AttendanceShape["addEntries"] = useCallback(
    (items, userId = null, reason = null) => {
      const withIds = items.map((item) => ({ ...item, id: item.id ?? crypto.randomUUID() }));
      return mutate(() => repo.rpcAddEntries(withIds, userId, reason), (s, who) => engineAddEntries(s, who, withIds, userId, reason));
    },
    [mutate]
  );
  const changeEntry: AttendanceShape["changeEntry"] = useCallback((id, change, reason) => mutate(() => repo.rpcChangeEntry(id, change, reason), (s, who) => engineChangeEntry(s, who, id, change, reason)), [mutate]);
  const deleteEntry: AttendanceShape["deleteEntry"] = useCallback((id, reason) => mutate(() => repo.rpcDeleteEntry(id, reason), (s, who) => engineDeleteEntry(s, who, id, reason)), [mutate]);
  const requestCorrection: AttendanceShape["requestCorrection"] = useCallback(
    (req) => {
      const full = { ...req, id: req.id ?? crypto.randomUUID() };
      return mutate(() => repo.rpcRequestCorrection(full), (s, who) => engineRequest(s, who, full));
    },
    [mutate]
  );
  const decideCorrection: AttendanceShape["decideCorrection"] = useCallback((id, approve, note) => mutate(() => repo.rpcDecideCorrection(id, approve, note), (s, who) => engineDecide(s, who, id, approve, note)), [mutate]);
  const saveAbsence: AttendanceShape["saveAbsence"] = useCallback((a, reason) => mutate(() => repo.rpcSaveAbsence(a, reason), (s, who) => engineSaveAbsence(s, who, a, reason)), [mutate]);
  const deleteAbsence: AttendanceShape["deleteAbsence"] = useCallback((id, reason) => mutate(() => repo.rpcDeleteAbsence(id, reason), (s, who) => engineDeleteAbsence(s, who, id, reason)), [mutate]);

  const createPeriodAction: AttendanceShape["createPeriod"] = useCallback((name, start, end) => mutate(() => repo.rpcCreatePeriod(name, start, end), (s, who) => createPeriod(s, who, name, start, end)), [mutate]);
  const submit: AttendanceShape["submitStatement"] = useCallback((periodId) => mutate(() => repo.rpcSubmitStatement(periodId), (s, who) => submitStatement(s, who, periodId)), [mutate]);

  const compute: AttendanceShape["compute"] = useCallback(
    (userId, period) => {
      const result = computeEmployeePayroll({
        userId, periodStart: period.start_date, periodEnd: period.end_date, entries: state.entries, absences: state.absences, terms: settings.terms, ruleSets: settings.ruleSets,
      });
      const blockers = payrollBlockers({ userId, result, terms: settings.terms, ruleSets: settings.ruleSets });
      if (!isRangeLoaded(addDays(period.start_date, -8), addDays(period.end_date, 1))) blockers.push("Perioden är inte fullständigt inläst ännu. Vänta tills hämtningen är klar.");
      return { ...result, blockers };
    },
    [state.entries, state.absences, settings.terms, settings.ruleSets, isRangeLoaded]
  );

  const statementFor: AttendanceShape["statementFor"] = useCallback((periodId, userId) => visible.statements.find((s) => s.period_id === periodId && s.user_id === userId) ?? null, [visible.statements]);

  // Attest och rättelse räknas på färska rader från servern tillsammans med ett fingeravtryck. Servern
  // verifierar fingeravtryck, arbetad tid, rast och frånvaro innan underlaget sparas (se 0029).
  const computeFresh = useCallback(
    async (periodId: string, userId: string, period: PayrollPeriod) => {
      const inputs = await repo.rpcInputs(periodId, userId);
      const result = computeEmployeePayroll({ userId, periodStart: period.start_date, periodEnd: period.end_date, entries: inputs.entries, absences: inputs.absences, terms: inputs.terms, ruleSets: inputs.ruleSets });
      const blockers = payrollBlockers({ userId, result, terms: inputs.terms, ruleSets: inputs.ruleSets });
      if (!result.hasTerms) blockers.unshift("Personen saknar schema och regler. Ställ in dem under Inställningar → Lön.");
      if (blockers.length > 0) throw new Error(blockers.join(" "));
      return { inputs, result, days: result.days.map((day) => ({ ...day })) };
    },
    []
  );

  const attest: AttendanceShape["attest"] = useCallback(
    async (periodId, userId) => {
      const who = requireActor();
      const period = stateRef.current.periods.find((p) => p.id === periodId);
      if (!period) throw new Error("Löneperioden hittades inte.");
      if (isSupabaseConfigured) {
        const { inputs, result, days } = await computeFresh(periodId, userId, period);
        await repo.rpcAttest(periodId, userId, result.totals, days, inputs.fingerprint);
        await reload();
        return;
      }
      const result = compute(userId, period);
      if (!result.hasTerms) throw new Error("Personen saknar schema och regler. Ställ in dem under Inställningar → Lön innan attestering.");
      if (result.blockers.length > 0) throw new Error(result.blockers.join(" "));
      const days = result.days.map((day) => ({ ...day }));
      const snapshot = { verifiedAt: new Date().toISOString(), ruleSets: settings.ruleSets, terms: settings.terms.filter((t) => t.user_id === userId) };
      commit(attestStatement(stateRef.current, who, periodId, userId, result.totals as unknown as Record<string, unknown>, days, snapshot));
    },
    [commit, compute, computeFresh, reload, requireActor, settings.ruleSets, settings.terms]
  );
  const unattest: AttendanceShape["unattest"] = useCallback((id, reason) => mutate(() => repo.rpcUnattest(id, reason), (s, who) => unattestStatement(s, who, id, reason)), [mutate]);
  const review: AttendanceShape["review"] = useCallback((id) => mutate(() => repo.rpcReview(id), (s, who) => reviewStatement(s, who, id)), [mutate]);

  const recordAdjustmentAction: AttendanceShape["recordAdjustment"] = useCallback(
    async (statementId, reason) => {
      const who = requireActor();
      const statement = stateRef.current.statements.find((s) => s.id === statementId);
      const period = statement ? stateRef.current.periods.find((p) => p.id === statement.period_id) : null;
      if (!statement || !period) throw new Error("Sammanställningen hittades inte.");
      if (isSupabaseConfigured) {
        const { inputs, result, days } = await computeFresh(period.id, statement.user_id, period);
        await repo.rpcRecordAdjustment(statementId, result.totals, days, reason, inputs.fingerprint);
        await reload();
        return;
      }
      const result = compute(statement.user_id, period);
      if (result.blockers.length > 0) throw new Error(result.blockers.join(" "));
      const days = result.days.map((day) => ({ ...day }));
      commit(recordAdjustment(stateRef.current, who, statementId, result.totals as unknown as Record<string, unknown>, days, reason).state);
    },
    [commit, compute, computeFresh, reload, requireActor]
  );

  const employeeInfo: AttendanceShape["employeeInfo"] = useCallback(
    (userId) => {
      const latest = settings.terms.filter((t) => t.user_id === userId).sort((a, b) => (a.valid_from < b.valid_from ? 1 : -1))[0];
      return { userId, name: profiles.find((p) => p.id === userId)?.full_name ?? userId, employmentNumber: latest?.employment_number ?? null, externalRef: latest?.external_employee_ref ?? null };
    },
    [profiles, settings.terms]
  );

  const exportPeriod: AttendanceShape["exportPeriod"] = useCallback(
    async (options) => {
      const who = requireActor();
      const period = state.periods.find((p) => p.id === options.periodId);
      if (!period) throw new Error("Löneperioden hittades inte.");
      const statements = state.statements.filter((s) => options.statementIds.includes(s.id));
      const hasPending = (s: PayrollStatement) => state.adjustments.some((a) => a.statement_id === s.id && a.export_id === null);
      const correctionOnly = statements.filter((s) => s.status === "exported" && hasPending(s));
      const periodStatements = statements.filter((s) => !correctionOnly.includes(s));
      const employees = new Map(statements.map((s) => [s.user_id, employeeInfo(s.user_id)]));
      const common = { period, mappings: settings.mappings, ruleSets: settings.ruleSets, employees };
      const periodPart = buildExportLines({ ...common, statements: periodStatements, adjustments: [], includePeriodLines: true });
      const correctionPart = buildExportLines({ ...common, statements: correctionOnly, adjustments: state.adjustments.filter((a) => a.export_id === null && correctionOnly.some((s) => s.id === a.statement_id)), includePeriodLines: false });
      const lines = [...periodPart.lines, ...correctionPart.lines];
      const kind = correctionOnly.length > 0 && periodStatements.length === 0 ? "correction" : periodStatements.some((s) => s.status === "exported") ? "reexport" : "regular";
      const built = adapterById(options.formatId).build(exportInput(period, lines, kind));
      built.warnings = [...new Set([...periodPart.warnings, ...correctionPart.warnings])];
      const missing = [...new Set([...periodPart.missingCodes, ...correctionPart.missingCodes])];
      if (missing.length > 0 && !options.allowMissingCodes) throw new MissingCodesError(missing);
      if (statements.some((s) => !s.totals || !s.rule_snapshot)) throw new Error("Någon sammanställning saknar verifierat underlag och kan inte exporteras.");
      const checksum = await sha256Hex(built.content);
      const request = { periodId: options.periodId, statementIds: options.statementIds, format: options.formatId, checksum, rowCount: built.rowCount, force: options.force, reason: options.reason };
      if (isSupabaseConfigured) {
        await repo.rpcCreateExport(request);
        await reload();
      } else {
        commit(createExport(stateRef.current, who, request).state);
      }
      return built;
    },
    [commit, employeeInfo, reload, requireActor, settings.mappings, settings.ruleSets, state]
  );

  const saveTerms: AttendanceShape["saveTerms"] = useCallback(
    async (terms) => {
      const who = requireActor();
      if (!roleIsPayrollAdmin(who.role)) throw new Error("Åtgärden nekas.");
      if (isSupabaseConfigured) {
        await repo.rpcSaveTerms({ ...terms });
        await reload();
        return;
      }
      setSettings((prev) => {
        const existing = prev.terms.find((t) => t.user_id === terms.user_id && t.valid_from === terms.valid_from);
        const row: EmployeeTermsRow = { ...terms, id: existing?.id ?? crypto.randomUUID(), org_id: who.orgId };
        return { ...prev, terms: existing ? prev.terms.map((t) => (t.id === existing.id ? row : t)) : [...prev.terms, row] };
      });
    },
    [reload, requireActor]
  );

  const saveRuleSet: AttendanceShape["saveRuleSet"] = useCallback(
    async (id, name, config, activeFlag) => {
      const who = requireActor();
      if (!roleIsPayrollAdmin(who.role)) throw new Error("Åtgärden nekas.");
      if (isSupabaseConfigured) {
        await repo.rpcSaveRuleSet(id, name, config, activeFlag);
        await reload();
        return;
      }
      setSettings((prev) => {
        const previous = prev.ruleSets.find((r) => r.id === id);
        const unchanged = previous && JSON.stringify(previous.config) === JSON.stringify(config);
        const row: OvertimeRuleSetRow = { id: id ?? crypto.randomUUID(), org_id: who.orgId, name: name.trim(), config, active: activeFlag, approved_at: unchanged ? previous.approved_at : null, approved_by: unchanged ? previous.approved_by : null, approval_note: unchanged ? previous.approval_note : null };
        return { ...prev, ruleSets: prev.ruleSets.some((r) => r.id === row.id) ? prev.ruleSets.map((r) => (r.id === row.id ? row : r)) : [...prev.ruleSets, row] };
      });
    },
    [reload, requireActor]
  );

  const approveRuleSet: AttendanceShape["approveRuleSet"] = useCallback(
    async (id, note) => {
      const who = requireActor();
      if (who.role !== "admin") throw new Error("Endast admin kan godkänna en regelmall.");
      if (!note.trim()) throw new Error("Ange vad godkännandet grundar sig på (t.ex. avtal och datum).");
      if (isSupabaseConfigured) {
        await repo.rpcApproveRuleSet(id, note);
        await reload();
        return;
      }
      setSettings((prev) => ({ ...prev, ruleSets: prev.ruleSets.map((r) => (r.id === id ? { ...r, approved_at: new Date().toISOString(), approved_by: who.id, approval_note: note.trim() } : r)) }));
    },
    [reload, requireActor]
  );

  const saveMapping: AttendanceShape["saveMapping"] = useCallback(
    async (timeType, code, label) => {
      const who = requireActor();
      if (!roleIsPayrollAdmin(who.role)) throw new Error("Åtgärden nekas.");
      if (isSupabaseConfigured) {
        await repo.rpcSaveMapping(timeType, code, label);
        await reload();
        return;
      }
      setSettings((prev) => {
        const existing = prev.mappings.find((m) => m.time_type === timeType);
        const row: PayrollCodeMapping = { id: existing?.id ?? crypto.randomUUID(), org_id: who.orgId, time_type: timeType, external_code: code.trim(), label: label.trim() };
        return { ...prev, mappings: existing ? prev.mappings.map((m) => (m.time_type === timeType ? row : m)) : [...prev.mappings, row] };
      });
    },
    [reload, requireActor]
  );

  const refresh = useCallback(async () => {
    if (isSupabaseConfigured) await reload();
  }, [reload]);

  const value: AttendanceShape = {
    isLoading, error, actor, canAttest, isPayrollAdmin, canViewPayroll, state: visible, ...visibleSettings, myEntries, openEntry,
    clock, addEntries, changeEntry, deleteEntry, requestCorrection, decideCorrection, saveAbsence, deleteAbsence,
    createPeriod: createPeriodAction, submitStatement: submit, attest, unattest, review, recordAdjustment: recordAdjustmentAction,
    exportPeriod, saveTerms, saveRuleSet, saveMapping, compute, ensureRange, isRangeLoaded, approveRuleSet, statementFor, employeeInfo, refresh,
  };
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useAttendance() {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error("useAttendance måste användas inom AttendanceProvider");
  return ctx;
}
