import { describe, expect, it } from "vitest";
import { alreadyInvoiced, buildInvoiceBasis, formatMoney, kmToMil, milToKm, resolveRates, reportHasContent } from "./billing";
import type { BillingRate, WorkReport, WorkReportBilling } from "../types";

function report(partial: Partial<WorkReport> & { id: string }): WorkReport {
  return {
    org_id: "o",
    project_id: "p",
    task_id: null,
    report_date: "2026-10-12",
    performer_type: "employee",
    performer_profile_id: "u",
    performer_carrier_user_id: null,
    performer_supplier_id: null,
    performer_name: "Anna",
    hours: null,
    distance_km: null,
    waiting_hours: null,
    work_type: "transport",
    billable: true,
    comment: "",
    created_by: "u",
    created_at: "",
    updated_at: "",
    edited_by: null,
    edited_at: null,
    ...partial,
  };
}

const rate = (rate_type: BillingRate["rate_type"], unit_price: number, scope: "project" | "customer" = "project"): BillingRate => ({
  id: `${scope}-${rate_type}`,
  org_id: "o",
  customer_id: scope === "customer" ? "c" : null,
  project_id: scope === "project" ? "p" : null,
  rate_type,
  unit_price,
});

const billing = (report_id: string, patch: Partial<WorkReportBilling> = {}): WorkReportBilling => ({
  report_id,
  org_id: "o",
  billable_hours: null,
  billable_distance_km: null,
  billable_waiting_hours: null,
  hours_rate: null,
  distance_rate: null,
  waiting_rate: null,
  adjust_reason: null,
  adjusted_by: null,
  adjusted_at: null,
  invoiced_at: null,
  invoiced_by: null,
  invoice_reference: null,
  ...patch,
});

describe("fakturaunderlag", () => {
  const rates = resolveRates([rate("hours", 950), rate("distance", 110), rate("waiting", 650)], []);

  it("räknar exemplet i specifikationen: 4,5 h, 18 mil och 1 h väntetid = 6 905 kr", () => {
    const basis = buildInvoiceBasis([report({ id: "1", hours: 4.5, distance_km: 180, waiting_hours: 1 })], [], rates);
    expect(basis.lines.map((line) => [line.label, line.quantity, line.unit, line.unitPrice, line.amount])).toEqual([
      ["Transportarbete", 4.5, "h", 950, 4275],
      ["Körsträcka", 18, "mil", 110, 1980],
      ["Väntetid", 1, "h", 650, 650],
    ]);
    expect(basis.total).toBe(6905);
  });

  it("summerar flera rapporter och tillåter rapporter med bara väntetid eller bara körsträcka", () => {
    const basis = buildInvoiceBasis(
      [report({ id: "1", hours: 2 }), report({ id: "2", waiting_hours: 0.5 }), report({ id: "3", distance_km: 45 })],
      [],
      rates
    );
    expect(basis.lines.find((l) => l.kind === "hours")!.quantity).toBe(2);
    expect(basis.lines.find((l) => l.kind === "waiting")!.quantity).toBe(0.5);
    expect(basis.lines.find((l) => l.kind === "distance")!.quantity).toBe(4.5);
    expect(basis.total).toBe(1900 + 325 + 495);
  });

  it("ändrar fakturerbara mängder och priser utan att ändra den ursprungliga rapporten", () => {
    const original = report({ id: "1", hours: 5, distance_km: 100 });
    const adjusted = billing("1", { billable_hours: 4, hours_rate: 900 });
    const basis = buildInvoiceBasis([original], [adjusted], rates);
    expect(basis.lines.find((l) => l.kind === "hours")).toMatchObject({ quantity: 4, unitPrice: 900, amount: 3600 });
    expect(basis.lines.find((l) => l.kind === "distance")).toMatchObject({ quantity: 10, amount: 1100 });
    expect(original.hours).toBe(5);
  });

  it("tar inte med icke debiterbara rapporter men behåller dem i rapporteringen", () => {
    const basis = buildInvoiceBasis([report({ id: "1", hours: 3, billable: false }), report({ id: "2", hours: 1 })], [], rates);
    expect(basis.lines.find((l) => l.kind === "hours")!.quantity).toBe(1);
  });

  it("använder projektets pris före kundens och varnar när pris saknas", () => {
    const resolved = resolveRates([rate("hours", 900)], [rate("hours", 800, "customer"), rate("waiting", 500, "customer")]);
    expect(resolved.hours).toEqual({ price: 900, source: "project" });
    expect(resolved.waiting).toEqual({ price: 500, source: "customer" });
    expect(resolved.distance).toBeNull();
    const basis = buildInvoiceBasis([report({ id: "1", distance_km: 100 })], [], resolved);
    expect(basis.warnings).toContain("Pris saknas för körsträcka.");
    expect(basis.total).toBe(0);
  });

  it("skiljer fakturerade från ej fakturerade poster och föreslår aldrig dubbeldebitering", () => {
    const reports = [report({ id: "1", hours: 2 }), report({ id: "2", hours: 3 })];
    const billings = [billing("1", { invoiced_at: "2026-10-31T10:00:00Z", invoice_reference: "F-1001" })];
    const basis = buildInvoiceBasis(reports, billings, rates);
    expect(basis.invoicedTotal).toBe(1900);
    expect(basis.uninvoicedTotal).toBe(2850);
    expect(alreadyInvoiced(["1", "2"], billings)).toEqual(["1"]);
  });

  it("lägger till övriga debiteringsposter", () => {
    const basis = buildInvoiceBasis([], [], rates, [
      { id: "e1", org_id: "o", project_id: "p", description: "Broavgift", quantity: 2, unit: "st", unit_price: 250, invoiced_at: null, invoice_reference: null, created_at: "" },
    ]);
    expect(basis.lines).toHaveLength(1);
    expect(basis.total).toBe(500);
  });

  it("konverterar mellan kilometer och mil och kräver minst ett mätvärde", () => {
    expect(kmToMil(180)).toBe(18);
    expect(milToKm(1.5)).toBe(15);
    expect(reportHasContent({ hours: null, distance_km: null, waiting_hours: 0.25 })).toBe(true);
    expect(reportHasContent({ hours: 0, distance_km: null, waiting_hours: null })).toBe(false);
  });
});

describe("pengaformat och decimaler", () => {
  it("visar öre när beloppet inte är jämnt och rundar till två decimaler", () => {
    expect(formatMoney(5100)).toMatch(/^5\s100 kr$/);
    expect(formatMoney(3827.25)).toMatch(/^3\s827,25 kr$/);
    expect(formatMoney(0.1 + 0.2)).toBe("0,3 kr".replace("0,3", "0,30"));
  });
  it("kilometer blir mil med decimaler och räknas med projektpris före kundpris", () => {
    expect(kmToMil(183)).toBeCloseTo(18.3, 5);
    const rates = resolveRates([{ id: "p", org_id: "o", customer_id: null, project_id: "x", rate_type: "hours", unit_price: 900 }], [{ id: "c", org_id: "o", customer_id: "k", project_id: null, rate_type: "hours", unit_price: 800 }]);
    expect(rates.hours).toEqual({ price: 900, source: "project" });
  });
});
