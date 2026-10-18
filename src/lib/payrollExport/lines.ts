import type { PayrollAdjustment, PayrollCodeMapping, PayrollPeriod, PayrollStatement } from "../../types";
import { internalTimeTypes } from "../payrollCompute";
import type { ExportEmployee, ExportInput, ExportLine } from "./types";
import type { OvertimeRuleSetRow } from "../../types";

interface TotalsShape {
  ordinaryMinutes?: number;
  overtime?: Record<string, number>;
  absence?: Record<string, number>;
}

export interface BuildLinesArgs {
  period: PayrollPeriod;
  statements: PayrollStatement[];
  adjustments: PayrollAdjustment[];
  mappings: PayrollCodeMapping[];
  ruleSets: OvertimeRuleSetRow[];
  employees: Map<string, ExportEmployee>;
  // Endast rättelser utan tidigare export tas med i en korrigeringsexport.
  includePeriodLines: boolean;
}

// Bygger exportrader från attesterade underlag. Lönekoder hämtas bara från JK:s egen mappning.
export function buildExportLines(args: BuildLinesArgs): { lines: ExportLine[]; warnings: string[] } {
  const types = new Map(internalTimeTypes(args.ruleSets).map((t) => [t.key, t.label]));
  const codeFor = new Map(args.mappings.map((m) => [m.time_type, m.external_code.trim()]));
  const unmapped = new Set<string>();
  const lines: ExportLine[] = [];
  const employeeFor = (userId: string): ExportEmployee => args.employees.get(userId) ?? { userId, name: userId, employmentNumber: null, externalRef: null };
  const add = (userId: string, type: string, minutes: number, kind: ExportLine["kind"], status: string, reason: string | null) => {
    if (minutes === 0) return;
    const code = codeFor.get(type) || null;
    if (!code) unmapped.add(types.get(type) ?? type);
    lines.push({ employee: employeeFor(userId), date: null, timeType: type, label: types.get(type) ?? type, externalCode: code, minutes, status, kind, reason });
  };

  if (args.includePeriodLines) {
    for (const statement of args.statements) {
      const totals = (statement.totals ?? {}) as TotalsShape;
      add(statement.user_id, "ordinary", totals.ordinaryMinutes ?? 0, "period", statement.status, null);
      for (const [key, minutes] of Object.entries(totals.overtime ?? {})) add(statement.user_id, key, minutes, "period", statement.status, null);
      for (const [key, minutes] of Object.entries(totals.absence ?? {})) add(statement.user_id, key, minutes, "period", statement.status, null);
    }
  }
  for (const adjustment of args.adjustments) add(adjustment.user_id, adjustment.time_type, adjustment.minutes_delta, "adjustment", "rättelse", adjustment.reason);

  lines.sort((a, b) => a.employee.name.localeCompare(b.employee.name, "sv") || a.kind.localeCompare(b.kind) || a.timeType.localeCompare(b.timeType));
  const warnings = [...unmapped].map((label) => `Lönekod saknas för "${label}". Ställ in den under Inställningar → Lön innan filen används.`);
  return { lines, warnings };
}

export function exportInput(period: PayrollPeriod, lines: ExportLine[], kind: ExportInput["exportKind"], exportedAt = new Date().toISOString()): ExportInput {
  return { period: { id: period.id, name: period.name, start_date: period.start_date, end_date: period.end_date }, lines, exportedAt, exportKind: kind };
}
