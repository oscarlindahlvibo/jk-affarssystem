import { describe, expect, it } from "vitest";
import * as XLSX from "xlsx";
import { adapterById, csvAdapter, jsonAdapter, xlsxAdapter } from "./adapters";
import { csvCell, minutesToHours, sha256Hex, swedishDecimal } from "./format";
import { buildExportLines, exportInput } from "./lines";
import { computeEmployeePayroll, internalTimeTypes, normalizeRules, validateRules } from "../payrollCompute";
import type { PayrollAdjustment, PayrollCodeMapping, PayrollPeriod, PayrollStatement } from "../../types";
import { zonedTimeToUtc } from "../stockholmTime";

const period: PayrollPeriod = { id: "p1", org_id: "o", name: "Oktober 2026", start_date: "2026-10-01", end_date: "2026-10-31" };
const statement = (over: Partial<PayrollStatement> = {}): PayrollStatement => ({
  id: "s1", org_id: "o", period_id: "p1", user_id: "u1", status: "reviewed",
  totals: { workedMinutes: 10000, ordinaryMinutes: 9600, overtime: { overtime_1: 120, overtime_2: 30 }, absence: { absence_sick: 480 } },
  days: [], rule_snapshot: {}, submitted_at: null, attested_at: "x", attested_by: "pl", reviewed_at: "x", reviewed_by: "eko", exported_at: null, last_export_id: null, pending_adjustment: false, ...over,
});
const mapping = (time_type: string, external_code: string): PayrollCodeMapping => ({ id: time_type, org_id: "o", time_type, external_code, label: time_type });
const employees = new Map([["u1", { userId: "u1", name: "Åsa Öberg", employmentNumber: "1001", externalRef: "S-17" }]]);
const ruleSets = [{ id: "r", org_id: "o", name: "Std", active: true, approved_at: "2026-01-01T00:00:00Z", approved_by: "u", approval_note: "test", config: { version: 1, tiers: [{ key: "overtime_1", label: "Övertid 1", upToMinutes: 120 }, { key: "overtime_2", label: "Övertid 2", upToMinutes: null }] } }];

describe("exportformat", () => {
  it("formaterar svenska decimaler och minuter till timmar", () => {
    expect(swedishDecimal(9.5)).toBe("9,50");
    expect(swedishDecimal(minutesToHours(100))).toBe("1,67");
    expect(swedishDecimal(1234.5, 1)).toBe("1234,5");
  });

  it("skyddar CSV-celler mot citat, semikolon, radbrytning och formelinjektion", () => {
    expect(csvCell('Säger "hej"; ok')).toBe('"Säger ""hej""; ok"');
    expect(csvCell("rad1\nrad2")).toBe('"rad1\nrad2"');
    expect(csvCell("=HYPERLINK(\"x\")")).toBe('"\'=HYPERLINK(""x"")"');
    expect(csvCell("-5,5")).toBe("-5,5");
    expect(csvCell(null)).toBe("");
  });

  it("ger samma kontrollsumma för samma innehåll och olika för ändrat innehåll", async () => {
    expect(await sha256Hex("a")).toBe(await sha256Hex("a"));
    expect(await sha256Hex("a")).not.toBe(await sha256Hex("b"));
  });
});

describe("exportrader och adaptrar", () => {
  const mappings = [mapping("ordinary", "100"), mapping("overtime_1", "210"), mapping("absence_sick", "300")];
  const built = buildExportLines({ period, statements: [statement()], adjustments: [], mappings, ruleSets, employees, includePeriodLines: true });

  it("använder bara lönekoder från JK:s mappning och varnar för saknade", () => {
    expect(built.lines.map((l) => [l.timeType, l.externalCode, l.minutes])).toEqual([
      ["absence_sick", "300", 480], ["ordinary", "100", 9600], ["overtime_1", "210", 120], ["overtime_2", null, 30],
    ]);
    expect(built.warnings).toEqual(['Lönekod saknas för "Övertid 2". Ställ in den under Inställningar → Lön innan filen används.']);
  });

  it("CSV har BOM, semikolon, svenska decimaler och rätt rader", () => {
    const out = csvAdapter.build(exportInput(period, built.lines, "regular", "2026-11-02T10:00:00Z"));
    const text = out.content as string;
    expect(text.startsWith("﻿Anställningsnr;")).toBe(true);
    const rows = text.trim().split("\r\n");
    expect(rows).toHaveLength(5);
    expect(rows[2]).toContain("Åsa Öberg");
    expect(rows[2]).toContain(";160,00;9600;");
    expect(out.fileName).toBe("loneunderlag-oktober-2026-2026-11-02.csv");
    expect(out.rowCount).toBe(4);
    expect(out.warnings).toHaveLength(1);
  });

  it("XLSX innehåller riktiga tal, ett blad för period och ett för rättelser", () => {
    const adj: PayrollAdjustment[] = [{ id: "a", org_id: "o", statement_id: "s1", user_id: "u1", time_type: "overtime_1", minutes_delta: 30, reason: "Glömd tid", created_by: "eko", created_at: "x", export_id: null }];
    const withAdj = buildExportLines({ period, statements: [statement({ status: "exported" })], adjustments: adj, mappings, ruleSets, employees, includePeriodLines: true });
    const out = xlsxAdapter.build(exportInput(period, withAdj.lines, "regular", "2026-11-02T10:00:00Z"));
    const book = XLSX.read(out.content as Uint8Array, { type: "array" });
    expect(book.SheetNames).toEqual(["Löneunderlag", "Rättelser"]);
    const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(book.Sheets["Löneunderlag"]);
    expect(rows.find((r) => r.Tidstyp === "Ordinarie arbetstid")!.Timmar).toBe(160);
    expect(typeof rows[0].Timmar).toBe("number");
    const adjustmentRows = XLSX.utils.sheet_to_json<Record<string, unknown>>(book.Sheets["Rättelser"]);
    expect(adjustmentRows[0]).toMatchObject({ Minuter: 30, "Orsak till rättelse": "Glömd tid" });
  });

  it("korrigeringsexport innehåller bara rättelserna och markerar dem som rättelse", () => {
    const adj: PayrollAdjustment[] = [{ id: "a", org_id: "o", statement_id: "s1", user_id: "u1", time_type: "ordinary", minutes_delta: -60, reason: "Fel starttid", created_by: "eko", created_at: "x", export_id: null }];
    const only = buildExportLines({ period, statements: [statement({ status: "exported" })], adjustments: adj, mappings, ruleSets, employees, includePeriodLines: false });
    const out = csvAdapter.build(exportInput(period, only.lines, "correction", "2026-11-05T10:00:00Z"));
    const rows = (out.content as string).trim().split("\r\n");
    expect(rows).toHaveLength(2);
    expect(rows[1]).toContain("-1,00");
    expect(rows[1]).toContain("Rättelse");
    expect(rows[1]).toContain("Fel starttid");
    expect(out.fileName).toContain("rattelse");
  });

  it("JSON är maskinläsbart med decimalpunkt och skiljer period- och rättelseposter", () => {
    const out = jsonAdapter.build(exportInput(period, built.lines, "regular", "2026-11-02T10:00:00Z"));
    const parsed = JSON.parse(out.content as string);
    expect(parsed.schema).toBe("jk.payroll-basis.v1");
    expect(parsed.period).toEqual({ id: "p1", name: "Oktober 2026", start: "2026-10-01", end: "2026-10-31" });
    expect(parsed.lines.find((l: { timeType: string }) => l.timeType === "ordinary").hours).toBe(160);
    expect(parsed.lines[0].employee.externalRef).toBe("S-17");
  });

  it("det finns ingen Spiris-adapter eftersom stöd inte verifierats", () => {
    expect(() => adapterById("spiris")).toThrow("Okänt exportformat");
    expect([csvAdapter, xlsxAdapter, jsonAdapter].every((a) => a.verifiedForSystem === null)).toBe(true);
  });
});

describe("regler och beräkning från databasrader", () => {
  it("normaliserar sparad konfiguration med standardvärden och validerar nivåer", () => {
    const rules = normalizeRules({ version: 1, tiers: [{ key: "a", label: "A", upToMinutes: 120 }, { key: "b", label: "B", upToMinutes: 60 }] });
    expect(rules.dayBucketing).toBe("start_day");
    expect(validateRules(rules)).toContain('Nivå "B" måste ha högre gräns än föregående nivå.');
    expect(validateRules(normalizeRules({ tiers: [{ key: "a", label: "A", upToMinutes: null }, { key: "b", label: "B", upToMinutes: null }] }))[0]).toContain("Endast sista nivån");
    expect(validateRules(normalizeRules(null))).toEqual([]);
  });

  it("listar tidstyper från regeluppsättningar för lönekodsmappning", () => {
    const keys = internalTimeTypes(ruleSets).map((t) => t.key);
    expect(keys).toEqual(expect.arrayContaining(["ordinary", "overtime_1", "overtime_2", "absence_sick"]));
  });

  it("räknar en anställd från databasrader med schemaversion och regeluppsättning", () => {
    const at = (d: string, t: string) => zonedTimeToUtc(d, t).toISOString();
    const result = computeEmployeePayroll({
      userId: "u1", periodStart: "2026-10-12", periodEnd: "2026-10-18",
      entries: [{ id: "e", org_id: "o", user_id: "u1", entry_type: "work", start_time: at("2026-10-12", "07:00"), end_time: at("2026-10-12", "17:00"), total_minutes: 600, source: "clock", comment: "", created_by: null, created_at: "", updated_at: "", edited_by: null, edited_at: null }],
      absences: [],
      terms: [{ id: "t", org_id: "o", user_id: "u1", valid_from: "2026-01-01", employment_number: null, employment_type: null, weekly_hours: 40, employment_rate: 100, schedule: { mon: 480, tue: 480, wed: 480, thu: 480, fri: 480, sat: 0, sun: 0 }, rule_set_id: "r", external_employee_ref: null, note: null }],
      ruleSets,
    });
    expect(result.hasTerms).toBe(true);
    expect(result.totals.ordinaryMinutes).toBe(480);
    expect(result.totals.overtime).toEqual({ overtime_1: 120 });
  });
});
