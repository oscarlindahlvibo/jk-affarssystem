import { supabase } from "../lib/supabase";
import { friendlyError, pageAll } from "./pageAll";
import type { BillingExtraLine, BillingRate, BillingRateType, CarrierAssignment, WorkReport, WorkReportBilling } from "../types";
import type { WorkReportInput } from "../lib/workReportEngine";

function client() {
  if (!supabase) throw new Error("Databasen är inte tillgänglig.");
  return supabase;
}

function check(error: { message: string } | null) {
  if (error) throw new Error(friendlyError(error.message));
}

const num = (value: unknown) => (value === null || value === undefined ? null : Number(value));

function toReport(row: Record<string, unknown>, cost: number | null): WorkReport {
  return {
    ...(row as unknown as WorkReport),
    hours: num(row.hours),
    distance_km: num(row.distance_km),
    waiting_hours: num(row.waiting_hours),
    internal_cost: cost,
  };
}

export async function loadWorkReportData(canSeeFinance: boolean) {
  const db = client();
  const reports = await pageAll<Record<string, unknown>>((from, to) => db.from("work_reports").select("*").order("report_date", { ascending: false }).order("id").range(from, to));
  if (!canSeeFinance) {
    return {
      reports: reports.map((row) => toReport(row, null)),
      billings: [] as WorkReportBilling[],
      rates: [] as BillingRate[],
      extraLines: [] as BillingExtraLine[],
    };
  }
  const [costs, billings, rates, extraLines] = await Promise.all([
    pageAll<{ report_id: string; internal_cost: number | string }>((from, to) => db.from("work_report_costs").select("report_id, internal_cost").order("report_id").range(from, to)),
    pageAll<Record<string, unknown>>((from, to) => db.from("work_report_billing").select("*").order("report_id").range(from, to)),
    pageAll<Record<string, unknown>>((from, to) => db.from("billing_rates").select("*").order("id").range(from, to)),
    pageAll<Record<string, unknown>>((from, to) => db.from("billing_extra_lines").select("*").order("created_at").order("id").range(from, to)),
  ]);
  const costByReport = new Map(costs.map((c) => [c.report_id, Number(c.internal_cost)]));
  return {
    reports: reports.map((row) => toReport(row, costByReport.get(String(row.id)) ?? null)),
    billings: billings.map((row) => ({
      ...(row as unknown as WorkReportBilling),
      billable_hours: num(row.billable_hours),
      billable_distance_km: num(row.billable_distance_km),
      billable_waiting_hours: num(row.billable_waiting_hours),
      hours_rate: num(row.hours_rate),
      distance_rate: num(row.distance_rate),
      waiting_rate: num(row.waiting_rate),
    })),
    rates: rates.map((row) => ({ ...(row as unknown as BillingRate), unit_price: Number(row.unit_price) })),
    extraLines: extraLines.map((row) => ({
      ...(row as unknown as BillingExtraLine),
      quantity: Number(row.quantity),
      unit_price: Number(row.unit_price),
    })),
  };
}

export async function rpcSaveReport(input: WorkReportInput) {
  const { error } = await client().rpc("work_report_save", { p_report: input });
  check(error);
}

export async function rpcDeleteReport(id: string) {
  const { error } = await client().rpc("work_report_delete", { p_id: id });
  check(error);
}

export async function rpcAdjustBilling(reportId: string, patch: object) {
  const { error } = await client().rpc("work_report_adjust_billing", { p_report_id: reportId, p_patch: patch });
  check(error);
}

export async function rpcMarkInvoiced(reportIds: string[], extraIds: string[], reference: string) {
  const { error } = await client().rpc("billing_mark_invoiced", { p_report_ids: reportIds, p_extra_ids: extraIds, p_reference: reference });
  check(error);
}

export async function rpcClearInvoiced(reportIds: string[], extraIds: string[], reason: string) {
  const { error } = await client().rpc("billing_clear_invoiced", { p_report_ids: reportIds, p_extra_ids: extraIds, p_reason: reason });
  check(error);
}

export async function rpcSetRate(customerId: string | null, projectId: string | null, type: BillingRateType, price: number | null) {
  const { error } = await client().rpc("billing_rate_set", { p_customer_id: customerId, p_project_id: projectId, p_rate_type: type, p_price: price });
  check(error);
}

export async function rpcSaveExtraLine(line: Pick<BillingExtraLine, "id" | "project_id" | "description" | "quantity" | "unit" | "unit_price">) {
  const { error } = await client().rpc("billing_extra_line_save", { p_line: line });
  check(error);
}

export async function rpcDeleteExtraLine(id: string) {
  const { error } = await client().rpc("billing_extra_line_delete", { p_id: id });
  check(error);
}

// ---- Transportör ----
export async function rpcCarrierAssignments(): Promise<CarrierAssignment[]> {
  const { data, error } = await client().rpc("carrier_assignments");
  check(error);
  return (data ?? []) as CarrierAssignment[];
}

export interface CarrierReportRow {
  id: string;
  project_id: string;
  task_id: string | null;
  report_date: string;
  hours: number | null;
  distance_km: number | null;
  waiting_hours: number | null;
  work_type: string;
  comment: string;
  created_at: string;
  locked: boolean;
}

export async function rpcCarrierReports(): Promise<CarrierReportRow[]> {
  const { data, error } = await client().rpc("carrier_work_reports", { p_project_id: null });
  check(error);
  return ((data ?? []) as CarrierReportRow[]).map((row) => ({
    ...row,
    hours: num(row.hours),
    distance_km: num(row.distance_km),
    waiting_hours: num(row.waiting_hours),
  }));
}

export async function rpcCarrierSaveReport(input: Pick<WorkReportInput, "id" | "project_id" | "report_date" | "hours" | "distance_km" | "waiting_hours" | "work_type" | "comment" | "task_id">) {
  const { error } = await client().rpc("carrier_work_report_save", { p_report: input });
  check(error);
}

export async function rpcCarrierDeleteReport(id: string) {
  const { error } = await client().rpc("carrier_work_report_delete", { p_id: id });
  check(error);
}
