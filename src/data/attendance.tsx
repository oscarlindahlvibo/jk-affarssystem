import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
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
import { computeEmployeePayroll, normalizeRules } from "../lib/payrollCompute";
import { DEFAULT_OVERTIME_RULES, type PayrollResult } from "../lib/payrollRules";
import { adapterById } from "../lib/payrollExport/adapters";
import { buildExportLines, exportInput } from "../lib/payrollExport/lines";
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
}

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
  requestCorrection: (req: Omit<CorrectionRequest, "id">) => Promise<void>;
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
  compute: (userId: string, period: Pick<PayrollPeriod, "start_date" | "end_date">) => PayrollResult & { hasTerms: boolean };
  statementFor: (periodId: string, userId: string) => PayrollStatement | null;
  employeeInfo: (userId: string) => ExportEmployee;
  refresh: () => Promise<void>;
}

const Ctx = createContext<AttendanceShape | null>(null);

function mockSettings(orgId: string, userIds: string[]): Settings {
  const ruleSetId = "mock-rules";
  return {
    ruleSets: [{ id: ruleSetId, org_id: orgId, name: "Standard (exempel för test)", config: DEFAULT_OVERTIME_RULES as unknown as Record<string, unknown>, active: true }],
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

  const reload = useCallback(async () => {
    if (!isSupabaseConfigured || !active) return;
    const data = await repo.loadAttendanceData();
    setState(data.state);
    setSettings({ terms: data.terms, ruleSets: data.ruleSets, mappings: data.mappings });
  }, [active]);

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
      const next = mock(state, who);
      setState(next);
    },
    [reload, requireActor, state]
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
      const full = { ...req, id: crypto.randomUUID() };
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
    (userId, period) =>
      computeEmployeePayroll({
        userId, periodStart: period.start_date, periodEnd: period.end_date, entries: state.entries, absences: state.absences, terms: settings.terms, ruleSets: settings.ruleSets,
      }),
    [state.entries, state.absences, settings.terms, settings.ruleSets]
  );

  const statementFor: AttendanceShape["statementFor"] = useCallback((periodId, userId) => visible.statements.find((s) => s.period_id === periodId && s.user_id === userId) ?? null, [visible.statements]);

  const attest: AttendanceShape["attest"] = useCallback(
    async (periodId, userId) => {
      const period = state.periods.find((p) => p.id === periodId);
      if (!period) throw new Error("Löneperioden hittades inte.");
      const result = compute(userId, period);
      if (!result.hasTerms) throw new Error("Personen saknar schema och regler. Ställ in dem under Inställningar → Lön innan attestering.");
      if (result.totals.openEntryIds.length > 0) throw new Error("Personen har en pågående stämpling i perioden.");
      const snapshot = { computedAt: new Date().toISOString(), rules: normalizeRules(null) };
      const days = result.days.map((day) => ({ ...day }));
      await mutate(() => repo.rpcAttest(periodId, userId, result.totals, days, snapshot), (s, who) => attestStatement(s, who, periodId, userId, result.totals as unknown as Record<string, unknown>, days, snapshot));
    },
    [compute, mutate, state.periods]
  );
  const unattest: AttendanceShape["unattest"] = useCallback((id, reason) => mutate(() => repo.rpcUnattest(id, reason), (s, who) => unattestStatement(s, who, id, reason)), [mutate]);
  const review: AttendanceShape["review"] = useCallback((id) => mutate(() => repo.rpcReview(id), (s, who) => reviewStatement(s, who, id)), [mutate]);

  const recordAdjustmentAction: AttendanceShape["recordAdjustment"] = useCallback(
    async (statementId, reason) => {
      const statement = state.statements.find((s) => s.id === statementId);
      const period = statement ? state.periods.find((p) => p.id === statement.period_id) : null;
      if (!statement || !period) throw new Error("Sammanställningen hittades inte.");
      const result = compute(statement.user_id, period);
      const days = result.days.map((day) => ({ ...day }));
      await mutate(
        () => repo.rpcRecordAdjustment(statementId, result.totals, days, reason),
        (s, who) => recordAdjustment(s, who, statementId, result.totals as unknown as Record<string, unknown>, days, reason).state
      );
    },
    [compute, mutate, state.periods, state.statements]
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
      const checksum = await sha256Hex(built.content);
      const request = { periodId: options.periodId, statementIds: options.statementIds, format: options.formatId, checksum, rowCount: built.rowCount, force: options.force, reason: options.reason };
      if (isSupabaseConfigured) {
        await repo.rpcCreateExport(request);
        await reload();
      } else {
        setState(createExport(state, who, request).state);
      }
      return built;
    },
    [employeeInfo, reload, requireActor, settings.mappings, settings.ruleSets, state]
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
        const row: OvertimeRuleSetRow = { id: id ?? crypto.randomUUID(), org_id: who.orgId, name: name.trim(), config, active: activeFlag };
        return { ...prev, ruleSets: prev.ruleSets.some((r) => r.id === row.id) ? prev.ruleSets.map((r) => (r.id === row.id ? row : r)) : [...prev.ruleSets, row] };
      });
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
    exportPeriod, saveTerms, saveRuleSet, saveMapping, compute, statementFor, employeeInfo, refresh,
  };
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useAttendance() {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error("useAttendance måste användas inom AttendanceProvider");
  return ctx;
}
