// Datalager för transportörsportalen. Transportörer når inga interna tabeller: i skarpt läge går allt via
// begränsade databasfunktioner (carrier_*), i mockläget läses samma lokala data som personalens vy.
import type { CarrierAssignment, CarrierUser, WorkReport, WorkReportBilling } from "../types";
import { projects as mockProjects } from "./mockData";
import { isSupabaseConfigured } from "../lib/supabase";
import { localDateKey } from "../lib/stockholmTime";
import { carrierDeleteReport, carrierSaveReport, type WorkReportInput } from "../lib/workReportEngine";
import {
  rpcCarrierAssignments,
  rpcCarrierDeleteReport,
  rpcCarrierReports,
  rpcCarrierSaveReport,
  type CarrierReportRow,
} from "./workReportRepository";
import { MOCK_BILLING_KEY, MOCK_REPORTS_KEY, readJson } from "./workReports";

export type CarrierReportInput = Pick<WorkReportInput, "id" | "project_id" | "task_id" | "report_date" | "hours" | "distance_km" | "waiting_hours" | "work_type" | "comment" | "report_start" | "report_end">;

interface MockProjectLike {
  id: string;
  org_id: string;
  project_number: string;
  name: string;
  status: string;
  supplier_id: string | null;
  supplier_ids?: string[];
  planned_loading_date: string | null;
  planned_loading_time?: string | null;
  planned_delivery_date: string | null;
  planned_delivery_time?: string | null;
  special_requirements: string | null;
  carrier_order_number: string | null;
  locations?: { type: "lastning" | "lossning" | "mellanpunkt"; name: string; address: string | null; company_name?: string | null; contact_name?: string | null; contact_phone?: string | null; order_index: number }[];
  cargo_items?: { description: string; length_m: number | null; width_m: number | null; height_m: number | null; weight_ton: number | null; quantity: number | null }[];
}

function mockAssignments(carrier: CarrierUser): CarrierAssignment[] {
  const stored = readJson<MockProjectLike[] | null>("jk-mock-projects", null);
  const source = (stored ?? (mockProjects as unknown as MockProjectLike[])).filter((p) => p.org_id === carrier.org_id);
  return source
    .filter((p) => (p.supplier_ids ?? []).includes(carrier.supplier_id) || p.supplier_id === carrier.supplier_id)
    .filter((p) => !["Avbokad", "Fakturerad"].includes(p.status))
    .map((p) => ({
      id: p.id,
      project_number: p.project_number,
      name: p.name,
      status: p.status,
      planned_loading_date: p.planned_loading_date,
      planned_loading_time: p.planned_loading_time ?? null,
      planned_delivery_date: p.planned_delivery_date,
      planned_delivery_time: p.planned_delivery_time ?? null,
      special_requirements: p.special_requirements,
      carrier_order_number: p.carrier_order_number,
      locations: [...(p.locations ?? [])]
        .sort((a, b) => a.order_index - b.order_index)
        .map((l) => ({ type: l.type, name: l.name, address: l.address, company_name: l.company_name ?? null, contact_name: l.contact_name ?? null, contact_phone: l.contact_phone ?? null })),
      cargo: (p.cargo_items ?? []).map((c) => ({ description: c.description, length_m: c.length_m, width_m: c.width_m, height_m: c.height_m, weight_ton: c.weight_ton, quantity: c.quantity })),
    }));
}

function mockReports(carrier: CarrierUser): CarrierReportRow[] {
  const reports = readJson<WorkReport[]>(MOCK_REPORTS_KEY, []);
  const billings = readJson<WorkReportBilling[]>(MOCK_BILLING_KEY, []);
  return reports
    .filter((r) => r.performer_carrier_user_id === carrier.id)
    .sort((a, b) => (a.report_date < b.report_date ? 1 : -1))
    .map((r) => {
      const b = billings.find((x) => x.report_id === r.id);
      return {
        id: r.id,
        project_id: r.project_id,
        task_id: r.task_id,
        report_date: r.report_date,
        report_start: r.report_start ?? null,
        report_end: r.report_end ?? null,
        hours: r.hours,
        distance_km: r.distance_km,
        waiting_hours: r.waiting_hours,
        work_type: r.work_type,
        comment: r.comment,
        created_at: r.created_at,
        locked: Boolean(b?.invoiced_at || b?.adjusted_at),
      };
    });
}

export async function loadCarrierData(carrier: CarrierUser) {
  if (isSupabaseConfigured) {
    const [assignments, reports] = await Promise.all([rpcCarrierAssignments(), rpcCarrierReports()]);
    return { assignments, reports };
  }
  return { assignments: mockAssignments(carrier), reports: mockReports(carrier) };
}

function actorOf(carrier: CarrierUser) {
  return { id: carrier.id, orgId: carrier.org_id, supplierId: carrier.supplier_id, fullName: carrier.full_name };
}

export async function saveCarrierReport(carrier: CarrierUser, input: CarrierReportInput) {
  if (isSupabaseConfigured) {
    await rpcCarrierSaveReport(input);
    return;
  }
  const reports = readJson<WorkReport[]>(MOCK_REPORTS_KEY, []);
  const billings = readJson<WorkReportBilling[]>(MOCK_BILLING_KEY, []);
  const assignedProjectIds = mockAssignments(carrier).map((a) => a.id);
  const next = carrierSaveReport({ reports, billings, assignedProjectIds, today: localDateKey(new Date()) }, actorOf(carrier), input);
  window.localStorage.setItem(MOCK_REPORTS_KEY, JSON.stringify(next));
}

export async function deleteCarrierReport(carrier: CarrierUser, id: string) {
  if (isSupabaseConfigured) {
    await rpcCarrierDeleteReport(id);
    return;
  }
  const reports = readJson<WorkReport[]>(MOCK_REPORTS_KEY, []);
  const billings = readJson<WorkReportBilling[]>(MOCK_BILLING_KEY, []);
  window.localStorage.setItem(MOCK_REPORTS_KEY, JSON.stringify(carrierDeleteReport({ reports, billings }, actorOf(carrier), id)));
}
