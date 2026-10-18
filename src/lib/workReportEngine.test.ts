import { describe, expect, it } from "vitest";
import { carrierDeleteReport, carrierSaveReport, deleteInternalReport, saveInternalReport, type ReportActor, type ReportContext, type WorkReportInput } from "./workReportEngine";
import type { WorkReportBilling } from "../types";

const ctx = (over: Partial<ReportContext> = {}): ReportContext => ({
  reports: [],
  billings: [],
  projects: [{ id: "p1", org_id: "o1" }, { id: "p-other", org_id: "o2" }],
  profiles: [
    { id: "u-emp", org_id: "o1", full_name: "Lisa", status: "aktiv" },
    { id: "u-pl", org_id: "o1", full_name: "Petra", status: "aktiv" },
  ],
  suppliers: [{ id: "s1", org_id: "o1", company_name: "Transport AB" }],
  today: "2026-10-15",
  ...over,
});

const employee: ReportActor = { id: "u-emp", orgId: "o1", role: "lasare", fullName: "Lisa" };
const manager: ReportActor = { id: "u-pl", orgId: "o1", role: "projektledare", fullName: "Petra" };

const input = (patch: Partial<WorkReportInput> = {}): WorkReportInput => ({
  id: "r1",
  project_id: "p1",
  task_id: null,
  report_date: "2026-10-14",
  performer_type: "employee",
  performer_profile_id: null,
  performer_supplier_id: null,
  hours: 4.5,
  distance_km: 180,
  waiting_hours: 1,
  work_type: "transport",
  billable: true,
  comment: "",
  ...patch,
});

const invoiced = (report_id: string): WorkReportBilling => ({
  report_id, org_id: "o1", billable_hours: null, billable_distance_km: null, billable_waiting_hours: null,
  hours_rate: null, distance_rate: null, waiting_rate: null, adjust_reason: null, adjusted_by: null, adjusted_at: null,
  invoiced_at: "2026-10-30T10:00:00Z", invoiced_by: "x", invoice_reference: "F-1",
});

describe("intern rapportering", () => {
  it("sparar rapport för sig själv och tillåter enbart väntetid eller enbart körsträcka", () => {
    expect(saveInternalReport(ctx(), employee, input({ hours: null, distance_km: null, waiting_hours: 1.5 })).saved.performer_name).toBe("Lisa");
    expect(saveInternalReport(ctx(), employee, input({ hours: null, waiting_hours: null })).saved.distance_km).toBe(180);
  });

  it("nekar tom rapport, negativa värden, främmande projekt och datum långt fram", () => {
    expect(() => saveInternalReport(ctx(), employee, input({ hours: null, distance_km: null, waiting_hours: null }))).toThrow("minst");
    expect(() => saveInternalReport(ctx(), employee, input({ hours: -1 }))).toThrow("Ogiltigt");
    expect(() => saveInternalReport(ctx(), employee, input({ project_id: "p-other" }))).toThrow("Projektet");
    expect(() => saveInternalReport(ctx(), employee, input({ report_date: "2026-12-01" }))).toThrow("datum");
  });

  it("anställd kan inte rapportera åt annan eller för transportör, men ansvarig kan", () => {
    expect(() => saveInternalReport(ctx(), employee, input({ performer_profile_id: "u-pl" }))).toThrow("eget arbete");
    expect(() => saveInternalReport(ctx(), employee, input({ performer_type: "carrier", performer_supplier_id: "s1" }))).toThrow("ansvarig");
    const byManager = saveInternalReport(ctx(), manager, input({ performer_type: "carrier", performer_supplier_id: "s1", internal_cost: 3200 })).saved;
    expect(byManager.performer_name).toBe("Transport AB");
    expect(byManager.internal_cost).toBe(3200);
  });

  it("intern kostnad kan bara sättas av behörig roll", () => {
    expect(saveInternalReport(ctx(), employee, input({ internal_cost: 999 })).saved.internal_cost).toBeNull();
  });

  it("låser fakturerade rapporter för ändring och radering", () => {
    const first = saveInternalReport(ctx(), employee, input());
    const locked = ctx({ reports: first.reports, billings: [invoiced("r1")] });
    expect(() => saveInternalReport(locked, employee, input({ hours: 1 }))).toThrow("fakturerad");
    expect(() => deleteInternalReport(locked, manager, "r1")).toThrow("fakturerad");
  });

  it("anställd kan inte ändra eller ta bort annans rapport", () => {
    const first = saveInternalReport(ctx(), manager, input({ performer_profile_id: "u-emp" }));
    expect(() => saveInternalReport(ctx({ reports: first.reports }), employee, input({ hours: 9 }))).toThrow("egna");
    expect(() => deleteInternalReport(ctx({ reports: first.reports }), employee, "r1")).toThrow("egna");
  });
});

describe("transportörsrapportering", () => {
  const carrier = { id: "c1", orgId: "o1", supplierId: "s1", fullName: "Carl" };
  const base = { reports: [], billings: [], assignedProjectIds: ["p1"], today: "2026-10-15" };
  const rep = { id: "r1", project_id: "p1", task_id: null, report_date: "2026-10-14", hours: 6, distance_km: 240, waiting_hours: null, work_type: "transport", comment: "" };

  it("rapporterar endast på tilldelade uppdrag och blir rätt utförare", () => {
    const saved = carrierSaveReport(base, carrier, rep)[0];
    expect(saved.performer_type).toBe("carrier");
    expect(saved.performer_carrier_user_id).toBe("c1");
    expect(() => carrierSaveReport(base, carrier, { ...rep, project_id: "p2" })).toThrow("tilldelat");
  });

  it("kan ändra egen obehandlad rapport men inte efter att JK justerat eller fakturerat", () => {
    const reports = carrierSaveReport(base, carrier, rep);
    expect(carrierSaveReport({ ...base, reports }, carrier, { ...rep, hours: 7 })[0].hours).toBe(7);
    const adjusted = { ...invoiced("r1"), invoiced_at: null, adjusted_at: "2026-10-16T10:00:00Z" };
    expect(() => carrierSaveReport({ ...base, reports, billings: [adjusted] }, carrier, { ...rep, hours: 1 })).toThrow("behandlad");
    expect(() => carrierDeleteReport({ reports, billings: [invoiced("r1")] }, carrier, "r1")).toThrow("behandlad");
  });

  it("annan transportör kan inte ändra eller ta bort rapporten", () => {
    const reports = carrierSaveReport(base, carrier, rep);
    const other = { ...carrier, id: "c2" };
    expect(() => carrierSaveReport({ ...base, reports }, other, rep)).toThrow("egna");
    expect(() => carrierDeleteReport({ reports, billings: [] }, other, "r1")).toThrow("hittades inte");
  });
});
