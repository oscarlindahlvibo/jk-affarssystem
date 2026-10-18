import { describe, expect, it } from "vitest";
import {
  computePayroll,
  DEFAULT_OVERTIME_RULES,
  termsFor,
  type AttendanceSpan,
  type EmployeeTerms,
  type OvertimeRuleConfig,
} from "./payrollRules";
import { zonedTimeToUtc } from "./stockholmTime";

const at = (date: string, time: string) => zonedTimeToUtc(date, time).toISOString();

function span(id: string, type: AttendanceSpan["type"], startDate: string, startTime: string, endDate: string, endTime: string): AttendanceSpan {
  return { id, type, start: at(startDate, startTime), end: at(endDate, endTime) };
}

const FULL_WEEK = { mon: 480, tue: 480, wed: 480, thu: 480, fri: 480, sat: 0, sun: 0 };

function terms(overrides: Partial<OvertimeRuleConfig> = {}, schedule = FULL_WEEK, validFrom = "2026-01-01"): EmployeeTerms {
  return { validFrom, schedule, rules: { ...DEFAULT_OVERTIME_RULES, ...overrides } };
}

function run(spans: AttendanceSpan[], t: EmployeeTerms[], start = "2026-10-12", end = "2026-10-18", absences: { date: string; kind: string; minutes: number }[] = []) {
  return computePayroll({ periodStart: start, periodEnd: end, spans, absences, termsVersions: t });
}

describe("computePayroll: grundfall", () => {
  it("räknar normal arbetsdag med lunch (07:00-17:00, lunch 30 min = 9,5 h)", () => {
    const result = run(
      [
        span("a", "work", "2026-10-12", "07:00", "2026-10-12", "12:00"),
        span("b", "lunch", "2026-10-12", "12:00", "2026-10-12", "12:30"),
        span("c", "work", "2026-10-12", "12:30", "2026-10-12", "17:00"),
      ],
      [terms()]
    );
    const monday = result.days.find((d) => d.date === "2026-10-12")!;
    expect(monday.workedMinutes).toBe(570);
    expect(monday.breakMinutes).toBe(30);
    expect(monday.ordinaryMinutes).toBe(480);
    expect(monday.overtime).toEqual({ overtime_1: 90 });
    expect(result.totals.workedMinutes).toBe(570);
  });

  it("lägger övertid på nivåer per dag", () => {
    const result = run([span("a", "work", "2026-10-13", "06:00", "2026-10-13", "18:00")], [terms()]);
    const tuesday = result.days.find((d) => d.date === "2026-10-13")!;
    expect(tuesday.ordinaryMinutes).toBe(480);
    expect(tuesday.overtime).toEqual({ overtime_1: 120, overtime_2: 120 });
  });

  it("räknar inte övertid enbart för att veckan passerar 40 timmar när dagarna ryms i schemat", () => {
    const spans = ["12", "13", "14", "15", "16"].map((d) => span(`s${d}`, "work", `2026-10-${d}`, "08:00", `2026-10-${d}`, "16:00"));
    const result = run(spans, [terms()]);
    expect(result.totals.ordinaryMinutes).toBe(2400);
    expect(result.totals.overtime).toEqual({});
  });

  it("tillämpar individuellt schema (fyradagarsvecka) så att arbete på ledig dag blir övertid", () => {
    const fourDay = { mon: 600, tue: 600, wed: 600, thu: 600, fri: 0, sat: 0, sun: 0 };
    const result = run([span("a", "work", "2026-10-16", "08:00", "2026-10-16", "16:00")], [terms({}, fourDay)]);
    const friday = result.days.find((d) => d.date === "2026-10-16")!;
    expect(friday.scheduledMinutes).toBe(0);
    expect(friday.ordinaryMinutes).toBe(0);
    expect(friday.overtime).toEqual({ overtime_1: 120, overtime_2: 360 });
  });
});

describe("computePayroll: dagstyper och nivåer", () => {
  it("lägger lördagsarbete på egen nivå när regeln anger det", () => {
    const rules = { dayTypeTierKey: { saturday: "overtime_weekend" } };
    const result = run([span("a", "work", "2026-10-17", "08:00", "2026-10-17", "12:00")], [terms(rules)]);
    expect(result.totals.overtime).toEqual({ overtime_weekend: 240 });
    expect(result.totals.ordinaryMinutes).toBe(0);
  });

  it("behandlar röd dag som oschemalagd även när veckodagen normalt är arbetsdag", () => {
    // 2026-05-01 är en fredag och Första maj.
    const result = run([span("a", "work", "2026-05-01", "08:00", "2026-05-01", "12:00")], [terms({ dayTypeTierKey: { holiday: "overtime_holiday" } })], "2026-04-27", "2026-05-03");
    const day = result.days.find((d) => d.date === "2026-05-01")!;
    expect(day.dayType).toBe("holiday");
    expect(day.holidayName).toBe("Första maj");
    expect(day.scheduledMinutes).toBe(0);
    expect(day.overtime).toEqual({ overtime_holiday: 240 });
  });

  it("kan räkna nivåer ackumulerat per vecka", () => {
    const rules = { tierScope: "week" as const };
    const spans = [
      span("a", "work", "2026-10-12", "08:00", "2026-10-12", "17:30"), // 90 min övertid
      span("b", "work", "2026-10-13", "08:00", "2026-10-13", "17:30"), // 90 min övertid
    ];
    const result = run(spans, [terms(rules)]);
    expect(result.days.find((d) => d.date === "2026-10-12")!.overtime).toEqual({ overtime_1: 90 });
    expect(result.days.find((d) => d.date === "2026-10-13")!.overtime).toEqual({ overtime_1: 30, overtime_2: 60 });
  });

  it("räknar veckonivåer rätt även när löneperioden börjar mitt i veckan", () => {
    const rules = { tierScope: "week" as const };
    const spans = [
      span("a", "work", "2026-10-12", "08:00", "2026-10-12", "17:40"), // måndag, före perioden: 100 min
      span("b", "work", "2026-10-14", "08:00", "2026-10-14", "17:00"), // onsdag, i perioden: 60 min
    ];
    const result = run(spans, [terms(rules)], "2026-10-14", "2026-10-18");
    expect(result.days.map((d) => d.date)[0]).toBe("2026-10-14");
    expect(result.days[0].overtime).toEqual({ overtime_1: 20, overtime_2: 40 });
    expect(result.totals.overtime).toEqual({ overtime_1: 20, overtime_2: 40 });
  });

  it("flyttar ordinarie tid över en konfigurerad veckogräns till övertid", () => {
    const longDays = { mon: 540, tue: 540, wed: 540, thu: 540, fri: 540, sat: 0, sun: 0 };
    const spans = ["12", "13", "14", "15", "16"].map((d) => span(`s${d}`, "work", `2026-10-${d}`, "07:00", `2026-10-${d}`, "16:00"));
    const result = run(spans, [terms({ weeklyOrdinaryLimitMinutes: 2400 }, longDays)]);
    expect(result.totals.ordinaryMinutes).toBe(2400);
    expect(result.totals.overtime).toEqual({ overtime_1: 120, overtime_2: 180 });
  });
});

describe("computePayroll: pass över midnatt och tidsomställningar", () => {
  const night = [span("n", "work", "2026-10-12", "22:00", "2026-10-13", "06:00")];

  it("lägger hela natt-passet på startdagen när det är inställt", () => {
    const result = run(night, [terms({ dayBucketing: "start_day" })]);
    expect(result.days.find((d) => d.date === "2026-10-12")!.workedMinutes).toBe(480);
    expect(result.days.find((d) => d.date === "2026-10-13")!.workedMinutes).toBe(0);
  });

  it("delar passet vid midnatt när det är inställt", () => {
    const result = run(night, [terms({ dayBucketing: "split_midnight" })]);
    expect(result.days.find((d) => d.date === "2026-10-12")!.workedMinutes).toBe(120);
    expect(result.days.find((d) => d.date === "2026-10-13")!.workedMinutes).toBe(360);
    expect(result.totals.workedMinutes).toBe(480);
  });

  it("räknar verklig tid över sommartidens start (nattpass blir 7 h)", () => {
    const result = run([span("n", "work", "2026-03-28", "22:00", "2026-03-29", "06:00")], [terms()], "2026-03-23", "2026-03-29");
    expect(result.totals.workedMinutes).toBe(420);
  });

  it("räknar verklig tid över vintertidens start (nattpass blir 9 h)", () => {
    const result = run([span("n", "work", "2026-10-24", "22:00", "2026-10-25", "06:00")], [terms()], "2026-10-19", "2026-10-25");
    expect(result.totals.workedMinutes).toBe(540);
  });

  it("delar vintertidsdygnet korrekt vid midnatt (25-timmarsdygn)", () => {
    const result = run([span("n", "work", "2026-10-24", "22:00", "2026-10-25", "06:00")], [terms({ dayBucketing: "split_midnight" })], "2026-10-19", "2026-10-25");
    expect(result.days.find((d) => d.date === "2026-10-24")!.workedMinutes).toBe(120);
    expect(result.days.find((d) => d.date === "2026-10-25")!.workedMinutes).toBe(420);
  });
});

describe("computePayroll: frånvaro, rast och scheman som ändras", () => {
  it("redovisar frånvaro separat och räknar inte frånvarodagen som arbetad tid", () => {
    const result = run([], [terms()], "2026-10-12", "2026-10-18", [{ date: "2026-10-13", kind: "absence_sick", minutes: 480 }]);
    expect(result.totals.absence).toEqual({ absence_sick: 480 });
    expect(result.totals.workedMinutes).toBe(0);
    expect(result.totals.days).toBe(1);
  });

  it("sänker gränsen för övertid med delvis frånvaro samma dag", () => {
    const result = run([span("a", "work", "2026-10-13", "08:00", "2026-10-13", "16:00")], [terms()], "2026-10-12", "2026-10-18", [
      { date: "2026-10-13", kind: "absence_vab", minutes: 120 },
    ]);
    const day = result.days.find((d) => d.date === "2026-10-13")!;
    expect(day.ordinaryMinutes).toBe(360);
    expect(day.overtime).toEqual({ overtime_1: 120 });
  });

  it("drar av rast automatiskt endast när ingen rast registrerats och regeln är på", () => {
    const auto = { autoBreak: { enabled: true, afterMinutes: 300, deductMinutes: 30, onlyIfNoBreakRegistered: true } };
    const withoutBreak = run([span("a", "work", "2026-10-12", "08:00", "2026-10-12", "16:00")], [terms(auto)]);
    expect(withoutBreak.days.find((d) => d.date === "2026-10-12")!.workedMinutes).toBe(450);
    const withLunch = run(
      [span("a", "work", "2026-10-12", "08:00", "2026-10-12", "16:00"), span("l", "lunch", "2026-10-12", "12:00", "2026-10-12", "12:30")],
      [terms(auto)]
    );
    expect(withLunch.days.find((d) => d.date === "2026-10-12")!.workedMinutes).toBe(480);
  });

  it("använder den schemaversion som gäller för respektive dag", () => {
    const fourDay = { mon: 600, tue: 600, wed: 600, thu: 600, fri: 0, sat: 0, sun: 0 };
    const versions = [terms({}, FULL_WEEK, "2026-01-01"), terms({}, fourDay, "2026-10-15")];
    expect(termsFor("2026-10-14", versions)!.validFrom).toBe("2026-01-01");
    expect(termsFor("2026-10-15", versions)!.validFrom).toBe("2026-10-15");
    const spans = [span("a", "work", "2026-10-09", "08:00", "2026-10-09", "16:00"), span("b", "work", "2026-10-16", "08:00", "2026-10-16", "16:00")];
    const result = run(spans, versions, "2026-10-05", "2026-10-18");
    expect(result.days.find((d) => d.date === "2026-10-09")!.ordinaryMinutes).toBe(480);
    expect(result.days.find((d) => d.date === "2026-10-16")!.ordinaryMinutes).toBe(0);
    expect(result.days.find((d) => d.date === "2026-10-16")!.workedMinutes).toBe(480);
  });

  it("flaggar pågående pass och dagar utan gällande schema utan att räkna dem", () => {
    const open: AttendanceSpan = { id: "o", type: "work", start: at("2026-10-12", "08:00"), end: null };
    const result = run([open], [terms()]);
    expect(result.totals.openEntryIds).toEqual(["o"]);
    expect(result.totals.workedMinutes).toBe(0);
    const noTerms = run([span("a", "work", "2026-10-12", "08:00", "2026-10-12", "16:00")], []);
    expect(noTerms.days.find((d) => d.date === "2026-10-12")!.notes.join(" ")).toContain("Saknar gällande schema");
  });
});
