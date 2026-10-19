import { describe, expect, it } from "vitest";
import { computeEmployeePayroll, normalizeRules, payrollBlockers, validateRules } from "./payrollCompute";
import { DEFAULT_OVERTIME_RULES } from "./payrollRules";
import type { AttendanceEntry, EmployeeTermsRow, OvertimeRuleSetRow } from "../types";

const entry = (id: string, start: string, end: string | null): AttendanceEntry => ({
  id, org_id: "o", user_id: "u", entry_type: "work", start_time: start, end_time: end, total_minutes: 0, source: "clock", comment: "",
  created_by: "u", created_at: start, updated_at: start, edited_by: null, edited_at: null,
});
const rule = (approved: boolean): OvertimeRuleSetRow => ({
  id: "rs", org_id: "o", name: "Mall", config: DEFAULT_OVERTIME_RULES as unknown as Record<string, unknown>, active: true,
  approved_at: approved ? "2026-01-01T00:00:00Z" : null, approved_by: approved ? "a" : null, approval_note: approved ? "avtal" : null,
});
const terms = (valid_from: string, rule_set_id: string | null = "rs"): EmployeeTermsRow => ({
  id: `t-${valid_from}`, org_id: "o", user_id: "u", valid_from, employment_number: null, employment_type: null, weekly_hours: 40, employment_rate: 100,
  schedule: { mon: 480, tue: 480, wed: 480, thu: 480, fri: 480, sat: 0, sun: 0 }, rule_set_id, external_employee_ref: null, note: null,
});

const compute = (termRows: EmployeeTermsRow[], ruleSets: OvertimeRuleSetRow[], entries: AttendanceEntry[]) => {
  const result = computeEmployeePayroll({ userId: "u", periodStart: "2026-10-01", periodEnd: "2026-10-31", entries, absences: [], terms: termRows, ruleSets });
  return { result, blockers: payrollBlockers({ userId: "u", result, terms: termRows, ruleSets }) };
};
const day = [entry("e1", "2026-10-14T05:00:00Z", "2026-10-14T13:00:00Z")];

describe("spärrar mot opålitligt underlag", () => {
  it("godkänd regelmall och schema ger inga spärrar", () => {
    expect(compute([terms("2026-01-01")], [rule(true)], day).blockers).toEqual([]);
  });

  it("exempelregler som inte godkänts blockerar attest", () => {
    const { blockers } = compute([terms("2026-01-01")], [rule(false)], day);
    expect(blockers.join(" ")).toContain("inte godkänd");
  });

  it("saknat schema, saknad regelmall och pågående stämpling blockerar", () => {
    expect(compute([], [rule(true)], day).blockers.join(" ")).toContain("Schema och regler saknas");
    expect(compute([terms("2026-01-01", null)], [rule(true)], day).blockers.join(" ")).toContain("Regelmall saknas");
    expect(compute([terms("2026-01-01")], [rule(true)], [entry("open", "2026-10-14T05:00:00Z", null)]).blockers.join(" ")).toContain("pågående");
  });

  it("schema som börjar gälla mitt i perioden: dagar före saknar schema och blockerar", () => {
    const early = [entry("e0", "2026-10-02T05:00:00Z", "2026-10-02T13:00:00Z")];
    expect(compute([terms("2026-10-10")], [rule(true)], early).blockers.join(" ")).toContain("2026-10-02");
  });

  it("dagar utan arbete eller frånvaro kräver inget schema", () => {
    expect(compute([terms("2026-10-10")], [rule(true)], [entry("e", "2026-10-14T05:00:00Z", "2026-10-14T13:00:00Z")]).blockers).toEqual([]);
  });
});

describe("regelvalidering", () => {
  it("kräver minst en övertidsnivå, stigande gränser och endast sista obegränsad", () => {
    expect(validateRules({ ...normalizeRules(null), tiers: [] })).toContain("Minst en övertidsnivå krävs.");
    expect(validateRules({ ...normalizeRules(null), tiers: [{ key: "a", label: "A", upToMinutes: 120 }, { key: "b", label: "B", upToMinutes: 60 }] }).length).toBeGreaterThan(0);
    expect(validateRules({ ...normalizeRules(null), tiers: [{ key: "a", label: "A", upToMinutes: null }, { key: "b", label: "B", upToMinutes: null }] }).length).toBeGreaterThan(0);
    expect(validateRules(normalizeRules(null))).toEqual([]);
  });
});
