// Kopplar databasrader (närvaro, frånvaro, scheman, regler) till löneberäkningen.
import type { AttendanceAbsence, AttendanceEntry, EmployeeTermsRow, OvertimeRuleSetRow } from "../types";
import { computePayroll, DEFAULT_OVERTIME_RULES, WEEKDAY_KEYS, type EmployeeTerms, type OvertimeRuleConfig, type OvertimeTier, type PayrollResult } from "./payrollRules";
import { localDateKey } from "./stockholmTime";

// Läser en sparad regelkonfiguration säkert; saknade fält får standardvärden.
export function normalizeRules(config: Record<string, unknown> | null | undefined): OvertimeRuleConfig {
  const base = DEFAULT_OVERTIME_RULES;
  if (!config) return base;
  const tiers = Array.isArray(config.tiers)
    ? (config.tiers as Record<string, unknown>[])
        .filter((tier) => typeof tier.key === "string" && tier.key)
        .map((tier): OvertimeTier => ({ key: String(tier.key), label: String(tier.label ?? tier.key), upToMinutes: tier.upToMinutes === null || tier.upToMinutes === undefined ? null : Number(tier.upToMinutes) }))
    : base.tiers;
  const autoBreak = (config.autoBreak ?? {}) as Record<string, unknown>;
  return {
    version: 1,
    dayBucketing: config.dayBucketing === "split_midnight" ? "split_midnight" : "start_day",
    tierScope: config.tierScope === "week" ? "week" : "day",
    weeklyOrdinaryLimitMinutes: config.weeklyOrdinaryLimitMinutes === null || config.weeklyOrdinaryLimitMinutes === undefined ? null : Number(config.weeklyOrdinaryLimitMinutes),
    tiers,
    dayTypeTierKey: (config.dayTypeTierKey as OvertimeRuleConfig["dayTypeTierKey"]) ?? {},
    treatHolidayEveAsHoliday: Boolean(config.treatHolidayEveAsHoliday),
    holidayScheduledZero: config.holidayScheduledZero === undefined ? base.holidayScheduledZero : Boolean(config.holidayScheduledZero),
    autoBreak: {
      enabled: Boolean(autoBreak.enabled),
      afterMinutes: Number(autoBreak.afterMinutes ?? base.autoBreak.afterMinutes),
      deductMinutes: Number(autoBreak.deductMinutes ?? base.autoBreak.deductMinutes),
      onlyIfNoBreakRegistered: autoBreak.onlyIfNoBreakRegistered === undefined ? true : Boolean(autoBreak.onlyIfNoBreakRegistered),
    },
  };
}

// Returnerar felmeddelanden om en regelkonfiguration är orimlig.
export function validateRules(rules: OvertimeRuleConfig): string[] {
  const errors: string[] = [];
  const keys = new Set<string>();
  let previous = 0;
  if (rules.tiers.length === 0) errors.push("Minst en övertidsnivå krävs.");
  rules.tiers.forEach((tier, index) => {
    if (!tier.key.trim()) errors.push(`Övertidsnivå ${index + 1} saknar nyckel.`);
    if (keys.has(tier.key)) errors.push(`Nivånyckeln "${tier.key}" används flera gånger.`);
    keys.add(tier.key);
    if (tier.upToMinutes !== null) {
      if (!Number.isFinite(tier.upToMinutes) || tier.upToMinutes <= 0) errors.push(`Nivå "${tier.label}" måste ha en gräns över 0 minuter eller vara obegränsad.`);
      else if (tier.upToMinutes <= previous) errors.push(`Nivå "${tier.label}" måste ha högre gräns än föregående nivå.`);
      else previous = tier.upToMinutes;
    } else if (index < rules.tiers.length - 1) {
      errors.push(`Endast sista nivån kan vara obegränsad ("${tier.label}").`);
    }
  });
  if (rules.weeklyOrdinaryLimitMinutes !== null && !(rules.weeklyOrdinaryLimitMinutes > 0)) errors.push("Veckogränsen måste vara större än 0.");
  if (rules.autoBreak.enabled && !(rules.autoBreak.afterMinutes > 0 && rules.autoBreak.deductMinutes > 0)) errors.push("Automatiskt rastavdrag kräver gräns och avdrag större än 0.");
  return errors;
}

export function termsVersionsFor(userId: string, terms: EmployeeTermsRow[], ruleSets: OvertimeRuleSetRow[]): EmployeeTerms[] {
  return terms
    .filter((row) => row.user_id === userId)
    .map((row) => {
      const ruleSet = ruleSets.find((r) => r.id === row.rule_set_id);
      const schedule = Object.fromEntries(WEEKDAY_KEYS.map((day) => [day, Number(row.schedule?.[day] ?? 0)])) as EmployeeTerms["schedule"];
      return { validFrom: row.valid_from, schedule, rules: normalizeRules(ruleSet?.config) };
    });
}

export interface EmployeePayrollInput {
  userId: string;
  periodStart: string;
  periodEnd: string;
  entries: AttendanceEntry[];
  absences: AttendanceAbsence[];
  terms: EmployeeTermsRow[];
  ruleSets: OvertimeRuleSetRow[];
}

export function computeEmployeePayroll(input: EmployeePayrollInput): PayrollResult & { hasTerms: boolean } {
  const versions = termsVersionsFor(input.userId, input.terms, input.ruleSets);
  const spans = input.entries
    .filter((e) => e.user_id === input.userId)
    .map((e) => ({ id: e.id, type: e.entry_type, start: e.start_time, end: e.end_time }));
  const result = computePayroll({
    periodStart: input.periodStart,
    periodEnd: input.periodEnd,
    spans: spans.filter((span) => {
      const date = localDateKey(span.start);
      // Pass strax före perioden behövs för veckoackumulering och midnattsdelning.
      return date >= addDays(input.periodStart, -7) && date <= addDays(input.periodEnd, 1);
    }),
    absences: input.absences.filter((a) => a.user_id === input.userId).map((a) => ({ date: a.absence_date, kind: a.kind, minutes: a.minutes })),
    termsVersions: versions,
  });
  return { ...result, hasTerms: versions.length > 0 };
}

// Skäl till att ett underlag inte går att beräkna tillförlitligt. Attest och export blockeras om listan inte är tom.
// Servern (payroll_verify_computation i 0029) kontrollerar samma saker oberoende av klienten.
export function payrollBlockers(args: {
  userId: string;
  result: PayrollResult & { hasTerms: boolean };
  terms: EmployeeTermsRow[];
  ruleSets: OvertimeRuleSetRow[];
}): string[] {
  const blockers = new Set<string>();
  const rows = args.terms.filter((t) => t.user_id === args.userId);
  for (const day of args.result.days) {
    if (!(day.workedMinutes > 0 || Object.keys(day.absence).length > 0)) continue;
    const row = rows.filter((t) => t.valid_from <= day.date).sort((a, b) => (a.valid_from < b.valid_from ? 1 : -1))[0];
    if (!row) {
      blockers.add(`Schema och regler saknas för ${day.date}. Ställ in dem under Inställningar → Lön.`);
      continue;
    }
    const ruleSet = args.ruleSets.find((r) => r.id === row.rule_set_id);
    if (!ruleSet) blockers.add(`Regelmall saknas för ${day.date}.`);
    else if (!ruleSet.approved_at) blockers.add(`Regelmallen "${ruleSet.name}" är inte godkänd av admin. Löneunderlag kan inte attesteras förrän reglerna bekräftats.`);
    else if (validateRules(normalizeRules(ruleSet.config)).length > 0) blockers.add(`Regelmallen "${ruleSet.name}" är ogiltig.`);
  }
  if (args.result.totals.openEntryIds.length > 0) blockers.add("Det finns en pågående stämpling i perioden.");
  return [...blockers];
}

function addDays(date: string, days: number) {
  const [y, m, d] = date.split("-").map(Number);
  const next = new Date(Date.UTC(y, m - 1, d + days));
  return `${next.getUTCFullYear()}-${String(next.getUTCMonth() + 1).padStart(2, "0")}-${String(next.getUTCDate()).padStart(2, "0")}`;
}

// Alla interna tidstyper som kan förekomma i underlaget, för lönekodsmappning.
export function internalTimeTypes(ruleSets: OvertimeRuleSetRow[], extra: string[] = []): { key: string; label: string }[] {
  const map = new Map<string, string>([["ordinary", "Ordinarie arbetstid"]]);
  for (const set of ruleSets) {
    const rules = normalizeRules(set.config);
    for (const tier of rules.tiers) map.set(tier.key, tier.label);
    for (const key of Object.values(rules.dayTypeTierKey)) if (key && !map.has(key)) map.set(key, key);
  }
  const absenceLabels: Record<string, string> = {
    absence_sick: "Sjukfrånvaro", absence_vab: "VAB", absence_vacation: "Semester", absence_leave: "Ledighet", absence_other: "Annan frånvaro",
  };
  for (const [key, label] of Object.entries(absenceLabels)) map.set(key, label);
  for (const key of extra) if (!map.has(key)) map.set(key, key);
  return [...map.entries()].map(([key, label]) => ({ key, label }));
}
