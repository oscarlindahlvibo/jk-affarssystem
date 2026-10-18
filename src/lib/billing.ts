// Fakturaunderlag för rapporterat arbete. Kundens debiterade mängder är helt skilda från den
// anställdes lönegrundande arbetstid och påverkar den aldrig.
import type { BillingExtraLine, BillingRate, BillingRateType, WorkReport, WorkReportBilling } from "../types";

export const KM_PER_MIL = 10;

export const kmToMil = (km: number) => km / KM_PER_MIL;
export const milToKm = (mil: number) => mil * KM_PER_MIL;

export function round2(value: number) {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

export function formatDecimal(value: number, digits = 2) {
  return value.toLocaleString("sv-SE", { minimumFractionDigits: 0, maximumFractionDigits: digits });
}

export function formatMoney(value: number) {
  return `${Math.round(value).toLocaleString("sv-SE")} kr`;
}

export interface ResolvedRates {
  hours: { price: number; source: "project" | "customer" } | null;
  distance: { price: number; source: "project" | "customer" } | null;
  waiting: { price: number; source: "project" | "customer" } | null;
}

// Priset hämtas från projektet i första hand, annars från kundavtalet.
export function resolveRates(projectRates: BillingRate[], customerRates: BillingRate[]): ResolvedRates {
  const pick = (type: BillingRateType): ResolvedRates["hours"] => {
    const project = projectRates.find((rate) => rate.rate_type === type);
    if (project) return { price: project.unit_price, source: "project" };
    const customer = customerRates.find((rate) => rate.rate_type === type);
    return customer ? { price: customer.unit_price, source: "customer" } : null;
  };
  return { hours: pick("hours"), distance: pick("distance"), waiting: pick("waiting") };
}

export type BasisLineKind = "hours" | "distance" | "waiting" | "extra";

export interface BasisLine {
  key: string;
  kind: BasisLineKind;
  label: string;
  quantity: number;
  unit: string;
  unitPrice: number | null;
  amount: number;
  reportIds: string[];
  extraLineIds: string[];
  invoiced: boolean;
}

export interface InvoiceBasis {
  lines: BasisLine[];
  total: number;
  uninvoicedTotal: number;
  invoicedTotal: number;
  warnings: string[];
}

const LABELS: Record<Exclude<BasisLineKind, "extra">, { label: string; unit: string }> = {
  hours: { label: "Transportarbete", unit: "h" },
  distance: { label: "Körsträcka", unit: "mil" },
  waiting: { label: "Väntetid", unit: "h" },
};

interface Contribution {
  kind: Exclude<BasisLineKind, "extra">;
  quantity: number;
  price: number | null;
  reportId: string;
  invoiced: boolean;
}

export function billableQuantities(report: WorkReport, billing?: WorkReportBilling | null) {
  return {
    hours: billing?.billable_hours ?? report.hours ?? 0,
    distanceKm: billing?.billable_distance_km ?? report.distance_km ?? 0,
    waiting: billing?.billable_waiting_hours ?? report.waiting_hours ?? 0,
  };
}

export function buildInvoiceBasis(
  reports: WorkReport[],
  billings: WorkReportBilling[],
  rates: ResolvedRates,
  extraLines: BillingExtraLine[] = []
): InvoiceBasis {
  const billingByReport = new Map(billings.map((billing) => [billing.report_id, billing]));
  const contributions: Contribution[] = [];
  const warnings = new Set<string>();

  for (const report of reports) {
    if (!report.billable) continue;
    const billing = billingByReport.get(report.id);
    const quantities = billableQuantities(report, billing);
    const invoiced = Boolean(billing?.invoiced_at);
    const entries: [Contribution["kind"], number, number | null][] = [
      ["hours", quantities.hours, billing?.hours_rate ?? rates.hours?.price ?? null],
      ["distance", kmToMil(quantities.distanceKm), billing?.distance_rate ?? rates.distance?.price ?? null],
      ["waiting", quantities.waiting, billing?.waiting_rate ?? rates.waiting?.price ?? null],
    ];
    for (const [kind, quantity, price] of entries) {
      if (quantity <= 0) continue;
      if (price === null) warnings.add(`Pris saknas för ${LABELS[kind].label.toLowerCase()}.`);
      contributions.push({ kind, quantity, price, reportId: report.id, invoiced });
    }
  }

  const grouped = new Map<string, BasisLine>();
  for (const item of contributions) {
    const key = `${item.kind}|${item.price ?? "saknas"}|${item.invoiced ? "fakturerad" : "ej"}`;
    const line = grouped.get(key) ?? {
      key,
      kind: item.kind,
      label: LABELS[item.kind].label,
      quantity: 0,
      unit: LABELS[item.kind].unit,
      unitPrice: item.price,
      amount: 0,
      reportIds: [],
      extraLineIds: [],
      invoiced: item.invoiced,
    };
    line.quantity += item.quantity;
    line.reportIds.push(item.reportId);
    grouped.set(key, line);
  }
  for (const line of grouped.values()) {
    line.quantity = round2(line.quantity);
    line.amount = line.unitPrice === null ? 0 : round2(line.quantity * line.unitPrice);
  }
  for (const extra of extraLines) {
    grouped.set(`extra|${extra.id}`, {
      key: `extra|${extra.id}`,
      kind: "extra",
      label: extra.description,
      quantity: extra.quantity,
      unit: extra.unit,
      unitPrice: extra.unit_price,
      amount: round2(extra.quantity * extra.unit_price),
      reportIds: [],
      extraLineIds: [extra.id],
      invoiced: Boolean(extra.invoiced_at),
    });
  }

  const order: Record<BasisLineKind, number> = { hours: 0, distance: 1, waiting: 2, extra: 3 };
  const lines = [...grouped.values()].sort((a, b) => order[a.kind] - order[b.kind] || Number(a.invoiced) - Number(b.invoiced));
  const total = round2(lines.reduce((sum, line) => sum + line.amount, 0));
  const invoicedTotal = round2(lines.filter((line) => line.invoiced).reduce((sum, line) => sum + line.amount, 0));
  return { lines, total, invoicedTotal, uninvoicedTotal: round2(total - invoicedTotal), warnings: [...warnings] };
}

// Förhindrar dubbeldebitering: returnerar de rapporter/rader som redan är fakturerade.
export function alreadyInvoiced(reportIds: string[], billings: WorkReportBilling[]): string[] {
  const invoiced = new Set(billings.filter((billing) => billing.invoiced_at).map((billing) => billing.report_id));
  return reportIds.filter((id) => invoiced.has(id));
}

export function reportHasContent(report: Pick<WorkReport, "hours" | "distance_km" | "waiting_hours">) {
  return (report.hours ?? 0) > 0 || (report.distance_km ?? 0) > 0 || (report.waiting_hours ?? 0) > 0;
}
