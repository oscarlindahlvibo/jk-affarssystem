import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import type { BillingExtraLine, BillingRate, BillingRateType, WorkReport, WorkReportBilling } from "../types";
import { useAuth } from "../lib/auth";
import { useStore } from "./store";
import { isSupabaseConfigured } from "../lib/supabase";
import { localDateKey } from "../lib/stockholmTime";
import {
  deleteInternalReport,
  FINANCE_ROLES,
  isInvoiced,
  MANAGER_ROLES,
  saveInternalReport,
  type ReportActor,
  type WorkReportInput,
} from "../lib/workReportEngine";
import {
  loadWorkReportData,
  rpcAdjustBilling,
  rpcClearInvoiced,
  rpcDeleteExtraLine,
  rpcDeleteReport,
  rpcMarkInvoiced,
  rpcSaveExtraLine,
  rpcSaveReport,
  rpcSetRate,
} from "./workReportRepository";

export const MOCK_REPORTS_KEY = "jk-mock-work-reports";
export const MOCK_BILLING_KEY = "jk-mock-work-billing";
const MOCK_RATES_KEY = "jk-mock-billing-rates";
const MOCK_EXTRA_KEY = "jk-mock-billing-extra";

export function readJson<T>(key: string, fallback: T): T {
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
    // Mockläget fungerar ändå under den öppna sessionen.
  }
}

export interface BillingAdjustment {
  billable_hours: number | null;
  billable_distance_km: number | null;
  billable_waiting_hours: number | null;
  hours_rate: number | null;
  distance_rate: number | null;
  waiting_rate: number | null;
  adjust_reason: string;
}

interface WorkReportsShape {
  isLoading: boolean;
  error: string | null;
  canManage: boolean;
  canSeeFinance: boolean;
  isFinanceAdmin: boolean;
  reports: WorkReport[];
  billings: WorkReportBilling[];
  rates: BillingRate[];
  extraLines: BillingExtraLine[];
  saveReport: (input: WorkReportInput) => Promise<void>;
  deleteReport: (id: string) => Promise<void>;
  adjustBilling: (reportId: string, patch: BillingAdjustment) => Promise<void>;
  markInvoiced: (reportIds: string[], extraIds: string[], reference: string) => Promise<void>;
  clearInvoiced: (reportIds: string[], extraIds: string[], reason: string) => Promise<void>;
  setRate: (scope: { customerId?: string; projectId?: string }, type: BillingRateType, price: number | null) => Promise<void>;
  saveExtraLine: (line: Pick<BillingExtraLine, "id" | "project_id" | "description" | "quantity" | "unit" | "unit_price">) => Promise<void>;
  deleteExtraLine: (id: string) => Promise<void>;
  refresh: () => Promise<void>;
}

const Ctx = createContext<WorkReportsShape | null>(null);

export function WorkReportsProvider({ children }: { children: ReactNode }) {
  const { currentProfile } = useAuth();
  const { projects, profiles, suppliers } = useStore();
  const role = currentProfile?.role ?? null;
  const active = currentProfile?.status === "aktiv";
  const canManage = Boolean(active && role && MANAGER_ROLES.includes(role));
  const canSeeFinance = Boolean(active && role && FINANCE_ROLES.includes(role));
  const isFinanceAdmin = role === "admin" || role === "ekonomi";

  const [reports, setReports] = useState<WorkReport[]>(() => (isSupabaseConfigured ? [] : readJson(MOCK_REPORTS_KEY, [])));
  const [billings, setBillings] = useState<WorkReportBilling[]>(() => (isSupabaseConfigured ? [] : readJson(MOCK_BILLING_KEY, [])));
  const [rates, setRates] = useState<BillingRate[]>(() => (isSupabaseConfigured ? [] : readJson(MOCK_RATES_KEY, [])));
  const [extraLines, setExtraLines] = useState<BillingExtraLine[]>(() => (isSupabaseConfigured ? [] : readJson(MOCK_EXTRA_KEY, [])));
  const [isLoading, setIsLoading] = useState(isSupabaseConfigured);
  const [error, setError] = useState<string | null>(null);

  const reload = useCallback(async () => {
    if (!isSupabaseConfigured || !active) return;
    const data = await loadWorkReportData(canSeeFinance);
    setReports(data.reports);
    setBillings(data.billings);
    setRates(data.rates);
    setExtraLines(data.extraLines);
  }, [active, canSeeFinance]);

  useEffect(() => {
    if (!isSupabaseConfigured || !active) return;
    let live = true;
    setIsLoading(true);
    reload()
      .then(() => live && setError(null))
      .catch((e) => live && setError(e instanceof Error ? e.message : "Kunde inte läsa rapporterat arbete."))
      .finally(() => live && setIsLoading(false));
    return () => {
      live = false;
    };
  }, [active, reload]);

  useEffect(() => {
    if (!isSupabaseConfigured) writeJson(MOCK_REPORTS_KEY, reports);
  }, [reports]);
  useEffect(() => {
    if (!isSupabaseConfigured) writeJson(MOCK_BILLING_KEY, billings);
  }, [billings]);
  useEffect(() => {
    if (!isSupabaseConfigured) writeJson(MOCK_RATES_KEY, rates);
  }, [rates]);
  useEffect(() => {
    if (!isSupabaseConfigured) writeJson(MOCK_EXTRA_KEY, extraLines);
  }, [extraLines]);

  const actor = useMemo<ReportActor | null>(
    () => (currentProfile && active ? { id: currentProfile.id, orgId: currentProfile.org_id, role: currentProfile.role, fullName: currentProfile.full_name } : null),
    [currentProfile, active]
  );
  const requireActor = useCallback(() => {
    if (!actor) throw new Error("Kontot är inte aktivt.");
    return actor;
  }, [actor]);
  const requireFinance = useCallback(() => {
    const a = requireActor();
    if (!FINANCE_ROLES.includes(a.role)) throw new Error("Du saknar behörighet till fakturaunderlag.");
    return a;
  }, [requireActor]);

  const saveReport: WorkReportsShape["saveReport"] = useCallback(
    async (input) => {
      const who = requireActor();
      if (isSupabaseConfigured) {
        await rpcSaveReport(input);
        await reload();
        return;
      }
      const today = localDateKey(new Date());
      saveInternalReport({ reports, billings, projects, profiles, suppliers, today }, who, input);
      setReports((prev) => {
        try {
          return saveInternalReport({ reports: prev, billings, projects, profiles, suppliers, today }, who, input).reports;
        } catch {
          return prev;
        }
      });
    },
    [billings, profiles, projects, reload, reports, requireActor, suppliers]
  );

  const deleteReport: WorkReportsShape["deleteReport"] = useCallback(
    async (id) => {
      const who = requireActor();
      if (isSupabaseConfigured) {
        await rpcDeleteReport(id);
        await reload();
        return;
      }
      const remaining = deleteInternalReport({ reports, billings }, who, id);
      const keep = new Set(remaining.map((r) => r.id));
      setReports((prev) => prev.filter((r) => keep.has(r.id)));
    },
    [billings, reload, reports, requireActor]
  );

  const adjustBilling: WorkReportsShape["adjustBilling"] = useCallback(
    async (reportId, patch) => {
      const who = requireFinance();
      if (isSupabaseConfigured) {
        await rpcAdjustBilling(reportId, patch);
        await reload();
        return;
      }
      const target = reports.find((r) => r.id === reportId && r.org_id === who.orgId);
      if (!target) throw new Error("Rapporten hittades inte.");
      if (isInvoiced(billings, reportId)) throw new Error("Rapporten är fakturerad. Ta bort faktureringsmarkeringen först.");
      const existing = billings.find((b) => b.report_id === reportId);
      const next: WorkReportBilling = {
        report_id: reportId,
        org_id: who.orgId,
        invoiced_at: existing?.invoiced_at ?? null,
        invoiced_by: existing?.invoiced_by ?? null,
        invoice_reference: existing?.invoice_reference ?? null,
        ...patch,
        adjust_reason: patch.adjust_reason.trim() || null,
        adjusted_by: who.id,
        adjusted_at: new Date().toISOString(),
      };
      setBillings((prev) => [...prev.filter((b) => b.report_id !== reportId), next]);
    },
    [billings, reload, reports, requireFinance]
  );

  const markInvoiced: WorkReportsShape["markInvoiced"] = useCallback(
    async (reportIds, extraIds, reference) => {
      const who = requireFinance();
      if (!reference.trim()) throw new Error("Ange fakturanummer eller referens.");
      if (isSupabaseConfigured) {
        await rpcMarkInvoiced(reportIds, extraIds, reference.trim());
        await reload();
        return;
      }
      const already = reportIds.filter((id) => isInvoiced(billings, id));
      const alreadyExtra = extraLines.filter((l) => extraIds.includes(l.id) && l.invoiced_at).map((l) => l.id);
      if (already.length > 0 || alreadyExtra.length > 0) throw new Error(`Redan fakturerat: ${[...already, ...alreadyExtra].join(", ")}`);
      const now = new Date().toISOString();
      const marked = reportIds.map((id): WorkReportBilling => {
        const existing = billings.find((b) => b.report_id === id);
        return (
          existing ?? {
            report_id: id, org_id: who.orgId, billable_hours: null, billable_distance_km: null, billable_waiting_hours: null,
            hours_rate: null, distance_rate: null, waiting_rate: null, adjust_reason: null, adjusted_by: null, adjusted_at: null,
            invoiced_at: null, invoiced_by: null, invoice_reference: null,
          }
        );
      }).map((b) => ({ ...b, invoiced_at: now, invoiced_by: who.id, invoice_reference: reference.trim() }));
      setBillings((prev) => [...prev.filter((b) => !reportIds.includes(b.report_id)), ...marked]);
      setExtraLines((prev) => prev.map((l) => (extraIds.includes(l.id) ? { ...l, invoiced_at: now, invoice_reference: reference.trim() } : l)));
    },
    [billings, extraLines, reload, requireFinance]
  );

  const clearInvoiced: WorkReportsShape["clearInvoiced"] = useCallback(
    async (reportIds, extraIds, reason) => {
      requireFinance();
      if (!isFinanceAdmin) throw new Error("Endast admin eller ekonomi kan ta bort faktureringsmarkering.");
      if (!reason.trim()) throw new Error("Ange orsak.");
      if (isSupabaseConfigured) {
        await rpcClearInvoiced(reportIds, extraIds, reason.trim());
        await reload();
        return;
      }
      setBillings((prev) => prev.map((b) => (reportIds.includes(b.report_id) ? { ...b, invoiced_at: null, invoiced_by: null, invoice_reference: null } : b)));
      setExtraLines((prev) => prev.map((l) => (extraIds.includes(l.id) ? { ...l, invoiced_at: null, invoice_reference: null } : l)));
    },
    [billings, extraLines, isFinanceAdmin, reload, requireFinance]
  );

  const setRate: WorkReportsShape["setRate"] = useCallback(
    async (scope, type, price) => {
      const who = requireFinance();
      if (price !== null && (!Number.isFinite(price) || price < 0)) throw new Error("Priset kan inte vara negativt.");
      const customerId = scope.customerId ?? null;
      const projectId = scope.projectId ?? null;
      if (isSupabaseConfigured) {
        await rpcSetRate(customerId, projectId, type, price);
        await reload();
        return;
      }
      setRates((prev) => {
        const others = prev.filter((r) => !(r.rate_type === type && r.customer_id === customerId && r.project_id === projectId));
        return price === null ? others : [...others, { id: crypto.randomUUID(), org_id: who.orgId, customer_id: customerId, project_id: projectId, rate_type: type, unit_price: price }];
      });
    },
    [rates, reload, requireFinance]
  );

  const saveExtraLine: WorkReportsShape["saveExtraLine"] = useCallback(
    async (line) => {
      const who = requireFinance();
      if (!line.description.trim() || !(line.quantity > 0) || !(line.unit_price >= 0)) throw new Error("Ange beskrivning, antal och pris.");
      if (isSupabaseConfigured) {
        await rpcSaveExtraLine(line);
        await reload();
        return;
      }
      const existing = extraLines.find((l) => l.id === line.id);
      if (existing?.invoiced_at) throw new Error("Posten är fakturerad och kan inte ändras.");
      const next: BillingExtraLine = { ...line, org_id: who.orgId, invoiced_at: null, invoice_reference: null, created_at: existing?.created_at ?? new Date().toISOString() };
      setExtraLines((prev) => (prev.some((l) => l.id === line.id) ? prev.map((l) => (l.id === line.id ? next : l)) : [...prev, next]));
    },
    [extraLines, reload, requireFinance]
  );

  const deleteExtraLine: WorkReportsShape["deleteExtraLine"] = useCallback(
    async (id) => {
      requireFinance();
      if (isSupabaseConfigured) {
        await rpcDeleteExtraLine(id);
        await reload();
        return;
      }
      if (extraLines.find((l) => l.id === id)?.invoiced_at) throw new Error("Posten är fakturerad och kan inte tas bort.");
      setExtraLines((prev) => prev.filter((l) => l.id !== id));
    },
    [extraLines, reload, requireFinance]
  );

  const refresh = useCallback(async () => {
    if (isSupabaseConfigured) await reload();
  }, [reload]);

  const value = useMemo<WorkReportsShape>(
    () => ({
      isLoading, error, canManage, canSeeFinance, isFinanceAdmin,
      reports: actor ? reports.filter((r) => r.org_id === actor.orgId) : [],
      billings, rates, extraLines,
      saveReport, deleteReport, adjustBilling, markInvoiced, clearInvoiced, setRate, saveExtraLine, deleteExtraLine, refresh,
    }),
    [isLoading, error, canManage, canSeeFinance, isFinanceAdmin, actor, reports, billings, rates, extraLines, saveReport, deleteReport, adjustBilling, markInvoiced, clearInvoiced, setRate, saveExtraLine, deleteExtraLine, refresh]
  );
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useWorkReports() {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error("useWorkReports måste användas inom WorkReportsProvider");
  return ctx;
}
