// Jespers kärnscenario: faktisk arbetstid (lön) och fakturerbar kundtid är två helt skilda saker.
// 10 timmar stämplat, men 6 + 5 + 4 = 15 fakturerbara timmar på tre projekt. Det är avsiktligt.
import { describe, expect, it } from "vitest";
import { addEntries, emptyAttendanceState, type Actor } from "./attendanceEngine";
import { alreadyInvoiced, buildInvoiceBasis, resolveRates } from "./billing";
import { computeEmployeePayroll } from "./payrollCompute";
import { DEFAULT_OVERTIME_RULES } from "./payrollRules";
import { zonedTimeToUtc } from "./stockholmTime";
import { saveInternalReport, type ReportActor, type ReportContext, type WorkReportInput } from "./workReportEngine";
import type { BillingRate, EmployeeTermsRow, OvertimeRuleSetRow, WorkReport, WorkReportBilling } from "../types";

const ORG = "o1";
const DAY = "2026-10-14"; // onsdag
const NOW = "2026-10-19T08:00:00Z";
const driver: Actor = { id: "u-anna", orgId: ORG, role: "lasare" };
const driver2: Actor = { id: "u-bo", orgId: ORG, role: "lasare" };
const asReporter = (actor: Actor, fullName: string): ReportActor => ({ id: actor.id, orgId: ORG, role: actor.role, fullName });

const ruleSets: OvertimeRuleSetRow[] = [{ id: "rs1", org_id: ORG, name: "Test", config: DEFAULT_OVERTIME_RULES as unknown as Record<string, unknown>, active: true, approved_at: '2026-01-01T00:00:00Z', approved_by: 'u', approval_note: 'test' }];
const terms = (userId: string): EmployeeTermsRow => ({
  id: `t-${userId}`, org_id: ORG, user_id: userId, valid_from: "2026-01-01", employment_number: null, employment_type: "tillsvidare", weekly_hours: 40, employment_rate: 100,
  schedule: { mon: 480, tue: 480, wed: 480, thu: 480, fri: 480, sat: 0, sun: 0 }, rule_set_id: "rs1", external_employee_ref: null, note: null,
});

const stamp = (actor: Actor, from: string, to: string) =>
  addEntries(emptyAttendanceState(), actor, [{ type: "work", start: zonedTimeToUtc(DAY, from).toISOString(), end: zonedTimeToUtc(DAY, to).toISOString() }], null, null, NOW);

const payrollFor = (userId: string, entries: ReturnType<typeof stamp>["entries"]) =>
  computeEmployeePayroll({ userId, periodStart: "2026-10-01", periodEnd: "2026-10-31", entries, absences: [], terms: [terms(userId)], ruleSets });

const ctxFor = (reports: WorkReport[] = [], billings: WorkReportBilling[] = []): ReportContext => ({
  reports, billings,
  projects: ["pA", "pB", "pC"].map((id) => ({ id, org_id: ORG })),
  profiles: [{ id: "u-anna", org_id: ORG, full_name: "Anna", status: "aktiv" }, { id: "u-bo", org_id: ORG, full_name: "Bo", status: "aktiv" }],
  suppliers: [], today: "2026-10-19",
});

const report = (id: string, project: string, hours: number): WorkReportInput => ({
  id, project_id: project, task_id: null, report_date: DAY, performer_type: "employee", performer_profile_id: null, performer_supplier_id: null,
  hours, distance_km: null, waiting_hours: null, work_type: "transport", billable: true, comment: "",
});

const hourRate = (unit_price: number): BillingRate => ({ id: "rate", org_id: ORG, customer_id: null, project_id: null, rate_type: "hours", unit_price });
const rates = resolveRates([], [hourRate(850)]);

function reportDay() {
  let reports: WorkReport[] = [];
  for (const [id, project, hours] of [["r-a", "pA", 6], ["r-b", "pB", 5], ["r-c", "pC", 4]] as const) {
    reports = saveInternalReport(ctxFor(reports), asReporter(driver, "Anna"), report(id, project, hours)).reports;
  }
  return reports;
}

const hoursOf = (reports: WorkReport[], project: string, billings: WorkReportBilling[] = []) =>
  buildInvoiceBasis(reports.filter((r) => r.project_id === project), billings, rates);

describe("10 arbetade timmar och 15 fakturerbara timmar", () => {
  const attendance = stamp(driver, "07:00", "17:00");
  const reports = reportDay();

  it("lönegrundande tid är 10 timmar, oberoende av vad som debiteras", () => {
    const payroll = payrollFor(driver.id, attendance.entries);
    expect(payroll.totals.workedMinutes).toBe(600);
    expect(payroll.totals.ordinaryMinutes).toBe(480);
    expect(Object.values(payroll.totals.overtime).reduce((a, b) => a + b, 0)).toBe(120);
  });

  it("de tre projekten får sina egna fakturerbara timmar och summan är 15 utan varning", () => {
    const bases = ["pA", "pB", "pC"].map((p) => hoursOf(reports, p));
    expect(bases.map((b) => b.lines[0].quantity)).toEqual([6, 5, 4]);
    expect(bases.map((b) => b.total)).toEqual([5100, 4250, 3400]);
    expect(bases.reduce((sum, b) => sum + b.lines[0].quantity, 0)).toBe(15);
    for (const basis of bases) expect(basis.warnings).toEqual([]);
  });

  it("det finns ingen spärr mot att fakturerbart överstiger arbetat: rapporterna sparas var för sig", () => {
    expect(reports.reduce((sum, r) => sum + (r.hours ?? 0), 0)).toBe(15);
    expect(() => saveInternalReport(ctxFor(reports), asReporter(driver, "Anna"), report("r-d", "pA", 3))).not.toThrow();
  });

  it("ändrad fakturerbar tid (4 → 6 h) ändrar fakturaunderlaget men varken rapporten eller lönen", () => {
    const before = payrollFor(driver.id, attendance.entries);
    const adjustment: WorkReportBilling = {
      report_id: "r-c", org_id: ORG, billable_hours: 6, billable_distance_km: null, billable_waiting_hours: null, hours_rate: null, distance_rate: null, waiting_rate: null,
      adjust_reason: "Väntade på lossning", adjusted_by: "u-pl", adjusted_at: NOW, invoiced_at: null, invoiced_by: null, invoice_reference: null,
    };
    const basisC = hoursOf(reports, "pC", [adjustment]);
    expect(basisC.lines[0].quantity).toBe(6);
    expect(basisC.total).toBe(5100);
    expect(reports.find((r) => r.id === "r-c")?.hours).toBe(4); // ursprungsrapporten bevaras
    expect(payrollFor(driver.id, attendance.entries)).toEqual(before);
    expect(hoursOf(reports, "pA").lines[0].quantity).toBe(6);
  });

  it("fakturerade rapporter debiteras inte igen", () => {
    const invoicedBilling: WorkReportBilling = {
      report_id: "r-a", org_id: ORG, billable_hours: null, billable_distance_km: null, billable_waiting_hours: null, hours_rate: null, distance_rate: null, waiting_rate: null,
      adjust_reason: null, adjusted_by: null, adjusted_at: null, invoiced_at: NOW, invoiced_by: "u-ek", invoice_reference: "F-100",
    };
    expect(alreadyInvoiced(["r-a", "r-b"], [invoicedBilling])).toEqual(["r-a"]);
    const basis = hoursOf(reports, "pA", [invoicedBilling]);
    expect(basis.uninvoicedTotal).toBe(0);
    expect(basis.invoicedTotal).toBe(5100);
    expect(() => saveInternalReport(ctxFor(reports, [invoicedBilling]), asReporter(driver, "Anna"), report("r-a", "pA", 7))).toThrow("fakturerad");
  });

  it("stämplad tid påverkas inte av att rapporter läggs till, ändras eller tas bort", () => {
    const withoutReports = payrollFor(driver.id, attendance.entries);
    const more = saveInternalReport(ctxFor(reports), asReporter(driver, "Anna"), report("r-x", "pB", 40)).reports;
    expect(more.length).toBe(4);
    expect(payrollFor(driver.id, attendance.entries)).toEqual(withoutReports);
  });
});

describe("flera chaufförer på samma transportorder", () => {
  it("varje chaufför får sin egen lön och projektet debiteras summan av rapporterna", () => {
    const annaTime = stamp(driver, "07:00", "17:00");
    const boTime = stamp(driver2, "08:00", "12:00");
    let reports: WorkReport[] = [];
    reports = saveInternalReport(ctxFor(reports), asReporter(driver, "Anna"), report("a1", "pA", 6)).reports;
    reports = saveInternalReport(ctxFor(reports), asReporter(driver2, "Bo"), report("b1", "pA", 3.5)).reports;

    expect(payrollFor(driver.id, annaTime.entries).totals.workedMinutes).toBe(600);
    expect(payrollFor(driver2.id, boTime.entries).totals.workedMinutes).toBe(240);
    expect(reports.find((r) => r.id === "b1")?.performer_name).toBe("Bo");

    const basis = hoursOf(reports, "pA");
    expect(basis.lines[0].quantity).toBe(9.5);
    expect(basis.total).toBe(8075);
    expect(basis.lines[0].reportIds.sort()).toEqual(["a1", "b1"]);
  });

  it("Bo kan inte ändra Annas rapport och en dubbelsparning med samma id skapar ingen dubblett", () => {
    let reports = saveInternalReport(ctxFor(), asReporter(driver, "Anna"), report("a1", "pA", 6)).reports;
    expect(() => saveInternalReport(ctxFor(reports), asReporter(driver2, "Bo"), report("a1", "pA", 9))).toThrow("egna");
    reports = saveInternalReport(ctxFor(reports), asReporter(driver, "Anna"), report("a1", "pA", 6)).reports;
    expect(reports.filter((r) => r.id === "a1")).toHaveLength(1);
  });
});
