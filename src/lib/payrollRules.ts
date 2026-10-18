// Beräkning av ordinarie arbetstid och övertid utifrån attesterad närvarotid, individuellt schema
// och konfigurerbara regler. Inga avtalsregler är hårdkodade: allt styrs av OvertimeRuleConfig
// och de schemaversioner som gäller för respektive datum.
import {
  addDays,
  compareDateKeys,
  eachDate,
  isoWeekday,
  localDateKey,
  minutesBetweenInstants,
  PAYROLL_TIME_ZONE,
  startOfIsoWeek,
  startOfLocalDay,
} from "./stockholmTime";
import { holidayOn } from "./swedishHolidays";

export type WeekdayKey = "mon" | "tue" | "wed" | "thu" | "fri" | "sat" | "sun";
export const WEEKDAY_KEYS: WeekdayKey[] = ["mon", "tue", "wed", "thu", "fri", "sat", "sun"];

export type DayType = "weekday" | "saturday" | "sunday" | "holiday" | "holiday_eve";

export interface OvertimeTier {
  key: string;
  label: string;
  // Antal minuter övertid som omfattas av nivån (inom dag eller vecka beroende på tierScope). null = resten.
  upToMinutes: number | null;
}

export interface OvertimeRuleConfig {
  version: 1;
  // Hur pass över midnatt fördelas på dagar: hela passet på startdagen, eller delat vid midnatt.
  dayBucketing: "start_day" | "split_midnight";
  // Om övertidsnivåerna räknas per dag eller ackumulerat per vecka.
  tierScope: "day" | "week";
  // Valfri veckogräns: ordinarie tid över gränsen (minuter/vecka) blir övertid. null = av.
  weeklyOrdinaryLimitMinutes: number | null;
  tiers: OvertimeTier[];
  // Hela övertiden på dagar av viss typ kan läggas på en egen nivå (nyckel från tiers eller egen kod).
  dayTypeTierKey: Partial<Record<Exclude<DayType, "weekday">, string | null>>;
  // Helgdagsaftnar behandlas som helgdag när detta är på.
  treatHolidayEveAsHoliday: boolean;
  // Schemalagd tid på helgdag räknas som 0 (arbete på röd dag blir då övertid/extra tid).
  holidayScheduledZero: boolean;
  autoBreak: { enabled: boolean; afterMinutes: number; deductMinutes: number; onlyIfNoBreakRegistered: boolean };
}

export const DEFAULT_OVERTIME_RULES: OvertimeRuleConfig = {
  version: 1,
  dayBucketing: "start_day",
  tierScope: "day",
  weeklyOrdinaryLimitMinutes: null,
  tiers: [
    { key: "overtime_1", label: "Övertid 1", upToMinutes: 120 },
    { key: "overtime_2", label: "Övertid 2", upToMinutes: null },
  ],
  dayTypeTierKey: {},
  treatHolidayEveAsHoliday: false,
  holidayScheduledZero: true,
  autoBreak: { enabled: false, afterMinutes: 300, deductMinutes: 30, onlyIfNoBreakRegistered: true },
};

export interface EmployeeTerms {
  validFrom: string;
  // Schemalagd arbetstid i minuter per veckodag (individuellt schema).
  schedule: Record<WeekdayKey, number>;
  rules: OvertimeRuleConfig;
}

export interface AttendanceSpan {
  id: string;
  type: "work" | "break" | "lunch";
  start: string;
  end: string | null;
}

export interface AbsenceInput {
  date: string;
  kind: string;
  minutes: number;
}

export interface PayrollDay {
  date: string;
  dayType: DayType;
  holidayName: string | null;
  scheduledMinutes: number;
  workedMinutes: number;
  breakMinutes: number;
  ordinaryMinutes: number;
  overtime: Record<string, number>;
  absence: Record<string, number>;
  notes: string[];
  entryIds: string[];
}

export interface PayrollTotals {
  days: number;
  scheduledMinutes: number;
  workedMinutes: number;
  breakMinutes: number;
  ordinaryMinutes: number;
  overtime: Record<string, number>;
  absence: Record<string, number>;
  openEntryIds: string[];
}

export interface PayrollResult {
  days: PayrollDay[];
  totals: PayrollTotals;
}

export function termsFor(date: string, versions: EmployeeTerms[]): EmployeeTerms | null {
  let best: EmployeeTerms | null = null;
  for (const version of versions) {
    if (compareDateKeys(version.validFrom, date) <= 0 && (!best || compareDateKeys(version.validFrom, best.validFrom) > 0)) best = version;
  }
  return best;
}

export function dayTypeOf(date: string, rules: OvertimeRuleConfig): { type: DayType; holidayName: string | null } {
  const holiday = holidayOn(date);
  if (holiday && (holiday.kind === "holiday" || rules.treatHolidayEveAsHoliday)) {
    return { type: holiday.kind === "holiday" ? "holiday" : "holiday_eve", holidayName: holiday.name };
  }
  if (holiday?.kind === "eve") return { type: "holiday_eve", holidayName: holiday.name };
  const weekday = isoWeekday(date);
  if (weekday === 6) return { type: "saturday", holidayName: null };
  if (weekday === 7) return { type: "sunday", holidayName: null };
  return { type: "weekday", holidayName: null };
}

interface DayBucket {
  worked: number;
  breakMinutes: number;
  entryIds: Set<string>;
}

function addToBucket(buckets: Map<string, DayBucket>, date: string, type: AttendanceSpan["type"], minutes: number, id: string) {
  if (minutes <= 0) return;
  const bucket = buckets.get(date) ?? { worked: 0, breakMinutes: 0, entryIds: new Set<string>() };
  if (type === "work") bucket.worked += minutes;
  else bucket.breakMinutes += minutes;
  bucket.entryIds.add(id);
  buckets.set(date, bucket);
}

function bucketSpans(spans: AttendanceSpan[], bucketing: OvertimeRuleConfig["dayBucketing"], timeZone: string) {
  const buckets = new Map<string, DayBucket>();
  const open: string[] = [];
  for (const span of spans) {
    if (!span.end) {
      open.push(span.id);
      continue;
    }
    const total = minutesBetweenInstants(span.start, span.end);
    const startDate = localDateKey(span.start, timeZone);
    if (bucketing === "start_day") {
      addToBucket(buckets, startDate, span.type, total, span.id);
      continue;
    }
    let cursor = new Date(span.start);
    const end = new Date(span.end);
    let date = startDate;
    while (cursor < end) {
      const nextMidnight = startOfLocalDay(addDays(date, 1), timeZone);
      const sliceEnd = nextMidnight < end ? nextMidnight : end;
      addToBucket(buckets, date, span.type, minutesBetweenInstants(cursor, sliceEnd), span.id);
      cursor = sliceEnd;
      date = addDays(date, 1);
    }
  }
  return { buckets, open };
}

// Fördelar övertid på nivåer. upToMinutes är en kumulativ gräns inom dag eller vecka;
// usedBefore är redan fördelad nivåövertid i samma omfång (0 vid dagsomfång).
function applyTiers(extra: number, tiers: OvertimeTier[], usedBefore: number): Record<string, number> {
  const result: Record<string, number> = {};
  let position = usedBefore;
  let remaining = extra;
  for (const tier of tiers) {
    if (remaining <= 0) break;
    const tierEnd = tier.upToMinutes === null ? Infinity : tier.upToMinutes;
    if (position >= tierEnd) continue;
    const take = Math.min(remaining, tierEnd - position);
    result[tier.key] = (result[tier.key] ?? 0) + take;
    position += take;
    remaining -= take;
  }
  if (remaining > 0 && tiers.length > 0) {
    const last = tiers[tiers.length - 1].key;
    result[last] = (result[last] ?? 0) + remaining;
  }
  return result;
}

export interface PayrollInput {
  periodStart: string;
  periodEnd: string;
  spans: AttendanceSpan[];
  absences: AbsenceInput[];
  termsVersions: EmployeeTerms[];
  timeZone?: string;
}

function emptyTotals(): PayrollTotals {
  return { days: 0, scheduledMinutes: 0, workedMinutes: 0, breakMinutes: 0, ordinaryMinutes: 0, overtime: {}, absence: {}, openEntryIds: [] };
}

function add(record: Record<string, number>, key: string, minutes: number) {
  if (minutes === 0) return;
  record[key] = (record[key] ?? 0) + minutes;
}

export function computePayroll(input: PayrollInput): PayrollResult {
  const timeZone = input.timeZone ?? PAYROLL_TIME_ZONE;
  // Veckoackumulering kräver hela veckan även när löneperioden börjar mitt i veckan.
  const calcStart = startOfIsoWeek(input.periodStart);
  const dates = eachDate(calcStart, input.periodEnd);
  const bucketing = (termsFor(input.periodEnd, input.termsVersions) ?? termsFor(input.periodStart, input.termsVersions))?.rules.dayBucketing ?? "start_day";
  const { buckets, open } = bucketSpans(input.spans, bucketing, timeZone);

  const absenceByDate = new Map<string, Record<string, number>>();
  for (const absence of input.absences) {
    const record = absenceByDate.get(absence.date) ?? {};
    add(record, absence.kind, absence.minutes);
    absenceByDate.set(absence.date, record);
  }

  const days: PayrollDay[] = [];
  let weekKey = "";
  let weekOrdinary = 0;
  let weekTierMinutes = 0;

  for (const date of dates) {
    const currentWeek = startOfIsoWeek(date);
    if (currentWeek !== weekKey) {
      weekKey = currentWeek;
      weekOrdinary = 0;
      weekTierMinutes = 0;
    }
    const terms = termsFor(date, input.termsVersions);
    const bucket = buckets.get(date);
    const absence = absenceByDate.get(date) ?? {};
    const inPeriod = compareDateKeys(date, input.periodStart) >= 0;
    const notes: string[] = [];

    if (!terms) {
      if (inPeriod && (bucket || Object.keys(absence).length > 0)) notes.push("Saknar gällande schema och regler för dagen.");
      if (inPeriod && (bucket || Object.keys(absence).length > 0 || compareDateKeys(date, input.periodEnd) <= 0)) {
        days.push({
          date,
          dayType: dayTypeOf(date, DEFAULT_OVERTIME_RULES).type,
          holidayName: dayTypeOf(date, DEFAULT_OVERTIME_RULES).holidayName,
          scheduledMinutes: 0,
          workedMinutes: bucket?.worked ?? 0,
          breakMinutes: bucket?.breakMinutes ?? 0,
          ordinaryMinutes: 0,
          overtime: {},
          absence,
          notes,
          entryIds: [...(bucket?.entryIds ?? [])],
        });
      }
      continue;
    }

    const { type: dayType, holidayName } = dayTypeOf(date, terms.rules);
    const isRedDay = dayType === "holiday" || (dayType === "holiday_eve" && terms.rules.treatHolidayEveAsHoliday);
    const scheduled = isRedDay && terms.rules.holidayScheduledZero ? 0 : terms.schedule[WEEKDAY_KEYS[isoWeekday(date) - 1]] ?? 0;
    let worked = bucket?.worked ?? 0;
    const breakMinutes = bucket?.breakMinutes ?? 0;

    const auto = terms.rules.autoBreak;
    if (auto.enabled && worked >= auto.afterMinutes && (!auto.onlyIfNoBreakRegistered || breakMinutes === 0)) {
      const deduction = Math.min(auto.deductMinutes, worked);
      worked -= deduction;
      notes.push(`Automatiskt rastavdrag ${deduction} min.`);
    }

    const absenceMinutes = Object.values(absence).reduce((sum, value) => sum + value, 0);
    const threshold = Math.max(scheduled - absenceMinutes, 0);
    let ordinary = Math.min(worked, threshold);
    let extra = Math.max(worked - threshold, 0);

    if (terms.rules.weeklyOrdinaryLimitMinutes !== null) {
      const room = Math.max(terms.rules.weeklyOrdinaryLimitMinutes - weekOrdinary, 0);
      if (ordinary > room) {
        extra += ordinary - room;
        ordinary = room;
        notes.push("Ordinarie tid över veckogränsen räknas som övertid.");
      }
    }
    weekOrdinary += ordinary;

    const overtime: Record<string, number> = {};
    if (extra > 0) {
      const overrideKey = dayType === "weekday" ? null : terms.rules.dayTypeTierKey[dayType] ?? null;
      if (overrideKey) {
        add(overtime, overrideKey, extra);
      } else {
        const classified = applyTiers(extra, terms.rules.tiers, terms.rules.tierScope === "week" ? weekTierMinutes : 0);
        for (const [key, minutes] of Object.entries(classified)) add(overtime, key, minutes);
        weekTierMinutes += extra;
      }
    }

    if (inPeriod) {
      days.push({
        date,
        dayType,
        holidayName,
        scheduledMinutes: scheduled,
        workedMinutes: worked,
        breakMinutes,
        ordinaryMinutes: ordinary,
        overtime,
        absence,
        notes,
        entryIds: [...(bucket?.entryIds ?? [])],
      });
    }
  }

  const totals = emptyTotals();
  totals.openEntryIds = open;
  for (const day of days) {
    totals.days += day.workedMinutes > 0 || Object.keys(day.absence).length > 0 ? 1 : 0;
    totals.scheduledMinutes += day.scheduledMinutes;
    totals.workedMinutes += day.workedMinutes;
    totals.breakMinutes += day.breakMinutes;
    totals.ordinaryMinutes += day.ordinaryMinutes;
    for (const [key, minutes] of Object.entries(day.overtime)) add(totals.overtime, key, minutes);
    for (const [key, minutes] of Object.entries(day.absence)) add(totals.absence, key, minutes);
  }
  return { days: days.filter((day) => compareDateKeys(day.date, input.periodStart) >= 0), totals };
}
