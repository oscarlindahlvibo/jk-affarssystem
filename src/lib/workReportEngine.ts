// Regler för rapporterat arbete, i ren TypeScript. Speglar databasfunktionerna i
// supabase/migrations/0027_work_reports_and_carriers.sql och används i mockläget.
import type { UserRole, WorkReport, WorkReportBilling, WorkReportPerformerType } from "../types";
import { reportHasContent } from "./billing";
import { normalizeTime } from "./reportTimes";

export interface WorkReportInput {
  id: string;
  project_id: string;
  task_id: string | null;
  report_date: string;
  report_start?: string | null;
  report_end?: string | null;
  performer_type: WorkReportPerformerType;
  performer_profile_id: string | null;
  performer_supplier_id: string | null;
  hours: number | null;
  distance_km: number | null;
  waiting_hours: number | null;
  work_type: string;
  billable: boolean;
  comment: string;
  internal_cost?: number | null;
}

export interface ReportActor {
  id: string;
  orgId: string;
  role: UserRole;
  fullName: string;
}

export const MANAGER_ROLES: UserRole[] = ["admin", "projektledare", "ekonomi"];
export const FINANCE_ROLES: UserRole[] = ["admin", "projektledare", "ekonomi"];

function assertNumber(value: number | null, label: string, max: number) {
  if (value === null) return;
  if (!Number.isFinite(value) || value < 0 || value > max) throw new Error(`Ogiltigt värde för ${label}.`);
}

// Start och slut måste anges tillsammans och vara giltiga klockslag.
function checkTimes(input: { report_start?: string | null; report_end?: string | null }) {
  const start = input.report_start ? normalizeTime(input.report_start) : null;
  const end = input.report_end ? normalizeTime(input.report_end) : null;
  if ((input.report_start && !start) || (input.report_end && !end)) throw new Error("Ogiltigt klockslag.");
  if ((start === null) !== (end === null)) throw new Error("Ange både start- och sluttid, eller ingen av dem.");
  return { start, end };
}

export function isInvoiced(billings: WorkReportBilling[], reportId: string) {
  return billings.some((billing) => billing.report_id === reportId && Boolean(billing.invoiced_at));
}

export interface ReportContext {
  reports: WorkReport[];
  billings: WorkReportBilling[];
  projects: { id: string; org_id: string }[];
  profiles: { id: string; org_id: string; full_name: string; status: string }[];
  suppliers: { id: string; org_id: string; company_name: string }[];
  today: string;
}

export function saveInternalReport(
  ctx: ReportContext,
  actor: ReportActor,
  input: WorkReportInput,
  nowIso = new Date().toISOString()
): { reports: WorkReport[]; saved: WorkReport } {
  const isManager = MANAGER_ROLES.includes(actor.role);
  const project = ctx.projects.find((p) => p.id === input.project_id && p.org_id === actor.orgId);
  if (!project) throw new Error("Projektet hittades inte.");
  const maxDate = new Date(`${ctx.today}T00:00:00Z`);
  maxDate.setUTCDate(maxDate.getUTCDate() + 1);
  if (!input.report_date || new Date(`${input.report_date}T00:00:00Z`) > maxDate) throw new Error("Ogiltigt datum.");
  assertNumber(input.hours, "tid", 999);
  assertNumber(input.distance_km, "körsträcka", 99999);
  assertNumber(input.waiting_hours, "väntetid", 999);
  if (!reportHasContent(input)) throw new Error("Ange minst tid, körsträcka eller väntetid.");
  const times = checkTimes(input);

  const existing = ctx.reports.find((report) => report.id === input.id);
  if (existing) {
    if (existing.org_id !== actor.orgId) throw new Error("Åtgärden nekas.");
    if (!isManager && existing.created_by !== actor.id) throw new Error("Du kan bara ändra egna rapporter.");
    if (isInvoiced(ctx.billings, existing.id)) throw new Error("Rapporten är fakturerad och kan inte ändras.");
  }

  let performerName: string;
  let performerProfile: string | null = null;
  let performerSupplier: string | null = null;
  if (input.performer_type === "employee") {
    performerProfile = input.performer_profile_id ?? actor.id;
    if (!isManager && performerProfile !== actor.id) throw new Error("Du kan bara rapportera eget arbete.");
    const profile = ctx.profiles.find((p) => p.id === performerProfile && p.org_id === actor.orgId && p.status === "aktiv");
    if (!profile) throw new Error("Utföraren hittades inte.");
    performerName = profile.full_name;
  } else {
    if (!isManager) throw new Error("Endast ansvarig kan rapportera för extern transportör.");
    const supplier = ctx.suppliers.find((s) => s.id === input.performer_supplier_id && s.org_id === actor.orgId);
    if (!supplier) throw new Error("Transportören hittades inte.");
    performerSupplier = supplier.id;
    performerName = supplier.company_name;
  }

  const saved: WorkReport = {
    id: input.id,
    org_id: actor.orgId,
    project_id: input.project_id,
    task_id: input.task_id,
    report_date: input.report_date,
    report_start: times.start,
    report_end: times.end,
    performer_type: input.performer_type,
    performer_profile_id: performerProfile,
    performer_carrier_user_id: existing?.performer_carrier_user_id ?? null,
    performer_supplier_id: performerSupplier,
    performer_name: performerName,
    hours: input.hours,
    distance_km: input.distance_km,
    waiting_hours: input.waiting_hours,
    work_type: input.work_type || "transport",
    billable: input.billable,
    comment: input.comment.trim(),
    created_by: existing?.created_by ?? actor.id,
    created_at: existing?.created_at ?? nowIso,
    updated_at: nowIso,
    edited_by: existing ? actor.id : null,
    edited_at: existing ? nowIso : null,
    internal_cost: FINANCE_ROLES.includes(actor.role) && "internal_cost" in input ? input.internal_cost ?? null : existing?.internal_cost ?? null,
  };
  return { reports: existing ? ctx.reports.map((report) => (report.id === input.id ? saved : report)) : [saved, ...ctx.reports], saved };
}

export function deleteInternalReport(ctx: Pick<ReportContext, "reports" | "billings">, actor: ReportActor, id: string) {
  const target = ctx.reports.find((report) => report.id === id && report.org_id === actor.orgId);
  if (!target) throw new Error("Rapporten hittades inte.");
  if (!MANAGER_ROLES.includes(actor.role) && target.created_by !== actor.id) throw new Error("Du kan bara ta bort egna rapporter.");
  if (isInvoiced(ctx.billings, id)) throw new Error("Rapporten är fakturerad och kan inte tas bort.");
  return ctx.reports.filter((report) => report.id !== id);
}

export interface CarrierActor {
  id: string;
  orgId: string;
  supplierId: string;
  fullName: string;
}

export function carrierSaveReport(
  ctx: { reports: WorkReport[]; billings: WorkReportBilling[]; assignedProjectIds: string[]; today: string },
  carrier: CarrierActor,
  input: Pick<WorkReportInput, "id" | "project_id" | "report_date" | "hours" | "distance_km" | "waiting_hours" | "work_type" | "comment" | "task_id" | "report_start" | "report_end">,
  nowIso = new Date().toISOString()
): WorkReport[] {
  if (!ctx.assignedProjectIds.includes(input.project_id)) throw new Error("Uppdraget är inte tilldelat dig.");
  const maxDate = new Date(`${ctx.today}T00:00:00Z`);
  maxDate.setUTCDate(maxDate.getUTCDate() + 1);
  if (!input.report_date || new Date(`${input.report_date}T00:00:00Z`) > maxDate) throw new Error("Ogiltigt datum.");
  assertNumber(input.hours, "tid", 999);
  assertNumber(input.distance_km, "körsträcka", 99999);
  assertNumber(input.waiting_hours, "väntetid", 999);
  if (!reportHasContent(input)) throw new Error("Ange minst tid, körsträcka eller väntetid.");
  const times = checkTimes(input);

  const existing = ctx.reports.find((report) => report.id === input.id);
  if (existing) {
    if (existing.performer_carrier_user_id !== carrier.id) throw new Error("Du kan bara ändra egna rapporter.");
    const billing = ctx.billings.find((b) => b.report_id === existing.id);
    if (billing && (billing.invoiced_at || billing.adjusted_at)) throw new Error("Rapporten är behandlad av JK och kan inte ändras. Kontakta JK.");
  }
  const saved: WorkReport = {
    id: input.id,
    org_id: carrier.orgId,
    project_id: input.project_id,
    task_id: input.task_id ?? null,
    report_date: input.report_date,
    report_start: times.start,
    report_end: times.end,
    performer_type: "carrier",
    performer_profile_id: null,
    performer_carrier_user_id: carrier.id,
    performer_supplier_id: carrier.supplierId,
    performer_name: carrier.fullName,
    hours: input.hours,
    distance_km: input.distance_km,
    waiting_hours: input.waiting_hours,
    work_type: input.work_type || "transport",
    billable: existing?.billable ?? true,
    comment: input.comment.trim(),
    created_by: existing?.created_by ?? carrier.id,
    created_at: existing?.created_at ?? nowIso,
    updated_at: nowIso,
    edited_by: existing ? carrier.id : null,
    edited_at: existing ? nowIso : null,
  };
  return existing ? ctx.reports.map((report) => (report.id === input.id ? saved : report)) : [saved, ...ctx.reports];
}

export function carrierDeleteReport(
  ctx: { reports: WorkReport[]; billings: WorkReportBilling[] },
  carrier: CarrierActor,
  id: string
): WorkReport[] {
  const target = ctx.reports.find((report) => report.id === id && report.performer_carrier_user_id === carrier.id);
  if (!target) throw new Error("Rapporten hittades inte.");
  const billing = ctx.billings.find((b) => b.report_id === id);
  if (billing && (billing.invoiced_at || billing.adjusted_at)) throw new Error("Rapporten är behandlad av JK och kan inte tas bort. Kontakta JK.");
  return ctx.reports.filter((report) => report.id !== id);
}
